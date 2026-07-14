@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialPositionId
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.dto.EventParticipantsRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.testing.MOBILE_TEST_HOST_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_HOST_PASSWORD
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_PASSWORD
import com.razumly.mvp.testing.MobileApiTestSession
import com.razumly.mvp.testing.mobileApiLoginFixturesReady
import com.razumly.mvp.testing.runTargetedBackendSeed
import com.razumly.mvp.testing.shouldAutoSeedBackendFixtures
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.math.min
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class EventLifecycleMobileApiIntegrationTest {
    private val createdEventIds = mutableListOf<String>()
    private val createdTeamIds = mutableListOf<String>()
    private var hostSession: MobileApiTestSession? = null
    private var participantSession: MobileApiTestSession? = null

    @Before
    fun ensureBackendFixtures() {
        if (backendFixturesReady()) return

        val fixturesPrepared = if (shouldAutoSeedBackendFixtures()) {
            runCatching {
                runTargetedBackendSeed()
                backendFixturesReady()
            }.getOrDefault(false)
        } else {
            false
        }

        assumeTrue(
            "Skipping mobile/backend event lifecycle integration test because backend fixtures are unavailable. " +
                "Automatic backend seeding is disabled unless MVP_TEST_ALLOW_DB_SEED=1.",
            fixturesPrepared,
        )
    }

    @After
    fun tearDown() {
        runCatching {
            runBlocking {
                val host = hostSession
                createdEventIds.asReversed().forEach { eventId ->
                    host?.deleteEvent(eventId)
                }
                createdTeamIds.asReversed().forEach { teamId ->
                    host?.deleteTeam(teamId)
                }
            }
        }
        hostSession?.close()
        participantSession?.close()
        hostSession = null
        participantSession = null
        createdEventIds.clear()
        createdTeamIds.clear()
    }

    @Test
    fun event_lifecycle_matrix_creates_joins_schedules_and_updates_matches() = runTest(timeout = 15.minutes) {
        hostSession = MobileApiTestSession.create()
        participantSession = MobileApiTestSession.create()

        val host = hostSession!!
        val participant = participantSession!!
        val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
        participant.userRepository.login(PARTICIPANT_EMAIL, PARTICIPANT_PASSWORD).getOrThrow()

        val runId = "mobile_api_lifecycle_${Clock.System.now().toEpochMilliseconds()}"
        val variants = buildLifecycleVariants(runId = runId, hostUserId = hostUser.id)
        val matchesByVariant = mutableMapOf<String, List<MatchMVP>>()
        val createdEvents = mutableListOf<Event>()

        variants.forEach { variant ->
            host.deleteEvent(variant.event.id)
            createdEventIds += variant.event.id

            val createdEvent = host.eventRepository.createEvent(
                newEvent = variant.event,
                fields = variant.fields,
                timeSlots = variant.timeSlots,
            ).getOrElse { error ->
                error("Failed to create ${variant.key}: ${error.backendSummary()}")
            }

            createdEvents += createdEvent
            assertCreatedEventShape(variant = variant, event = createdEvent)

            val participantLoadedEvent = participant.eventRepository.getEvent(createdEvent.id).getOrThrow()
            assertEventResourcesPersisted(
                participant = participant,
                variant = variant,
                loadedEvent = participantLoadedEvent,
            )

            val joinResult = participant.eventRepository.addCurrentUserToEvent(
                event = participantLoadedEvent,
                preferredDivisionId = participantLoadedEvent.divisions.firstOrNull() ?: variant.primaryDivisionId,
                occurrence = variant.occurrence,
            ).getOrElse { error ->
                error("Failed to join ${variant.key}: ${error.backendSummary()}")
            }
            assertFalse(joinResult.requiresParentApproval, "${variant.key} should not require parent approval")
            assertFalse(joinResult.joinedWaitlist, "${variant.key} should not join the waitlist")

            if (variant.event.autoCreatePointMatchIncidents) {
                registerRosterTeamsForPointIncidentVariant(
                    host = host,
                    variant = variant,
                    event = createdEvent,
                    hostUserId = hostUser.id,
                )
            }

            if (variant.event.eventType.isSchedulable()) {
                val scheduledEvent = host.eventRepository.scheduleEvent(createdEvent.id).getOrElse { error ->
                    error("Failed to schedule ${variant.key}: ${error.backendSummary()}")
                }
                assertCreatedEventShape(variant = variant, event = scheduledEvent)

                val matches = host.matchRepository.getMatchesOfTournament(createdEvent.id).getOrElse { error ->
                    error("Failed to load matches for ${variant.key}: ${error.backendSummary()}")
                }
                assertTrue(matches.isNotEmpty(), "${variant.key} should produce scheduled matches")
                assertTrue(
                    matches.any { match -> !match.team1Id.isNullOrBlank() && !match.team2Id.isNullOrBlank() },
                    "${variant.key} should schedule at least one match with both teams assigned",
                )
                matchesByVariant[variant.key] = matches
            }
        }

        val scoreMatches = matchesByVariant.getValue(KEY_LEAGUE_SINGLE_NO_PLAYOFFS)
        updateMatchWithoutPointIncident(host = host, matches = scoreMatches)

        val incidentMatches = matchesByVariant.getValue(KEY_TOURNAMENT_SPLIT_NO_POOLS)
        updateMatchWithPointIncident(host = host, matches = incidentMatches)

        val batchEvents = participant.eventRepository.getEventsByIds(createdEvents.map(Event::id)).getOrThrow()
        assertEquals(createdEvents.map(Event::id).toSet(), batchEvents.map(Event::id).toSet())
    }

    private suspend fun updateMatchWithoutPointIncident(
        host: MobileApiTestSession,
        matches: List<MatchMVP>,
    ) {
        val match = matches.firstPlayableMatch()
        val teamId = requireNotNull(match.team1Id) { "Direct score test requires team1Id" }
        val segment = match.segments.minByOrNull { segment -> segment.sequence }
        val beforeIncidentCount = match.incidents.size

        val updated = host.matchRepository.setMatchScore(
            match = match,
            segmentId = segment?.id,
            sequence = segment?.sequence ?: 1,
            eventTeamId = teamId,
            points = DIRECT_SCORE_POINTS,
        ).getOrThrow()

        assertSegmentScore(
            match = updated,
            eventTeamId = teamId,
            expected = DIRECT_SCORE_POINTS,
            message = "Direct score update should persist without point incidents.",
        )
        assertEquals(
            beforeIncidentCount,
            updated.incidents.size,
            "Direct score update should not create match point incidents for this event.",
        )
    }

    private suspend fun registerRosterTeamsForPointIncidentVariant(
        host: MobileApiTestSession,
        variant: LifecycleVariant,
        event: Event,
        hostUserId: String,
    ) {
        val divisionIds = variant.event.divisions.ifEmpty { listOf(variant.primaryDivisionId) }
        val registrationDivisionIds = divisionIds.flatMap { divisionId -> listOf(divisionId, divisionId) }
        registrationDivisionIds.forEachIndexed { index, divisionId ->
            val team = host.teamRepository.createTeam(
                Team(hostUserId).copy(
                    name = "Mobile Incident Team ${index + 1}",
                    division = divisionId,
                    sport = variant.event.sportId,
                    teamSize = 2,
                ).withSynchronizedMembership(),
            ).getOrElse { error ->
                error("Failed to create incident roster team ${index + 1}: ${error.backendSummary()}")
            }
            createdTeamIds += team.id

            val response = host.api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                path = "api/events/${event.id}/participants",
                body = EventParticipantsRequestDto(
                    teamId = team.id,
                    divisionId = divisionId,
                    slotId = variant.occurrence?.slotId,
                    occurrenceDate = variant.occurrence?.occurrenceDate,
                ),
            )
            response.error?.takeIf(String::isNotBlank)?.let { message ->
                error("Failed to register incident roster team ${team.id}: $message")
            }
        }
    }

    private suspend fun updateMatchWithPointIncident(
        host: MobileApiTestSession,
        matches: List<MatchMVP>,
    ) {
        val incidentTarget = selectPointIncidentTarget(host = host, matches = matches)
        val match = incidentTarget.match
        val teamId = incidentTarget.eventTeamId
        val segment = requireNotNull(match.segments.minByOrNull { segment -> segment.sequence }) {
            "Point incident test requires scheduled match segments"
        }
        val incidentId = "${match.id}_mobile_point_incident"

        val updated = host.matchRepository.addMatchIncident(
            match = match,
            operation = MatchIncidentOperationDto(
                action = "CREATE",
                id = incidentId,
                segmentId = segment.id,
                eventTeamId = teamId,
                eventRegistrationId = incidentTarget.eventRegistrationId,
                participantUserId = incidentTarget.participantUserId.takeIf {
                    incidentTarget.eventRegistrationId.isNullOrBlank()
                },
                incidentType = "POINT",
                sequence = 1,
                linkedPointDelta = 1,
                note = "Mobile lifecycle point incident",
            ),
        ).getOrElse { error ->
            error("Failed to add point incident: ${error.backendSummary()}")
        }

        assertTrue(
            updated.incidents.any { incident ->
                incident.id == incidentId ||
                    incident.linkedPointDelta == 1 && incident.eventTeamId == teamId
            },
            "Point incident update should persist the scoring incident.",
        )
        assertSegmentScore(
            match = updated,
            eventTeamId = teamId,
            expected = 1,
            message = "Point incident should increment the selected team's segment score.",
        )
    }

    private suspend fun selectPointIncidentTarget(
        host: MobileApiTestSession,
        matches: List<MatchMVP>,
    ): PointIncidentTarget {
        val diagnostics = mutableListOf<String>()
        val snapshotsByEventId = mutableMapOf<String, EventParticipantsSnapshotResponseDto>()
        matches.filter { match ->
            !match.team1Id.isNullOrBlank() && !match.team2Id.isNullOrBlank()
        }.forEach { match ->
            val snapshot = snapshotsByEventId.getOrPut(match.eventId) {
                host.api.get("api/events/${match.eventId}/participants?manage=true")
            }
            val teamsById = snapshot.teams
                .mapNotNull { teamDto -> teamDto.toTeamOrNull() }
                .associateBy { team -> team.id }

            listOfNotNull(match.team1Id, match.team2Id).forEach { eventTeamId ->
                val team = teamsById[eventTeamId]
                if (team == null) {
                    diagnostics += "$eventTeamId: missing from participant snapshot"
                    return@forEach
                }
                val playerId = team.playerIds.firstOrNull { userId -> userId.isNotBlank() }
                if (playerId.isNullOrBlank()) {
                    diagnostics += "$eventTeamId: no active roster players"
                    return@forEach
                }
                return PointIncidentTarget(
                    match = match,
                    eventTeamId = eventTeamId,
                    participantUserId = playerId,
                    eventRegistrationId = team.playerRegistrationIds.firstOrNull { registrationId ->
                        registrationId.isNotBlank()
                    },
                )
            }
        }

        error(
            "Point incident test requires a scheduled event team with an event-roster player. " +
                diagnostics.take(8).joinToString("; "),
        )
    }

    private suspend fun assertEventResourcesPersisted(
        participant: MobileApiTestSession,
        variant: LifecycleVariant,
        loadedEvent: Event,
    ) {
        val loadedFields = participant.fieldRepository.getFields(loadedEvent.fieldIds).getOrThrow()
        val loadedTimeSlots = participant.fieldRepository.getTimeSlots(loadedEvent.timeSlotIds).getOrThrow()
        val expectedDivisionSet = variant.resourceDivisionIds.toSet()
        val divisionDetailsById = loadedEvent.divisionDetails.associateBy(DivisionDetail::id)

        assertTrue(loadedFields.size >= 2, "${variant.key} should have multiple fields")
        assertTrue(loadedTimeSlots.isNotEmpty(), "${variant.key} should have time slots")
        assertTrue(
            loadedTimeSlots.all { slot -> !slot.divisions.isNullOrEmpty() },
            "${variant.key} should persist explicit time-slot division assignments",
        )

        if (!variant.event.eventType.isSchedulable()) {
            assertTrue(
                loadedTimeSlots.flatMap { slot -> slot.divisions.orEmpty() }.isNotEmpty(),
                "${variant.key} should persist at least one explicit time-slot division",
            )
        } else if (variant.splitDivisions) {
            expectedDivisionSet.forEach { divisionId ->
                val fieldCount = divisionDetailsById[divisionId]?.fieldIds.orEmpty().count(String::isNotBlank)
                val slotCount = loadedTimeSlots.count { slot -> divisionId in slot.divisions.orEmpty() }
                if (!variant.isTournamentPoolPlay) {
                    assertTrue(fieldCount >= 2, "${variant.key} should persist multiple fields for $divisionId")
                }
                assertTrue(slotCount >= 1, "${variant.key} should have at least one time slot for $divisionId")
            }
        } else {
            assertTrue(
                expectedDivisionSet.all { divisionId ->
                    divisionDetailsById[divisionId]?.fieldIds.orEmpty().toSet().containsAll(loadedFields.map(Field::id))
                },
                "${variant.key} should persist every field on every division",
            )
            assertTrue(
                loadedTimeSlots.all { slot -> slot.divisions.orEmpty().toSet().containsAll(expectedDivisionSet) },
                "${variant.key} should assign every time slot to every division",
            )
        }

        loadedTimeSlots.forEach { slot ->
            val scheduledFieldIds = slot.scheduledFieldIds
                ?.filter(String::isNotBlank)
                ?.ifEmpty { slot.scheduledFieldId?.let(::listOf).orEmpty() }
                ?: slot.scheduledFieldId?.let(::listOf).orEmpty()
            assertTrue(
                scheduledFieldIds.isNotEmpty(),
                "${variant.key} should assign scheduled fields to each time slot",
            )
        }
    }

    private fun assertCreatedEventShape(
        variant: LifecycleVariant,
        event: Event,
    ) {
        assertEquals(variant.event.id, event.id)
        assertEquals(variant.event.eventType, event.eventType, "${variant.key} event type drifted")
        assertEquals(variant.event.singleDivision, event.singleDivision, "${variant.key} division mode drifted")
        if (variant.isTournamentPoolPlay) {
            assertTrue(
                event.includePlayoffs ||
                    event.divisions.any { divisionId -> divisionId.contains("_pool_") } ||
                    event.divisionDetails.any { detail ->
                    detail.poolCount != null || detail.poolTeamCount != null || detail.playoffTeamCount != null
                },
                "${variant.key} should preserve tournament pool/playoff configuration",
            )
        } else {
            assertEquals(variant.event.includePlayoffs, event.includePlayoffs, "${variant.key} playoff flag drifted")
        }
        assertEquals(variant.event.sportId, event.sportId, "${variant.key} sport drifted")
        assertEquals(variant.event.usesSets, event.usesSets, "${variant.key} scoring model drifted")
        assertEquals(
            variant.event.officialSchedulingMode,
            event.officialSchedulingMode,
            "${variant.key} official scheduling mode drifted",
        )
        when (variant.officialCase) {
            OfficialCase.NAMED_OFFICIALS -> {
                assertTrue(event.officialIds.size >= 2, "${variant.key} should persist multiple officials")
            }

            OfficialCase.TEAM_OFFICIALS -> {
                assertEquals(true, event.doTeamsOfficiate, "${variant.key} should use team officiating")
            }

            OfficialCase.NO_OFFICIALS -> {
                assertTrue(event.officialIds.isEmpty(), "${variant.key} should not persist named officials")
                assertEquals(OfficialSchedulingMode.OFF, event.officialSchedulingMode)
            }
        }
        if (variant.event.includePlayoffs) {
            assertTrue(
                event.playoffTeamCount != null ||
                    event.divisions.any { divisionId -> divisionId.contains("_pool_") } ||
                    event.divisionDetails.any { detail ->
                        detail.poolCount != null || detail.poolTeamCount != null || detail.playoffTeamCount != null
                    },
                "${variant.key} should carry playoff or pool configuration",
            )
        }
    }

    private fun backendFixturesReady(): Boolean {
        if (!mobileApiLoginFixturesReady(HOST_EMAIL to HOST_PASSWORD, PARTICIPANT_EMAIL to PARTICIPANT_PASSWORD)) {
            return false
        }
        val session = runCatching { MobileApiTestSession.create() }.getOrElse { return false }
        return try {
            runBlocking {
                val sportIds = session.sportsRepository.getSports()
                    .getOrNull()
                    ?.map { sport -> sport.id }
                    ?.toSet()
                    .orEmpty()
                REQUIRED_SPORT_IDS.all(sportIds::contains)
            }
        } finally {
            session.close()
        }
    }
}

