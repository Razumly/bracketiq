@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.dto.EventParticipantsRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsResponseDto
import com.razumly.mvp.core.network.dto.InviteCreateDto
import com.razumly.mvp.testing.MOBILE_TEST_HOST_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_HOST_PASSWORD
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_PASSWORD
import com.razumly.mvp.testing.MobileApiTestSession
import com.razumly.mvp.testing.mobileApiLoginFixturesReady
import com.razumly.mvp.testing.runTargetedBackendSeed
import com.razumly.mvp.testing.shouldAutoSeedBackendFixtures
import io.ktor.client.HttpClient
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LeaguePlayoffMobileApiIntegrationTest {
    private val testRunId = Clock.System.now().toEpochMilliseconds()
    private val testEventId = "mobile_api_league_playoff_$testRunId"
    private val testFieldId = "${testEventId}_field"
    private val testSlotId = "${testEventId}_slot"
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
            "Skipping mobile/backend integration test because backend fixtures are unavailable. " +
                "Automatic backend seeding is disabled unless MVP_TEST_ALLOW_DB_SEED=1.",
            fixturesPrepared,
        )
    }

    @After
    fun tearDown() {
        runCatching { runBlocking { hostSession?.deleteEvent(testEventId) } }
        hostSession?.close()
        participantSession?.close()
        hostSession = null
        participantSession = null
    }

    @Test
    fun league_playoff_mobile_api_flow_loads_staff_invites_periphery_join_and_schedule_data() = runTest(timeout = 5.minutes) {
        hostSession = MobileApiTestSession.create()
        participantSession = MobileApiTestSession.create()

        val host = hostSession!!
        val participant = participantSession!!

        val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
        host.deleteEvent(testEventId)

        val createdEvent = host.eventRepository.createEvent(
            newEvent = buildLeagueEvent(hostUser.id),
            fields = listOf(buildLeagueField()),
            timeSlots = listOf(buildLeagueTimeSlot()),
        ).getOrThrow()

        assertEquals(UPLOADED_DOCUMENT_IMAGE_ID, createdEvent.imageId)
        assertTrue(createdEvent.includePlayoffs)
        assertEquals(TEST_PLAYOFF_TEAM_COUNT, createdEvent.playoffTeamCount)

        registerSeededTeams(host = host, event = createdEvent)

        host.userRepository.createInvites(
            invites = staffInvitePayloads(eventId = createdEvent.id, createdBy = hostUser.id),
        ).getOrThrow()

        val scheduledEvent = host.eventRepository.scheduleEvent(createdEvent.id).getOrElse { error ->
            val responseBody = (error as? ApiException)?.responseBody
            throw AssertionError(
                "Scheduling ${createdEvent.id} failed: ${responseBody ?: error.message}",
                error,
            )
        }
        val scheduledMatches = host.matchRepository.getMatchesOfTournament(createdEvent.id).getOrThrow()

        assertTrue(scheduledEvent.includePlayoffs)
        assertEquals(TEST_PLAYOFF_TEAM_COUNT, scheduledEvent.playoffTeamCount)
        assertTrue(
            scheduledMatches.size > 6,
            "Expected playoff scheduling to add matches beyond the 4-team round robin baseline.",
        )

        participant.userRepository.login(PARTICIPANT_EMAIL, PARTICIPANT_PASSWORD).getOrThrow()
        val loadedEvent = participant.eventRepository.getEvent(createdEvent.id).getOrThrow()
        val joinResult = participant.eventRepository.addCurrentUserToEvent(
            event = loadedEvent,
            preferredDivisionId = SEEDED_DIVISION_ID,
        ).getOrThrow()

        assertFalse(joinResult.requiresParentApproval)
        assertFalse(joinResult.joinedWaitlist)

        val loadedInvites = participant.eventRepository.getEventStaffInvites(createdEvent.id).getOrThrow()
        val loadedFields = participant.fieldRepository.getFields(loadedEvent.fieldIds).getOrThrow()
        val loadedTimeSlots = participant.fieldRepository.getTimeSlots(loadedEvent.timeSlotIds).getOrThrow()
        val loadedMatches = participant.matchRepository.getMatchesOfTournament(createdEvent.id).getOrThrow()
        val loadedTeamIds = loadedEvent.teamIds
            .ifEmpty {
                loadedEvent.divisionDetails
                    .flatMap(DivisionDetail::teamIds)
                    .distinct()
            }
            .ifEmpty {
                loadedMatches.flatMap { match ->
                    listOfNotNull(match.team1Id, match.team2Id, match.teamOfficialId)
                }.distinct()
            }
        val loadedSports = participant.sportsRepository.getSports().getOrThrow()

        assertEquals(UPLOADED_DOCUMENT_IMAGE_ID, loadedEvent.imageId)
        assertEquals(listOf(SEEDED_SPORT_ID), loadedEvent.sportIds)
        assertTrue(loadedEvent.includePlayoffs)
        assertEquals(TEST_PLAYOFF_TEAM_COUNT, loadedEvent.playoffTeamCount)
        assertTrue(
            scheduledMatches.any { match -> match.hasBracketLink() },
            "Expected the schedule response to include bracket-linked playoff matches.",
        )
        assertEquals(setOf(testFieldId), loadedFields.map(Field::id).toSet())
        assertEquals(setOf(testSlotId), loadedTimeSlots.map(TimeSlot::id).toSet())
        assertEquals(SEEDED_TEAM_IDS.size, loadedTeamIds.size)
        assertTrue(loadedTeamIds.all(String::isNotBlank))
        assertEquals(scheduledMatches.map { it.id }.toSet(), loadedMatches.map { it.id }.toSet())
        assertEquals(STAFF_INVITE_EMAILS, loadedInvites.mapNotNull { it.email }.toSet())
        assertTrue(loadedSports.isNotEmpty(), "Expected sports catalog API to return at least one sport.")

        val refreshedEvent = participant.eventRepository.getEvent(createdEvent.id).getOrThrow()
        val batchEvents = participant.eventRepository.getEventsByIds(listOf(createdEvent.id)).getOrThrow()
        val batchMatches = participant.matchRepository.getMatchesByEventIds(
            eventIds = listOf(createdEvent.id),
            fieldIds = refreshedEvent.fieldIds,
        ).getOrThrow()
        val mySchedule = participant.eventRepository.getMySchedule().getOrThrow()

        assertEquals(listOf(createdEvent.id), batchEvents.map { it.id })
        assertEquals(loadedMatches.map { it.id }.toSet(), batchMatches.map { it.id }.toSet())
        assertTrue(mySchedule.events.any { it.id == createdEvent.id })
        assertTrue(mySchedule.fields.any { it.id == testFieldId })
    }

    private fun MatchMVP.hasBracketLink(): Boolean =
        previousLeftId != null ||
            previousRightId != null ||
            winnerNextMatchId != null ||
            loserNextMatchId != null

    private suspend fun registerSeededTeams(
        host: MobileApiTestSession,
        event: Event,
    ) {
        SEEDED_TEAM_IDS.forEach { teamId ->
            val response = runCatching {
                host.api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                    path = "api/events/${event.id}/participants",
                    body = EventParticipantsRequestDto(
                        teamId = teamId,
                        divisionId = SEEDED_DIVISION_ID,
                    ),
                )
            }.getOrElse { error ->
                throw AssertionError(
                    "Registering $teamId for ${event.id} failed: " +
                        ((error as? ApiException)?.responseBody ?: error.message),
                    error,
                )
            }
            response.error?.takeIf(String::isNotBlank)?.let { message ->
                error("Registering $teamId for ${event.id} failed: $message")
            }
        }
    }

    private fun buildLeagueEvent(hostUserId: String): Event {
        return Event(
            id = testEventId,
            name = "Mobile API League Playoff Regression",
            description = "Native mobile repository coverage for playoff league load and join flows.",
            divisions = listOf(SEEDED_DIVISION_ID),
            divisionDetails = listOf(
                DivisionDetail(
                    id = SEEDED_DIVISION_ID,
                    key = "open",
                    name = "Open",
                    playoffTeamCount = TEST_PLAYOFF_TEAM_COUNT,
                    teamIds = SEEDED_TEAM_IDS,
                    fieldIds = listOf(testFieldId),
                ),
            ),
            location = "Local Sports Complex",
            start = Instant.parse("2026-06-01T08:00:00Z"),
            end = TEST_EVENT_END,
            imageId = UPLOADED_DOCUMENT_IMAGE_ID,
            coordinates = listOf(-122.4194, 37.7749),
            hostId = hostUserId,
            noFixedEndDateTime = false,
            teamSignup = true,
            singleDivision = true,
            teamIds = SEEDED_TEAM_IDS,
            fieldIds = listOf(testFieldId),
            timeSlotIds = listOf(testSlotId),
            sportIds = listOf(SEEDED_SPORT_ID),
            maxParticipants = SEEDED_TEAM_IDS.size,
            eventType = EventType.LEAGUE,
            gamesPerOpponent = 1,
            includePlayoffs = true,
            playoffTeamCount = TEST_PLAYOFF_TEAM_COUNT,
            usesSets = false,
            matchDurationMinutes = 60,
            restTimeMinutes = 0,
            state = "PUBLISHED",
        )
    }

    private fun buildLeagueField(): Field {
        return Field(
            id = testFieldId,
            fieldNumber = 1,
            name = "Integration Court",
            divisions = listOf(SEEDED_DIVISION_ID),
            rentalSlotIds = listOf(testSlotId),
            location = "Local Sports Complex",
        )
    }

    private fun buildLeagueTimeSlot(): TimeSlot {
        return TimeSlot(
            id = testSlotId,
            dayOfWeek = 0,
            daysOfWeek = listOf(0),
            divisions = listOf(SEEDED_DIVISION_ID),
            startTimeMinutes = 8 * 60,
            endTimeMinutes = 23 * 60,
            startDate = TEST_EVENT_START,
            repeating = true,
            endDate = TEST_EVENT_END,
            scheduledFieldId = testFieldId,
            scheduledFieldIds = listOf(testFieldId),
            price = 0,
        )
    }

    private fun staffInvitePayloads(eventId: String, createdBy: String): List<InviteCreateDto> {
        return listOf(
            InviteCreateDto(
                type = "STAFF",
                email = TEST_HOST_STAFF_EMAIL,
                status = "PENDING",
                staffTypes = listOf("HOST"),
                eventId = eventId,
                createdBy = createdBy,
                firstName = "Host",
                lastName = "Invite",
            ),
            InviteCreateDto(
                type = "STAFF",
                email = TEST_OFFICIAL_STAFF_EMAIL,
                status = "PENDING",
                staffTypes = listOf("OFFICIAL"),
                eventId = eventId,
                createdBy = createdBy,
                firstName = "Official",
                lastName = "Invite",
            ),
        )
    }

    private fun backendFixturesReady(): Boolean {
        if (!mobileApiLoginFixturesReady(HOST_EMAIL to HOST_PASSWORD, PARTICIPANT_EMAIL to PARTICIPANT_PASSWORD)) {
            return false
        }
        val session = runCatching { MobileApiTestSession.create() }.getOrElse { return false }
        return try {
            runBlocking {
                val sportsReady = session.sportsRepository.getSports()
                    .getOrNull()
                    ?.any { it.id == SEEDED_SPORT_ID } == true
                sportsReady
            }
        } finally {
            session.close()
        }
    }
}
private const val HOST_EMAIL = MOBILE_TEST_HOST_EMAIL
private const val HOST_PASSWORD = MOBILE_TEST_HOST_PASSWORD
private const val PARTICIPANT_EMAIL = MOBILE_TEST_PARTICIPANT_EMAIL
private const val PARTICIPANT_PASSWORD = MOBILE_TEST_PARTICIPANT_PASSWORD
private const val SEEDED_DIVISION_ID = "division_open"
private const val SEEDED_SPORT_ID = "Indoor Volleyball"
private const val UPLOADED_DOCUMENT_IMAGE_ID = "camka_upload_upscaled_cc_indoor_sports_024be2e8d5cdead5_jpg"
private const val TEST_PLAYOFF_TEAM_COUNT = 4
private const val TEST_HOST_STAFF_EMAIL = "mobile-api-host-invite@example.test"
private const val TEST_OFFICIAL_STAFF_EMAIL = "mobile-api-official-invite@example.test"

private val SEEDED_TEAM_IDS = listOf("team_1", "team_2", "team_3", "team_4")
private val STAFF_INVITE_EMAILS = setOf(TEST_HOST_STAFF_EMAIL, TEST_OFFICIAL_STAFF_EMAIL)
private val TEST_EVENT_START: Instant = Clock.System.now() + 14.days
private val TEST_EVENT_END: Instant = TEST_EVENT_START + 56.days