private fun buildLifecycleVariants(
    runId: String,
    hostUserId: String,
): List<LifecycleVariant> = listOf(
    buildVariant(
        runId = runId,
        key = "weekly",
        hostUserId = hostUserId,
        eventType = EventType.WEEKLY_EVENT,
        sportId = "Pickleball",
        singleDivision = true,
        includePlayoffs = false,
        officialCase = OfficialCase.NO_OFFICIALS,
        start = Instant.parse("2026-09-01T08:00:00Z"),
        end = Instant.parse("2026-10-27T21:00:00Z"),
        occurrenceDate = "2026-09-02",
    ),
    buildVariant(
        runId = runId,
        key = "normal",
        hostUserId = hostUserId,
        eventType = EventType.EVENT,
        sportId = "Basketball",
        singleDivision = true,
        includePlayoffs = false,
        officialCase = OfficialCase.NAMED_OFFICIALS,
        start = Instant.parse("2026-09-02T12:00:00Z"),
        end = Instant.parse("2026-09-02T18:00:00Z"),
    ),
    buildVariant(
        runId = runId,
        key = KEY_TOURNAMENT_SINGLE_POOLS,
        hostUserId = hostUserId,
        eventType = EventType.TOURNAMENT,
        sportId = "Indoor Volleyball",
        singleDivision = true,
        includePlayoffs = true,
        officialCase = OfficialCase.NAMED_OFFICIALS,
        start = Instant.parse("2026-09-05T08:00:00Z"),
        end = Instant.parse("2026-09-05T22:00:00Z"),
    ),
    buildVariant(
        runId = runId,
        key = KEY_TOURNAMENT_SPLIT_POOLS,
        hostUserId = hostUserId,
        eventType = EventType.TOURNAMENT,
        sportId = "Indoor Soccer",
        singleDivision = false,
        includePlayoffs = true,
        officialCase = OfficialCase.NO_OFFICIALS,
        start = Instant.parse("2026-09-08T08:00:00Z"),
        end = Instant.parse("2026-09-10T22:00:00Z"),
    ),
    buildVariant(
        runId = runId,
        key = "tournament_single_no_pools",
        hostUserId = hostUserId,
        eventType = EventType.TOURNAMENT,
        sportId = "Tennis",
        singleDivision = true,
        includePlayoffs = false,
        officialCase = OfficialCase.NO_OFFICIALS,
        start = Instant.parse("2026-09-11T08:00:00Z"),
        end = Instant.parse("2026-09-11T22:00:00Z"),
    ),
    buildVariant(
        runId = runId,
        key = KEY_TOURNAMENT_SPLIT_NO_POOLS,
        hostUserId = hostUserId,
        eventType = EventType.TOURNAMENT,
        sportId = "Football",
        singleDivision = false,
        includePlayoffs = false,
        officialCase = OfficialCase.TEAM_OFFICIALS,
        start = Instant.parse("2026-09-14T08:00:00Z"),
        end = Instant.parse("2026-09-14T22:00:00Z"),
        autoCreatePointMatchIncidents = true,
    ),
    buildVariant(
        runId = runId,
        key = "league_single_playoffs",
        hostUserId = hostUserId,
        eventType = EventType.LEAGUE,
        sportId = "Beach Volleyball",
        singleDivision = true,
        includePlayoffs = true,
        officialCase = OfficialCase.NAMED_OFFICIALS,
        start = Instant.parse("2026-09-16T08:00:00Z"),
        end = Instant.parse("2026-11-16T22:00:00Z"),
    ),
    buildVariant(
        runId = runId,
        key = "league_split_playoffs",
        hostUserId = hostUserId,
        eventType = EventType.LEAGUE,
        sportId = "Grass Soccer",
        singleDivision = false,
        includePlayoffs = true,
        officialCase = OfficialCase.NO_OFFICIALS,
        start = Instant.parse("2026-09-18T08:00:00Z"),
        end = Instant.parse("2026-11-18T22:00:00Z"),
    ),
    buildVariant(
        runId = runId,
        key = KEY_LEAGUE_SINGLE_NO_PLAYOFFS,
        hostUserId = hostUserId,
        eventType = EventType.LEAGUE,
        sportId = "Grass Volleyball",
        singleDivision = true,
        includePlayoffs = false,
        officialCase = OfficialCase.TEAM_OFFICIALS,
        start = Instant.parse("2026-09-20T08:00:00Z"),
        end = Instant.parse("2026-11-20T22:00:00Z"),
    ),
    buildVariant(
        runId = runId,
        key = "league_split_no_playoffs",
        hostUserId = hostUserId,
        eventType = EventType.LEAGUE,
        sportId = "Baseball",
        singleDivision = false,
        includePlayoffs = false,
        officialCase = OfficialCase.NO_OFFICIALS,
        start = Instant.parse("2026-09-22T08:00:00Z"),
        end = Instant.parse("2026-11-22T22:00:00Z"),
    ),
)

private fun buildVariant(
    runId: String,
    key: String,
    hostUserId: String,
    eventType: EventType,
    sportId: String,
    singleDivision: Boolean,
    includePlayoffs: Boolean,
    officialCase: OfficialCase,
    start: Instant,
    end: Instant,
    occurrenceDate: String? = null,
    autoCreatePointMatchIncidents: Boolean = false,
): LifecycleVariant {
    val eventId = "${runId}_$key"
    val divisionIds = if (singleDivision) {
        listOf("${eventId}__division__open")
    } else {
        listOf("${eventId}__division__open", "${eventId}__division__advanced")
    }
    val generatedPoolDivisionIds = if (eventType == EventType.TOURNAMENT && includePlayoffs) {
        divisionIds.flatMap { divisionId ->
            val keySuffix = divisionId.substringAfterLast("__division__")
            listOf(
                "${eventId}__division__${keySuffix}_pool_a",
                "${eventId}__division__${keySuffix}_pool_b",
            )
        }
    } else {
        emptyList()
    }
    val resourceDivisionIds = if (generatedPoolDivisionIds.isNotEmpty()) {
        divisionIds + generatedPoolDivisionIds
    } else {
        divisionIds
    }
    val eventDivisionIds = if (eventType == EventType.TOURNAMENT && includePlayoffs) {
        resourceDivisionIds
    } else {
        divisionIds
    }
    val teamIds = when {
        eventType == EventType.TOURNAMENT && includePlayoffs && singleDivision -> SEEDED_TEAM_IDS.take(4)
        eventType.isSchedulable() && singleDivision -> SEEDED_TEAM_IDS.take(4)
        eventType.isSchedulable() -> SEEDED_TEAM_IDS
        else -> emptyList()
    }
    val usesSets = sportId in SET_BASED_SPORT_IDS
    val fields = buildFields(
        eventId = eventId,
        divisionIds = resourceDivisionIds,
        splitDivisions = resourceDivisionIds.size > 1,
    )
    val timeSlots = buildTimeSlots(
        eventId = eventId,
        eventType = eventType,
        start = start,
        end = end,
        fields = fields,
        divisionIds = resourceDivisionIds,
        splitDivisions = resourceDivisionIds.size > 1,
    )
    val officialBundle = buildOfficialBundle(
        eventId = eventId,
        fieldIds = fields.map(Field::id),
        officialCase = officialCase,
    )
    val regularDivisionDetails = buildRegularDivisionDetails(
        eventId = eventId,
        divisionIds = divisionIds,
        fields = fields,
        teamIds = teamIds,
        eventType = eventType,
        includePlayoffs = includePlayoffs,
        usesSets = usesSets,
    )
    val playoffTeamCount = if (includePlayoffs && eventType == EventType.TOURNAMENT) {
        TOURNAMENT_POOL_PLAYOFF_TEAM_COUNT
    } else if (includePlayoffs) {
        min(4, teamIds.size).coerceAtLeast(2)
    } else {
        null
    }

    val event = Event(
        id = eventId,
        name = "Mobile Lifecycle ${key.replace('_', ' ').replaceFirstChar(Char::titlecase)}",
        description = "Mobile backend lifecycle coverage for $key.",
        divisions = eventDivisionIds,
        divisionDetails = regularDivisionDetails,
        location = "Local Sports Complex",
        start = start,
        end = end,
        imageId = UPLOADED_DOCUMENT_IMAGE_ID,
        coordinates = listOf(-122.4194, 37.7749),
        hostId = hostUserId,
        assistantHostIds = listOf(ASSISTANT_HOST_ONE_ID, ASSISTANT_HOST_TWO_ID),
        noFixedEndDateTime = false,
        teamSignup = eventType.isSchedulable(),
        singleDivision = singleDivision,
        teamIds = teamIds,
        userIds = if (eventType.isSchedulable()) emptyList() else emptyList(),
        fieldIds = fields.map(Field::id),
        timeSlotIds = timeSlots.map(TimeSlot::id),
        sportId = sportId,
        organizationId = SEEDED_ORGANIZATION_ID,
        maxParticipants = if (eventType.isSchedulable()) teamIds.size else 24,
        teamSizeLimit = 2,
        eventType = eventType,
        gamesPerOpponent = if (eventType == EventType.LEAGUE) 1 else null,
        includePlayoffs = includePlayoffs,
        playoffTeamCount = playoffTeamCount,
        usesSets = usesSets,
        matchDurationMinutes = if (usesSets) null else TIMED_MATCH_DURATION_MINUTES,
        setDurationMinutes = if (usesSets) SET_MATCH_DURATION_MINUTES else null,
        setsPerMatch = if (usesSets) 1 else null,
        pointsToVictory = if (usesSets) listOf(21) else emptyList(),
        winnerSetCount = 1,
        winnerBracketPointsToVictory = if (usesSets && eventType == EventType.TOURNAMENT) {
            listOf(21)
        } else {
            emptyList()
        },
        restTimeMinutes = 0,
        state = "PUBLISHED",
        officialSchedulingMode = officialBundle.schedulingMode,
        officialPositions = officialBundle.positions,
        eventOfficials = officialBundle.eventOfficials,
        officialIds = officialBundle.officialIds,
        doTeamsOfficiate = officialCase == OfficialCase.TEAM_OFFICIALS,
        teamOfficialsMaySwap = officialCase == OfficialCase.TEAM_OFFICIALS,
        autoCreatePointMatchIncidents = autoCreatePointMatchIncidents,
        allowTeamSplitDefault = !singleDivision,
    )

    return LifecycleVariant(
        key = key,
        event = event,
        fields = fields,
        timeSlots = timeSlots,
        divisionIds = eventDivisionIds,
        resourceDivisionIds = resourceDivisionIds,
        primaryDivisionId = eventDivisionIds.first(),
        splitDivisions = resourceDivisionIds.size > 1,
        officialCase = officialCase,
        occurrence = occurrenceDate?.let { date ->
            EventOccurrenceSelection(
                slotId = timeSlots.first().id,
                occurrenceDate = date,
                label = "Mobile lifecycle occurrence",
            )
        },
    )
}

private fun buildFields(
    eventId: String,
    divisionIds: List<String>,
    splitDivisions: Boolean,
): List<Field> {
    return if (splitDivisions) {
        divisionIds.flatMapIndexed { divisionIndex, divisionId ->
            (1..2).map { fieldIndex ->
                val fieldNumber = divisionIndex * 2 + fieldIndex
                Field(
                    id = "${eventId}_field_$fieldNumber",
                    fieldNumber = fieldNumber,
                    name = "Lifecycle Field $fieldNumber",
                    divisions = listOf(divisionId),
                    location = "Local Sports Complex",
                    organizationId = SEEDED_ORGANIZATION_ID,
                )
            }
        }
    } else {
        (1..2).map { fieldIndex ->
            Field(
                id = "${eventId}_field_$fieldIndex",
                fieldNumber = fieldIndex,
                name = "Lifecycle Field $fieldIndex",
                divisions = divisionIds,
                location = "Local Sports Complex",
                organizationId = SEEDED_ORGANIZATION_ID,
            )
        }
    }
}

private fun buildTimeSlots(
    eventId: String,
    eventType: EventType,
    start: Instant,
    end: Instant,
    fields: List<Field>,
    divisionIds: List<String>,
    splitDivisions: Boolean,
): List<TimeSlot> {
    val repeating = eventType == EventType.LEAGUE || eventType == EventType.WEEKLY_EVENT
    val daysOfWeek = if (eventType == EventType.WEEKLY_EVENT) listOf(2, 4) else listOf(1, 3)
    return if (splitDivisions) {
        divisionIds.mapIndexed { index, divisionId ->
            val fieldIds = fields
                .filter { field -> divisionId in field.divisions }
                .map(Field::id)
            TimeSlot(
                id = "${eventId}_slot_${index + 1}",
                dayOfWeek = daysOfWeek.first(),
                daysOfWeek = daysOfWeek,
                divisions = listOf(divisionId),
                startTimeMinutes = 8 * 60 + index * 30,
                endTimeMinutes = 22 * 60,
                startDate = start,
                repeating = repeating,
                endDate = end,
                scheduledFieldId = fieldIds.first(),
                scheduledFieldIds = fieldIds,
                price = 0,
            )
        }
    } else {
        listOf(
            TimeSlot(
                id = "${eventId}_slot_1",
                dayOfWeek = daysOfWeek.first(),
                daysOfWeek = daysOfWeek,
                divisions = divisionIds,
                startTimeMinutes = 8 * 60,
                endTimeMinutes = 22 * 60,
                startDate = start,
                repeating = repeating,
                endDate = end,
                scheduledFieldId = fields.first().id,
                scheduledFieldIds = fields.map(Field::id),
                price = 0,
            ),
        )
    }
}

private fun buildRegularDivisionDetails(
    eventId: String,
    divisionIds: List<String>,
    fields: List<Field>,
    teamIds: List<String>,
    eventType: EventType,
    includePlayoffs: Boolean,
    usesSets: Boolean,
): List<DivisionDetail> {
    val teamsByDivision = if (divisionIds.size == 1) {
        mapOf(divisionIds.first() to teamIds)
    } else {
        val chunkSize = (teamIds.size / divisionIds.size).coerceAtLeast(1)
        divisionIds.mapIndexed { index, divisionId ->
            divisionId to teamIds.drop(index * chunkSize).take(chunkSize)
        }.toMap()
    }
    return divisionIds.mapIndexed { index, divisionId ->
        val teams = teamsByDivision[divisionId].orEmpty()
        val divisionFieldIds = fields
            .filter { field -> divisionId in field.divisions }
            .map(Field::id)
            .ifEmpty { fields.map(Field::id) }
        val label = if (index == 0) "Open" else "Advanced"
        DivisionDetail(
            id = divisionId,
            key = if (index == 0) "open" else "advanced",
            name = label,
            maxParticipants = if (eventType.isSchedulable()) teams.size else 24,
            playoffTeamCount = if (includePlayoffs && eventType == EventType.TOURNAMENT) {
                TOURNAMENT_POOL_PLAYOFF_TEAM_COUNT
            } else if (includePlayoffs && eventType.isSchedulable()) {
                min(4, teams.size).coerceAtLeast(2)
            } else {
                null
            },
            poolCount = if (includePlayoffs && eventType == EventType.TOURNAMENT) 2 else null,
            gamesPerOpponent = if (eventType == EventType.LEAGUE) 1 else null,
            restTimeMinutes = 0,
            usesSets = usesSets,
            matchDurationMinutes = if (usesSets) null else TIMED_MATCH_DURATION_MINUTES,
            setDurationMinutes = if (usesSets) SET_MATCH_DURATION_MINUTES else null,
            setsPerMatch = if (usesSets) 1 else null,
            pointsToVictory = if (usesSets) listOf(21) else emptyList(),
            teamIds = teams,
            fieldIds = divisionFieldIds,
        )
    }
}

private fun buildOfficialBundle(
    eventId: String,
    fieldIds: List<String>,
    officialCase: OfficialCase,
): OfficialBundle {
    if (officialCase == OfficialCase.NO_OFFICIALS) {
        return OfficialBundle(
            schedulingMode = OfficialSchedulingMode.OFF,
            positions = emptyList(),
            eventOfficials = emptyList(),
            officialIds = emptyList(),
        )
    }

    val positionId = buildEventOfficialPositionId(eventId = eventId, order = 0, name = "Official")
    val positions = listOf(
        EventOfficialPosition(
            id = positionId,
            name = "Official",
            count = 1,
            order = 0,
        ),
    )
    if (officialCase == OfficialCase.TEAM_OFFICIALS) {
        return OfficialBundle(
            schedulingMode = OfficialSchedulingMode.TEAM_STAFFING,
            positions = positions,
            eventOfficials = emptyList(),
            officialIds = emptyList(),
        )
    }

    val officialIds = listOf(OFFICIAL_ONE_ID, OFFICIAL_TWO_ID)
    return OfficialBundle(
        schedulingMode = OfficialSchedulingMode.SCHEDULE,
        positions = positions,
        eventOfficials = officialIds.map { userId ->
            EventOfficial(
                id = buildEventOfficialRecordId(eventId = eventId, userId = userId),
                userId = userId,
                positionIds = listOf(positionId),
                fieldIds = fieldIds,
                isActive = true,
            )
        },
        officialIds = officialIds,
    )
}

private fun List<MatchMVP>.firstPlayableMatch(): MatchMVP {
    return firstOrNull { match -> !match.team1Id.isNullOrBlank() && !match.team2Id.isNullOrBlank() }
        ?: error("Expected at least one match with both teams assigned.")
}

private fun assertSegmentScore(
    match: MatchMVP,
    eventTeamId: String,
    expected: Int,
    message: String,
) {
    val segmentScore = match.segments
        .minByOrNull { segment -> segment.sequence }
        ?.scores
        ?.get(eventTeamId)
    val legacyScore = when (eventTeamId) {
        match.team1Id -> match.team1Points.firstOrNull()
        match.team2Id -> match.team2Points.firstOrNull()
        else -> null
    }
    assertEquals(expected, segmentScore ?: legacyScore, message)
}

private fun EventType.isSchedulable(): Boolean = this == EventType.LEAGUE || this == EventType.TOURNAMENT

private fun Throwable.backendSummary(): String {
    val apiException = this as? ApiException
    val responseBody = apiException?.responseBody
        ?.replace(Regex("\\s+"), " ")
        ?.take(500)
    return buildString {
        append(message ?: this@backendSummary::class.simpleName)
        if (!responseBody.isNullOrBlank()) {
            append(" body=")
            append(responseBody)
        }
    }
}

private enum class OfficialCase {
    NAMED_OFFICIALS,
    TEAM_OFFICIALS,
    NO_OFFICIALS,
}

private data class LifecycleVariant(
    val key: String,
    val event: Event,
    val fields: List<Field>,
    val timeSlots: List<TimeSlot>,
    val divisionIds: List<String>,
    val resourceDivisionIds: List<String>,
    val primaryDivisionId: String,
    val splitDivisions: Boolean,
    val officialCase: OfficialCase,
    val occurrence: EventOccurrenceSelection?,
) {
    val isTournamentPoolPlay: Boolean
        get() = event.eventType == EventType.TOURNAMENT && event.includePlayoffs
}

private data class PointIncidentTarget(
    val match: MatchMVP,
    val eventTeamId: String,
    val participantUserId: String,
    val eventRegistrationId: String?,
)

private data class OfficialBundle(
    val schedulingMode: OfficialSchedulingMode,
    val positions: List<EventOfficialPosition>,
    val eventOfficials: List<EventOfficial>,
    val officialIds: List<String>,
)

private const val HOST_EMAIL = MOBILE_TEST_HOST_EMAIL
private const val HOST_PASSWORD = MOBILE_TEST_HOST_PASSWORD
private const val PARTICIPANT_EMAIL = MOBILE_TEST_PARTICIPANT_EMAIL
private const val PARTICIPANT_PASSWORD = MOBILE_TEST_PARTICIPANT_PASSWORD
private const val SEEDED_ORGANIZATION_ID = "org_1"
private const val UPLOADED_DOCUMENT_IMAGE_ID = "camka_upload_upscaled_cc_indoor_sports_024be2e8d5cdead5_jpg"
private const val ASSISTANT_HOST_ONE_ID = "dev_user_3"
private const val ASSISTANT_HOST_TWO_ID = "dev_user_4"
private const val OFFICIAL_ONE_ID = "dev_user_1"
private const val OFFICIAL_TWO_ID = "dev_user_2"
private const val DIRECT_SCORE_POINTS = 7
private const val TIMED_MATCH_DURATION_MINUTES = 20
private const val SET_MATCH_DURATION_MINUTES = 10
private const val TOURNAMENT_POOL_PLAYOFF_TEAM_COUNT = 2
private const val KEY_TOURNAMENT_SINGLE_POOLS = "tournament_single_pools"
private const val KEY_TOURNAMENT_SPLIT_POOLS = "tournament_split_pools"
private const val KEY_TOURNAMENT_SPLIT_NO_POOLS = "tournament_split_no_pools"
private const val KEY_LEAGUE_SINGLE_NO_PLAYOFFS = "league_single_no_playoffs"

private val SEEDED_TEAM_IDS = listOf(
    "team_1",
    "team_2",
    "team_3",
    "team_4",
    "team_5",
    "team_6",
    "team_7",
    "team_8",
)
private val SET_BASED_SPORT_IDS = setOf(
    "Indoor Volleyball",
    "Beach Volleyball",
    "Grass Volleyball",
    "Tennis",
    "Pickleball",
)
private val REQUIRED_SPORT_IDS = setOf(
    "Indoor Volleyball",
    "Beach Volleyball",
    "Grass Volleyball",
    "Basketball",
    "Indoor Soccer",
    "Grass Soccer",
    "Tennis",
    "Pickleball",
    "Football",
    "Baseball",
)
