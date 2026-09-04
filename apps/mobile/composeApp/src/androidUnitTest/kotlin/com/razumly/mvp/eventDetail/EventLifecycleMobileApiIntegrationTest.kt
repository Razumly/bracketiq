@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.normalizeRegistrationPaymentMode
import com.razumly.mvp.core.data.dataTypes.toTournamentConfig
import com.razumly.mvp.core.util.jsonMVP
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialPositionId
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.toStaffingPriority
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.data.repositories.EventEditorApiException
import com.razumly.mvp.core.data.repositories.EventEditorCanonicalState
import com.razumly.mvp.core.data.repositories.EventEditorMutation
import com.razumly.mvp.core.data.repositories.EventEditorProposalStaleException
import com.razumly.mvp.core.data.repositories.EventEditorSessionMapper
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventSearchSort
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorBootstrapQueryDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventParticipantsRequestDto
import com.razumly.mvp.core.network.dto.EventParticipantsResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.testing.MOBILE_TEST_HOST_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_HOST_PASSWORD
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_PASSWORD
import com.razumly.mvp.testing.MobileApiTestSession
import com.razumly.mvp.testing.PreparedEventEditorCreate
import com.razumly.mvp.testing.createEventThroughEditor
import com.razumly.mvp.testing.mobileApiBackendTestIsolationReady
import com.razumly.mvp.testing.mobileApiLoginFixturesReady
import com.razumly.mvp.testing.prepareEventEditorCreate
import com.razumly.mvp.testing.purgeMobileEventEditorReceipts
import com.razumly.mvp.testing.purgeMobileTournamentRun
import com.razumly.mvp.testing.resolveCreatedEventId
import com.razumly.mvp.testing.runBackendSeedThenCheck
import com.razumly.mvp.testing.runTargetedBackendSeed
import com.razumly.mvp.testing.shouldAutoSeedBackendFixtures
import com.razumly.mvp.testing.validateLocalTestDatabaseUrl
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import dev.icerock.moko.geo.LatLng
import kotlinx.serialization.json.JsonObject
import io.ktor.client.plugins.plugin
import kotlinx.serialization.json.decodeFromJsonElement
import io.ktor.client.plugins.HttpSend
import io.ktor.http.HttpMethod
import io.ktor.http.content.OutgoingContent
import io.ktor.http.encodedPath
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
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
        if (System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank()) {
            assumeTrue(
                "Skipping mobile/backend event lifecycle integration test because MVP_TEST_BACKEND_URL is not set.",
                false,
            )
            return
        }
        if (lifecycleBackendFixturesReady()) return
        val fixturesPrepared = if (shouldAutoSeedBackendFixtures()) {
            runBackendSeedThenCheck(
                seed = { runTargetedBackendSeed() },
                fixturesReady = { lifecycleBackendFixturesReady() },
            )
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
    fun given_mobile_editor_create_command_when_sent_to_site_then_event_is_persisted() =
        runTest(timeout = 5.minutes) {
            hostSession = MobileApiTestSession.create()
            val host = hostSession!!
            val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
            val runId = "mobile_api_editor_contract_${Clock.System.now().toEpochMilliseconds()}"
            val source = buildLifecycleVariants(runId = runId, hostUserId = hostUser.id)
                .first { variant -> variant.key == "normal" }
            val created = host.createEventThroughEditor(
                event = source.event.copy(name = "${source.event.name} Contract"),
                fields = source.fields,
                timeSlots = source.timeSlots,
                operationId = "mobile-editor-contract-$runId",
            )
            createdEventIds += created.id

            assertCreatedEventShape(source, created)
        }

    @Test
    fun given_past_start_weekly_event_when_mobile_searches_site_then_occurrence_is_decoded_without_rewriting_canonical_dates() =
        runTest(timeout = 5.minutes) {
            hostSession = MobileApiTestSession.create()
            val host = hostSession!!
            val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
            val source = buildVariant(
                runId = "mobile_api_weekly_search_${Clock.System.now().toEpochMilliseconds()}",
                key = "weekly_search",
                hostUserId = hostUser.id,
                eventType = EventType.WEEKLY_EVENT,
                sportId = "Pickleball",
                singleDivision = true,
                includePlayoffs = false,
                officialCase = OfficialCase.NO_OFFICIALS,
                start = Instant.parse("2026-10-01T08:00:00Z"),
                end = Instant.parse("2026-12-31T21:00:00Z"),
            )
            val created = runCatching {
                host.createEventThroughEditor(
                    event = source.event,
                    fields = source.fields,
                    timeSlots = source.timeSlots,
                    operationId = "mobile-weekly-search-${source.event.id}",
                )
            }.getOrElse { failure ->
                error("Failed to create Weekly search fixture: ${failure.backendSummary()}")
            }
            createdEventIds += created.id

            val dateFrom = Instant.parse("2026-11-01T00:00:00Z")
            val dateTo = Instant.parse("2026-11-20T23:59:59Z")
            val (events, _) = host.eventRepository.getEventsInBounds(
                bounds = Bounds(
                    north = 90.0,
                    east = 180.0,
                    south = -90.0,
                    west = -180.0,
                    center = LatLng(0.0, 0.0),
                    radiusMiles = 100.0,
                ),
                dateFrom = dateFrom,
                dateTo = dateTo,
                sports = emptyList(),
                tags = emptyList(),
                price = null,
                divisionGenders = emptyList(),
                skillDivisionTypeIds = emptyList(),
                ageDivisionTypeIds = emptyList(),
                limit = 20,
                offset = 0,
                includeDistanceFilter = false,
                sort = EventSearchSort.SOONEST,
            ).getOrElse { failure ->
                error("Mobile Weekly search failed: ${failure.backendSummary()}")
            }

            val found = events.firstOrNull { event -> event.id == created.id }
            assertNotNull(found)
            val occurrence = found.nextOccurrence
            assertNotNull(occurrence)
            assertEquals(source.event.start, found.start)
            assertEquals(source.event.end, found.end)
            assertEquals(source.timeSlots.first().id, occurrence.slotId)
            assertTrue(occurrence.start >= dateFrom)
            assertTrue(occurrence.end <= dateTo)
        }

    @Test
    fun mobile_editor_can_edit_and_publish_a_draft_without_dropping_resources() =
        runTest(timeout = 5.minutes) {
            hostSession = MobileApiTestSession.create()

            val host = hostSession!!
            val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
            val runId = "mobile_api_editor_edit_${Clock.System.now().toEpochMilliseconds()}"
            val source = buildLifecycleVariants(runId = runId, hostUserId = hostUser.id)
                .first { variant -> variant.key == "normal" }
            val draftEvent = source.event.copy(
                name = "${source.event.name} Draft",
                state = "UNPUBLISHED",
            )

            val created = host.createEventThroughEditor(
                event = draftEvent,
                fields = source.fields,
                timeSlots = source.timeSlots,
                operationId = "mobile-editor-edit-$runId",
            )
            createdEventIds += created.id

            val baseline = host.eventRepository.getEventEditor(created.id).getOrThrow()
            val editedName = "${draftEvent.name} Published"
            val editedState = baseline.canonicalState.copy(
                event = baseline.canonicalState.event.copy(
                    name = editedName,
                    state = "PUBLISHED",
                ),
            )
            val outcome = host.eventRepository.saveEventEditor(
                eventId = created.id,
                command = EventEditorSessionMapper.toSaveCommand(
                    session = baseline,
                    mutation = EventEditorMutation(
                        canonicalState = EventEditorCanonicalState(
                            event = editedState.event,
                            fields = editedState.fields,
                            timeSlots = editedState.timeSlots,
                            leagueScoringConfig = editedState.leagueScoringConfig,
                            questions = editedState.questions,
                            pendingStaffInvites = editedState.pendingStaffInvites,
                            playoffDivisionDetails = editedState.playoffDivisionDetails,
                            divisionFieldIds = editedState.divisionFieldIds,
                        ),
                    ),
                ),
            ).getOrElse { error ->
                error("Failed to edit and publish ${created.id}: ${error.backendSummary()}")
            }

            val persisted = outcome.session.canonicalState
            assertEquals(editedName, persisted.event.name)
            assertEquals("PUBLISHED", persisted.event.state)
            assertEquals(
                baseline.canonicalState.fields.map { field -> field.id }.toSet(),
                persisted.fields.map { field -> field.id }.toSet(),
            )
            assertEquals(
                baseline.canonicalState.timeSlots.map { slot -> slot.id }.toSet(),
                persisted.timeSlots.map { slot -> slot.id }.toSet(),
            )
            assertEquals(
                baseline.canonicalState.event.eventOfficials.map { official -> official.id }.toSet(),
                persisted.event.eventOfficials.map { official -> official.id }.toSet(),
            )

            val reloaded = host.eventRepository.getEventEditor(created.id).getOrThrow().canonicalState
            assertEquals(editedName, reloaded.event.name)
            assertEquals("PUBLISHED", reloaded.event.state)
            assertEquals(persisted.fields.map { field -> field.id }.toSet(), reloaded.fields.map { field -> field.id }.toSet())
            assertEquals(
                persisted.timeSlots.map { slot -> slot.id }.toSet(),
                reloaded.timeSlots.map { slot -> slot.id }.toSet(),
            )
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

            val createdEvent = runCatching {
                host.createEventThroughEditor(
                    event = variant.event,
                    fields = variant.fields,
                    timeSlots = variant.timeSlots,
                    operationId = "mobile-editor-lifecycle-${variant.event.id}",
                )
            }.getOrElse { error ->
                error("Failed to create ${variant.key}: ${error.backendSummary()}")
            }
            createdEventIds += createdEvent.id

            createdEvents += createdEvent
            assertCreatedEventShape(variant = variant, event = createdEvent)

            if (
                variant.event.eventType.isSchedulable() &&
                !variant.event.autoCreatePointMatchIncidents
            ) {
                registerSeededTeamsForVariant(
                    host = host,
                    variant = variant,
                    event = createdEvent,
                    hostUserId = hostUser.id,
                )
            }

            val publishedEvent = if (createdEvent.state == "UNPUBLISHED") {
                val baseline = host.eventRepository.getEventEditor(createdEvent.id).getOrElse { error ->
                    error("Failed to load ${variant.key} editor for publish: ${error.backendSummary()}")
                }
                val publishedState = baseline.canonicalState.copy(
                    event = baseline.canonicalState.event.copy(state = "PUBLISHED"),
                )
                val publishCommand = EventEditorSessionMapper.toSaveCommand(
                    session = baseline,
                    mutation = EventEditorMutation(
                        canonicalState = EventEditorCanonicalState(
                            event = publishedState.event,
                            fields = publishedState.fields,
                            timeSlots = publishedState.timeSlots,
                            leagueScoringConfig = publishedState.leagueScoringConfig,
                            questions = publishedState.questions,
                            pendingStaffInvites = publishedState.pendingStaffInvites,
                            playoffDivisionDetails = publishedState.playoffDivisionDetails,
                            divisionFieldIds = publishedState.divisionFieldIds,
                        ),
                    ),
                )
                val publishOutcome = host.eventRepository.saveEventEditor(
                    eventId = createdEvent.id,
                    command = publishCommand,
                ).getOrElse { error ->
                    error("Failed to publish ${variant.key}: ${error.backendSummary()}")
                }
                publishOutcome.session.canonicalState.event
            } else {
                createdEvent
            }
            if (variant.event.autoCreatePointMatchIncidents) {
                registerRosterTeamsForPointIncidentVariant(
                    host = host,
                    variant = variant,
                    event = publishedEvent,
                    hostUserId = hostUser.id,
                )
            }

            val persistedEvent = host.eventRepository.getEvent(publishedEvent.id).getOrThrow()
            assertEventResourcesPersisted(
                participant = host,
                variant = variant,
                loadedEvent = persistedEvent,
            )
            val scheduledEvent = if (variant.event.eventType.isSchedulable()) {
                val existingMatches = host.matchRepository.getMatchesOfTournament(publishedEvent.id).getOrElse { error ->
                    error("Failed to inspect existing schedule for ${variant.key}: ${error.backendSummary()}")
                }
                if (existingMatches.isNotEmpty()) {
                    host.eventRepository.getEvent(publishedEvent.id).getOrThrow()
                } else {
                    val maintenanceResponse = host.eventRepository.proposeEventScheduleMaintenance(
                        EventEditorMaintenanceRequestDto(
                            contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                            eventId = publishedEvent.id,
                            operation = EventEditorMaintenanceOperation.BUILD,
                            operationId = "mobile-maintenance-build-${variant.key}",
                            participantCount = publishedEvent.maxParticipants.takeIf { it > 0 },
                            includePlaceholderTeams = true,
                        ),
                    ).getOrElse { error ->
                        error("Failed to propose schedule for ${variant.key}: ${error.backendSummary()}")
                    }
                    when (maintenanceResponse) {
                        is EventEditorMaintenanceResponseDto.Proposed -> {
                            val proposal = maintenanceResponse.proposal
                            host.eventRepository.acceptEventScheduleMaintenance(
                                EventEditorAcceptMaintenanceProposalDto(
                                    contractVersion = proposal.contractVersion,
                                    eventId = proposal.eventId,
                                    operation = proposal.operation,
                                    operationId = proposal.operationId,
                                    proposalRevision = proposal.proposalRevision,
                                    acceptanceOperationId = "mobile-maintenance-accept-${variant.key}",
                                ),
                            ).getOrElse { error ->
                                error("Failed to accept schedule for ${variant.key}: ${error.backendSummary()}")
                            }
                            host.eventRepository.getEvent(publishedEvent.id).getOrThrow()
                        }
                        is EventEditorMaintenanceResponseDto.Accepted ->
                            host.eventRepository.getEvent(publishedEvent.id).getOrThrow()
                        is EventEditorMaintenanceResponseDto.Rejected ->
                            error("Schedule maintenance was rejected for ${variant.key}")
                    }.also { event ->
                        assertCreatedEventShape(variant = variant, event = event)
                    }
                }
            } else {
                null
            }

            val readSession = if (variant.event.eventType.isSchedulable()) host else participant
            val participantLoadedEvent = readSession.eventRepository.getEvent(
                (scheduledEvent ?: publishedEvent).id,
            ).getOrThrow()

            val joinResult = participant.eventRepository.addCurrentUserToEvent(
                event = participantLoadedEvent,
                preferredDivisionId = participantLoadedEvent.divisions.firstOrNull() ?: variant.primaryDivisionId,
                occurrence = variant.occurrence,
            ).getOrElse { error ->
                error("Failed to join ${variant.key}: ${error.backendSummary()}")
            }

            assertFalse(joinResult.requiresParentApproval, "${variant.key} should not require parent approval")
            assertFalse(joinResult.joinedWaitlist, "${variant.key} should not join the waitlist")

            if (scheduledEvent != null) {
                val matches = host.matchRepository.getMatchesOfTournament(publishedEvent.id).getOrElse { error ->
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
    @Test
    fun event_editor_rejects_invalid_organization_staff_as_typed_input() = runTest(timeout = 15.minutes) {
        hostSession = MobileApiTestSession.create()
        val host = hostSession!!
        val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
        val variant = buildVariant(
            runId = "mobile_api_invalid_staff_${Clock.System.now().toEpochMilliseconds()}",
            key = "invalid_staff",
            hostUserId = hostUser.id,
            eventType = EventType.EVENT,
            sportId = "Basketball",
            singleDivision = true,
            includePlayoffs = false,
            officialCase = OfficialCase.NO_OFFICIALS,
            start = Instant.parse("2026-10-01T15:00:00Z"),
            end = Instant.parse("2026-10-02T05:00:00Z"),
        )

        val failure = runCatching {
            host.createEventThroughEditor(
                event = variant.event.copy(assistantHostIds = listOf("dev_user_3")),
                fields = variant.fields,
                timeSlots = variant.timeSlots,
                operationId = "mobile-editor-invalid-staff-${variant.event.id}",
            )
        }.exceptionOrNull()
        val apiException = failure as? EventEditorApiException
            ?: error("Expected a typed API failure, received ${failure?.backendSummary()}")

        assertEquals(400, apiException.statusCode)
        assertTrue(apiException.responseBody.orEmpty().contains("INVALID_EDITOR_INPUT"))
        assertTrue(
            apiException.responseBody.orEmpty().contains("active organization hosts and officials"),
        )
    }
    @Test
    fun event_editor_creates_a_valid_mobile_event() = runTest(timeout = 15.minutes) {
        hostSession = MobileApiTestSession.create()
        val host = hostSession!!
        val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
        val variant = buildVariant(
            runId = "mobile_api_create_${Clock.System.now().toEpochMilliseconds()}",
            key = "create_smoke",
            hostUserId = hostUser.id,
            eventType = EventType.EVENT,
            sportId = "Basketball",
            singleDivision = true,
            includePlayoffs = false,
            officialCase = OfficialCase.NO_OFFICIALS,
            start = Instant.parse("2026-10-02T15:00:00Z"),
            end = Instant.parse("2026-10-03T05:00:00Z"),
        )

        val createdEvent = host.createEventThroughEditor(
            event = variant.event,

            fields = variant.fields,
            timeSlots = variant.timeSlots,
            operationId = "mobile-editor-create-smoke-${variant.event.id}",
        )
        createdEventIds += createdEvent.id

        assertCreatedEventShape(variant = variant, event = createdEvent)
        assertEquals(variant.event.organizationId, createdEvent.organizationId)
        assertTrue(createdEvent.fieldIds.isNotEmpty())
        assertTrue(createdEvent.timeSlotIds.isNotEmpty())
    }
    // Requires MVP_TEST_BACKEND_URL and the seeded host account/bootstrap fixtures. The existing
    // @Before gate skips this real HTTP test when the loopback backend prerequisite is absent.
    @Test
    fun given_mobile_complete_maintenance_when_accepted_then_placed_rows_are_preserved_and_event_batch_is_refreshed() =
        runTest(timeout = 15.minutes) {
            hostSession = MobileApiTestSession.create()
            val host = hostSession!!
            val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
            val runId = "mobile-maintenance-complete-${Clock.System.now().toEpochMilliseconds()}"
            val eventFixture = createMaintenanceLeagueEvent(
                host = host,
                hostUserId = hostUser.id,
                runId = runId,
            )
            createdEventIds += eventFixture.event.id
            val dispatches = observeMaintenanceDispatches(host, eventFixture.event.id)
            val partialFixture = preparePartialMaintenanceGraph(host, eventFixture)
            assertTrue(
                partialFixture.matches.any { it.placementState.equals("PLACED", ignoreCase = true) },
            )

            widenMaintenanceLeagueSlot(host, eventFixture.event.id)
            val completeOperationId = "${eventFixture.event.id}-complete"
            val completeProposalResponse = host.eventRepository.proposeEventScheduleMaintenance(
                EventEditorMaintenanceRequestDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    eventId = eventFixture.event.id,
                    operation = EventEditorMaintenanceOperation.COMPLETE,
                    operationId = completeOperationId,
                    participantCount = eventFixture.event.maxParticipants,
                    includePlaceholderTeams = true,
                ),
            ).getOrElse { error ->
                error("Failed to propose COMPLETE maintenance: ${error.backendSummary()}")
            }
            val completeProposal = (completeProposalResponse as? EventEditorMaintenanceResponseDto.Proposed)
                ?.proposal
                ?: error("Expected a COMPLETE maintenance proposal, received $completeProposalResponse")
            assertEquals(EventEditorMaintenanceOperation.COMPLETE, completeProposal.operation)
            assertEquals(eventFixture.event.id, completeProposal.eventId)
            assertEquals(EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE, completeProposal.scheduleOutcome.status)
            assertCompleteMaintenanceOutcome(completeProposal.scheduleOutcome)

            assertMaintenanceDispatch(
                dispatches = dispatches,
                index = 0,
                method = HttpMethod.Post,
                eventId = eventFixture.event.id,
                operation = EventEditorMaintenanceOperation.COMPLETE,
                operationId = completeOperationId,
                participantCount = eventFixture.event.maxParticipants,
            )

            val placedBeforeComplete = partialFixture.matches.first { match ->
                match.placementState.equals("PLACED", ignoreCase = true)
            }
            assertTrue(completeProposal.protectedMatchIds.contains(placedBeforeComplete.id))
            assertProjectionPreservesMatch(
                projection = completeProposal.graph.matches.single { it.id == placedBeforeComplete.id },
                match = placedBeforeComplete,
            )

            val completeAcceptanceOperationId = "${eventFixture.event.id}-complete-accept"
            val completeAccepted = host.eventRepository.acceptEventScheduleMaintenance(
                EventEditorAcceptMaintenanceProposalDto(
                    contractVersion = completeProposal.contractVersion,
                    eventId = completeProposal.eventId,
                    operation = completeProposal.operation,
                    operationId = completeProposal.operationId,
                    proposalRevision = completeProposal.proposalRevision,
                    acceptanceOperationId = completeAcceptanceOperationId,
                ),
            ).getOrElse { error ->
                error("Failed to accept COMPLETE maintenance: ${error.backendSummary()}")
            }
            assertEquals(EventEditorMaintenanceOperation.COMPLETE, completeAccepted.operation)
            assertEquals(EventEditorMaintenanceResponseStatus.ACCEPTED, completeAccepted.status)
            assertEquals(completeAcceptanceOperationId, completeAccepted.acceptanceOperationId)
            assertCompleteMaintenanceOutcome(completeAccepted.scheduleOutcome)

            assertMaintenanceDispatch(
                dispatches = dispatches,
                index = 1,
                method = HttpMethod.Put,
                eventId = eventFixture.event.id,
                operation = EventEditorMaintenanceOperation.COMPLETE,
                operationId = completeOperationId,
                acceptanceOperationId = completeAcceptanceOperationId,
            )

            val preservedProjection = completeAccepted.graph.matches.single {
                it.id == placedBeforeComplete.id
            }
            assertProjectionPreservesMatch(preservedProjection, placedBeforeComplete)
            assertEquals(
                completeAccepted.graph.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                completeAccepted.scheduleOutcome.matches.map(EventEditorMatchProjectionDto::id).toSet(),
            )

            val refreshedEvent = host.eventRepository.getEventsByIds(
                listOf(eventFixture.event.id),
            ).getOrElse { error ->
                error("Failed to refresh Event batch after COMPLETE acceptance: ${error.backendSummary()}")
            }.singleOrNull { eventRow -> eventRow.id == eventFixture.event.id }
                ?: error("Fresh COMPLETE Event batch did not contain ${eventFixture.event.id}.")
            assertEquals(eventFixture.event.id, refreshedEvent.id)
            val roomMatches = host.database.getMatchDao.getMatchesOfTournament(eventFixture.event.id)
            assertMaintenanceGraphMatches(
                projections = completeAccepted.graph.matches,
                matches = roomMatches,
                context = "COMPLETE Room graph",
            )
            val batchMatches = host.matchRepository.getMatchesByEventIds(listOf(eventFixture.event.id)).getOrElse { error ->
                error("Failed to refresh accepted COMPLETE matches through the batch endpoint: ${error.backendSummary()}")
            }
            assertMaintenanceGraphMatches(
                projections = completeAccepted.graph.matches,
                matches = batchMatches,
                context = "COMPLETE batch graph",
            )
            assertProjectionPreservesMatch(
                projection = completeAccepted.graph.matches.single { it.id == placedBeforeComplete.id },
                match = batchMatches.single { it.id == placedBeforeComplete.id },
            )
        }

    // Requires MVP_TEST_BACKEND_URL and the seeded host account/bootstrap fixtures. The existing
    // @Before gate skips this real HTTP test when the loopback backend prerequisite is absent.
    @Test
    fun mobile_rebuild_maintenance_preserves_protected_rows_and_refreshes_replacements() =
        runTest(timeout = 15.minutes) {
            hostSession = MobileApiTestSession.create()
            val host = hostSession!!
            val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
            val runId = "mobile-maintenance-rebuild-${Clock.System.now().toEpochMilliseconds()}"
            val eventFixture = createMaintenanceLeagueEvent(
                host = host,
                hostUserId = hostUser.id,
                runId = runId,
                singleDivision = false,
            )
            createdEventIds += eventFixture.event.id
            val dispatches = observeMaintenanceDispatches(host, eventFixture.event.id)
            val partialFixture = preparePartialMaintenanceGraph(host, eventFixture)
            val placedBeforeRebuild = partialFixture.matches.first { match ->
                match.placementState.equals("PLACED", ignoreCase = true)
            }
            val startedProtectedMatch = host.matchRepository.updateMatchOperations(
                match = placedBeforeRebuild,
                lifecycle = MatchLifecycleOperationDto(
                    status = "IN_PROGRESS",
                    actualStart = Clock.System.now().toString(),
                ),
            ).getOrElse { error ->
                error("Failed to start the protected maintenance match: ${error.backendSummary()}")
            }
            host.matchRepository.updateMatch(
                startedProtectedMatch.copy(locked = true),
            ).getOrElse { error ->
                error("Failed to mark the protected maintenance match: ${error.backendSummary()}")
            }
            val protectedBeforeRebuild = host.matchRepository
                .getMatchesOfTournament(eventFixture.event.id)
                .getOrElse { error ->
                    error("Failed to reload the protected maintenance match: ${error.backendSummary()}")
                }
                .single { it.id == placedBeforeRebuild.id }
            assertTrue(protectedBeforeRebuild.locked)

            val replaceableBeforeRebuild = partialFixture.matches.first { match ->
                match.division != protectedBeforeRebuild.division
            }
            host.matchRepository.saveMatchLocally(
                replaceableBeforeRebuild.copy(
                    fieldId = "stale-local-field",
                    start = eventFixture.event.start,
                    end = eventFixture.event.start + 10.minutes,
                    placementState = "PLACED",
                ),
            ).getOrElse { error ->
                error("Failed to create the stale local replacement row: ${error.backendSummary()}")
            }
            val staleRowId = "${eventFixture.event.id}-stale-rebuild-row"
            host.matchRepository.saveMatchLocally(
                replaceableBeforeRebuild.copy(
                    id = staleRowId,
                    matchId = 999,
                    fieldId = null,
                    start = null,
                    end = null,
                    placementState = "UNPLACED",
                    locked = false,
                ),
            ).getOrElse { error ->
                error("Failed to create the stale local-only row: ${error.backendSummary()}")
            }

            val rebuildOperationId = "${eventFixture.event.id}-rebuild"
            val rebuildProposalResponse = host.eventRepository.proposeEventScheduleMaintenance(
                EventEditorMaintenanceRequestDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    eventId = eventFixture.event.id,
                    operation = EventEditorMaintenanceOperation.REBUILD,
                    operationId = rebuildOperationId,
                    participantCount = eventFixture.event.maxParticipants,
                    includePlaceholderTeams = true,
                ),
            ).getOrElse { error ->
                error("Failed to propose REBUILD maintenance: ${error.backendSummary()}")
            }
            val rebuildProposal = (rebuildProposalResponse as? EventEditorMaintenanceResponseDto.Proposed)
                ?.proposal
                ?: error("Expected a REBUILD maintenance proposal, received $rebuildProposalResponse")
            assertEquals(EventEditorMaintenanceOperation.REBUILD, rebuildProposal.operation)
            assertEquals(eventFixture.event.id, rebuildProposal.eventId)
            val protectedPhaseId = protectedBeforeRebuild.division
            val expectedProtectedMatchIds = partialFixture.matches
                .filter { match -> match.division == protectedPhaseId }
                .map(MatchMVP::id)
                .toSet()
            assertEquals(expectedProtectedMatchIds, rebuildProposal.protectedMatchIds.toSet())
            assertIncompleteMaintenanceOutcome(rebuildProposal.scheduleOutcome)
            assertProjectionPreservesMatch(
                projection = rebuildProposal.graph.matches.single { it.id == protectedBeforeRebuild.id },
                match = protectedBeforeRebuild,
            )

            assertMaintenanceDispatch(
                dispatches = dispatches,
                index = 0,
                method = HttpMethod.Post,
                eventId = eventFixture.event.id,
                operation = EventEditorMaintenanceOperation.REBUILD,
                operationId = rebuildOperationId,
                participantCount = eventFixture.event.maxParticipants,
            )

            val rebuildAcceptanceOperationId = "${eventFixture.event.id}-rebuild-accept"
            val rebuildAccepted = host.eventRepository.acceptEventScheduleMaintenance(
                EventEditorAcceptMaintenanceProposalDto(
                    contractVersion = rebuildProposal.contractVersion,
                    eventId = rebuildProposal.eventId,
                    operation = rebuildProposal.operation,
                    operationId = rebuildProposal.operationId,
                    proposalRevision = rebuildProposal.proposalRevision,
                    acceptanceOperationId = rebuildAcceptanceOperationId,
                ),
            ).getOrElse { error ->
                error("Failed to accept REBUILD maintenance: ${error.backendSummary()}")
            }
            assertEquals(EventEditorMaintenanceOperation.REBUILD, rebuildAccepted.operation)
            assertEquals(EventEditorMaintenanceResponseStatus.ACCEPTED, rebuildAccepted.status)
            assertEquals(rebuildAcceptanceOperationId, rebuildAccepted.acceptanceOperationId)
            assertEquals(expectedProtectedMatchIds, rebuildAccepted.protectedMatchIds.toSet())
            assertIncompleteMaintenanceOutcome(rebuildAccepted.scheduleOutcome)
            assertEquals(
                rebuildAccepted.graph.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                rebuildAccepted.scheduleOutcome.matches.map(EventEditorMatchProjectionDto::id).toSet(),
            )

            assertMaintenanceDispatch(
                dispatches = dispatches,
                index = 1,
                method = HttpMethod.Put,
                eventId = eventFixture.event.id,
                operation = EventEditorMaintenanceOperation.REBUILD,
                operationId = rebuildOperationId,
                acceptanceOperationId = rebuildAcceptanceOperationId,
            )

            val roomMatches = host.database.getMatchDao.getMatchesOfTournament(eventFixture.event.id)
            assertFalse(roomMatches.any { it.id == staleRowId })
            assertMaintenanceGraphMatches(
                projections = rebuildAccepted.graph.matches,
                matches = roomMatches,
                context = "REBUILD Room graph",
            )
            assertProjectionPreservesMatch(
                projection = rebuildAccepted.graph.matches.single { it.id == protectedBeforeRebuild.id },
                match = roomMatches.single { it.id == protectedBeforeRebuild.id },
            )
            val replacementProjections = rebuildAccepted.graph.matches.filterNot {
                it.id == protectedBeforeRebuild.id
            }
            assertTrue(replacementProjections.isNotEmpty())
            replacementProjections.forEach { projection ->
                val currentReplacement = roomMatches.single { it.id == projection.id }
                assertEquals(projection.fieldId, currentReplacement.fieldId)
                assertEquals(projection.start?.let(Instant::parse), currentReplacement.start)
                assertEquals(projection.end?.let(Instant::parse), currentReplacement.end)
                assertFalse(
                    currentReplacement.fieldId == "stale-local-field",
                    "REBUILD must replace stale local schedule fields for replacement rows.",
                )
            }

            val refreshedEvent = host.eventRepository.getEventsByIds(
                listOf(eventFixture.event.id),
            ).getOrElse { error ->
                error("Failed to refresh Event batch after REBUILD acceptance: ${error.backendSummary()}")
            }.singleOrNull { eventRow -> eventRow.id == eventFixture.event.id }
                ?: error("Fresh REBUILD Event batch did not contain ${eventFixture.event.id}.")
            assertEquals(eventFixture.event.id, refreshedEvent.id)
            val batchMatches = host.matchRepository.getMatchesByEventIds(listOf(eventFixture.event.id)).getOrElse { error ->
                error("Failed to refresh accepted REBUILD matches through the batch endpoint: ${error.backendSummary()}")
            }
            assertFalse(batchMatches.any { it.id == staleRowId })
            assertMaintenanceGraphMatches(
                projections = rebuildAccepted.graph.matches,
                matches = batchMatches,
                context = "REBUILD batch graph",
            )
            assertProjectionPreservesMatch(
                projection = rebuildAccepted.graph.matches.single { it.id == protectedBeforeRebuild.id },
                match = batchMatches.single { it.id == protectedBeforeRebuild.id },
            )
        }

    private data class MaintenanceLeagueEventFixture(
        val event: Event,
        val slot: TimeSlot,
        val matches: List<MatchMVP>,
    )

    private data class PartialMaintenanceFixture(
        val event: Event,
        val slot: TimeSlot,
        val matches: List<MatchMVP>,
    )

    private data class MaintenanceDispatch(
        val method: HttpMethod,
        val body: JsonObject,
    )

    private suspend fun createMaintenanceLeagueEvent(
        host: MobileApiTestSession,
        hostUserId: String,
        runId: String,
        singleDivision: Boolean = true,
    ): MaintenanceLeagueEventFixture {
        val source = buildVariant(
            runId = runId,
            key = "maintenance",
            hostUserId = hostUserId,
            eventType = EventType.LEAGUE,
            sportId = "Basketball",
            singleDivision = singleDivision,
            includePlayoffs = false,
            officialCase = OfficialCase.NO_OFFICIALS,
            start = Instant.parse("2026-10-05T15:00:00Z"),
            end = Instant.parse("2026-10-31T23:00:00Z"),
        )
        val teams = source.event.teamIds.ifEmpty {
            source.event.divisionDetails.flatMap { division -> division.teamIds }.distinct()
        }
        val divisions = source.event.divisionDetails.map { division ->
            val divisionTeams = division.teamIds
            division.copy(
                maxParticipants = divisionTeams.size,
                gamesPerOpponent = 1,
                teamIds = divisionTeams,
                fieldIds = division.fieldIds,
            )
        }
        val fields = if (singleDivision) {
            listOf(source.fields.first { source.primaryDivisionId in it.divisions })
        } else {
            source.fields
        }
        val slots = if (singleDivision) {
            val field = fields.single()
            listOf(source.timeSlots.first().copy(
                id = "${source.event.id}_maintenance_slot",
                dayOfWeek = 1,
                daysOfWeek = listOf(1),
                divisions = listOf(source.primaryDivisionId),
                startTimeMinutes = 8 * 60,
                endTimeMinutes = 8 * 60 + 30,
                startDate = source.event.start,
                timeZone = "America/Los_Angeles",
                repeating = false,
                endDate = source.event.start + 30.minutes,
                scheduledFieldId = field.id,
                scheduledFieldIds = listOf(field.id),
            ))
        } else {
            source.timeSlots.map { slot ->
                slot.copy(id = "${slot.id}_maintenance_slot")
            }
        }
        val event = source.event.copy(
            name = "Mobile Maintenance ${runId.substringAfterLast('-')}",
            divisions = source.event.divisions,
            divisionDetails = divisions,
            fieldIds = fields.map(Field::id),
            timeSlotIds = slots.map(TimeSlot::id),
            teamIds = teams,
            maxParticipants = teams.size,
            gamesPerOpponent = 1,
            isAutomatedScheduling = true,
            includePlayoffs = false,
            playoffTeamCount = null,
            noFixedEndDateTime = false,
            singleDivision = singleDivision,
        )
        val prepared = host.prepareEventEditorCreate(
            event = event,
            fields = fields,
            timeSlots = slots,
            operationId = "${event.id}-create",
        )
        check(prepared.command.draft.participation.maxParticipants == teams.size) {
            "Mobile maintenance create dropped event participant capacity: " +
                "actual=${prepared.command.draft.participation.maxParticipants}, expected=${teams.size}."
        }
        check(prepared.command.draft.competition.divisionDetails.all { detail ->
            detail.maxParticipants?.let { it > 0 } == true
        }) {
            "Mobile maintenance create dropped division participant capacity."
        }
        check(prepared.command.draft.competition.divisionDetails.flatMap { detail -> detail.teamIds } == teams) {
            "Mobile maintenance create dropped source division team ids: " +
                "actual=${prepared.command.draft.competition.divisionDetails.flatMap { detail -> detail.teamIds }}, expected=$teams."
        }
        val createOnlyOutcome = host.eventRepository.createEventEditor(
            prepared.command.copy(
                completion = EventEditorCreateCompletionDto(EventEditorCreateCompletionMode.CREATE_ONLY),
                hasScheduleProposalSupport = false,
            ),
        ).getOrElse { error ->
            error("Failed to create maintenance fixture Event: ${error.backendSummary()}")
        }
        check(createOnlyOutcome.proposal == null) {
            "CREATE_ONLY maintenance fixture unexpectedly returned a schedule proposal."
        }
        val createdEvent = createOnlyOutcome.session.canonicalState.event
        check(createdEvent.id.isNotBlank()) {
            "Maintenance fixture did not receive a server-owned Event id."
        }
        val createOnlyMatches = host.matchRepository.getMatchesOfTournament(createdEvent.id).getOrElse { error ->
            error("Failed to reload CREATE_ONLY maintenance fixture matches: ${error.backendSummary()}")
        }
        assertTrue(createOnlyMatches.isNotEmpty())
        assertTrue(
            createOnlyMatches.all { match ->
                match.placementState.equals("UNPLACED", ignoreCase = true)
            },
        )
        return MaintenanceLeagueEventFixture(
            event = createdEvent,
            slot = slots.first(),
            matches = createOnlyMatches,
        )
    }

    private suspend fun preparePartialMaintenanceGraph(
        host: MobileApiTestSession,
        fixture: MaintenanceLeagueEventFixture,
    ): PartialMaintenanceFixture {
        val candidate = fixture.matches.first()
        val fieldId = fixture.slot.scheduledFieldId
            ?: error("Maintenance fixture slot is missing scheduledFieldId.")
        val placedCandidate = candidate.copy(
            fieldId = fieldId,
            start = fixture.slot.startDate,
            end = fixture.slot.startDate + 20.minutes,
        )
        host.matchRepository.updateMatchesBulk(
            matches = listOf(placedCandidate),
        ).getOrElse { error ->
            error("Failed to place the initial maintenance match: ${error.backendSummary()}")
        }
        val matches = host.matchRepository.getMatchesOfTournament(fixture.event.id).getOrElse { error ->
            error("Failed to reload the initially placed maintenance match: ${error.backendSummary()}")
        }
        assertTrue(
            matches.any { match ->
                match.id == candidate.id && match.placementState.equals("PLACED", ignoreCase = true)
            },
            "The maintenance fixture must contain one placed row before maintenance runs.",
        )
        return PartialMaintenanceFixture(
            event = fixture.event,
            slot = fixture.slot,
            matches = matches,
        )
    }

    private suspend fun widenMaintenanceLeagueSlot(
        host: MobileApiTestSession,
        eventId: String,
    ) {
        val baseline = host.eventRepository.getEventEditor(eventId).getOrElse { error ->
            error("Failed to open the maintenance Event editor: ${error.backendSummary()}")
        }
        val currentSlot = baseline.canonicalState.timeSlots.single()
        val startTimeMinutes = currentSlot.startTimeMinutes
            ?: error("Maintenance fixture slot is missing startTimeMinutes.")
        val widenedSlot = currentSlot.copy(
            endTimeMinutes = startTimeMinutes + 180,
            endDate = currentSlot.startDate + 180.minutes,
        )
        val outcome = host.eventRepository.saveEventEditor(
            eventId = eventId,
            command = EventEditorSessionMapper.toSaveCommand(
                session = baseline,
                mutation = EventEditorMutation(
                    canonicalState = baseline.canonicalState.copy(
                        timeSlots = listOf(widenedSlot),
                    ),
                ),
            ),
        ).getOrElse { error ->
            error("Failed to widen the maintenance fixture slot: ${error.backendSummary()}")
        }
        assertEquals(
            startTimeMinutes + 180,
            outcome.session.canonicalState.timeSlots.single().endTimeMinutes,
        )
    }

    private fun observeMaintenanceDispatches(
        host: MobileApiTestSession,
        eventId: String,
    ): MutableList<MaintenanceDispatch> {
        val dispatches = mutableListOf<MaintenanceDispatch>()
        host.httpClient.plugin(HttpSend).intercept { request ->
            if (request.url.encodedPath.trimEnd('/') == "/api/events/$eventId/schedule") {
                maintenanceRequestBody(request.body)?.let { body ->
                    dispatches += MaintenanceDispatch(
                        method = request.method,
                        body = body,
                    )
                }
            }
            execute(request)
        }
        return dispatches
    }

    private fun maintenanceRequestBody(body: Any?): JsonObject? = when (body) {
        is OutgoingContent.ByteArrayContent -> runCatching {
            jsonMVP.parseToJsonElement(body.bytes().decodeToString()).jsonObject
        }.getOrNull()
        is OutgoingContent.ContentWrapper -> maintenanceRequestBody(body.delegate())
        else -> null
    }

    private fun assertMaintenanceDispatch(
        dispatches: List<MaintenanceDispatch>,
        index: Int,
        method: HttpMethod,
        eventId: String,
        operation: EventEditorMaintenanceOperation,
        operationId: String,
        participantCount: Int = 4,
        acceptanceOperationId: String? = null,
    ) {
        val dispatch = dispatches.getOrNull(index)
            ?: error("Expected maintenance dispatch $index, captured ${dispatches.size}.")
        assertEquals(method, dispatch.method)
        val expectedKeys = if (method == HttpMethod.Post) {
            setOf(
                "contractVersion",
                "eventId",
                "operation",
                "operationId",
                "participantCount",
                "includePlaceholderTeams",
            )
        } else {
            setOf(
                "contractVersion",
                "eventId",
                "operation",
                "operationId",
                "proposalRevision",
                "acceptanceOperationId",
            )
        }
        assertEquals(expectedKeys, dispatch.body.keys)
        assertEquals(EVENT_EDITOR_CONTRACT_VERSION.toString(), dispatch.body["contractVersion"]?.jsonPrimitive?.content)
        assertEquals(eventId, dispatch.body["eventId"]?.jsonPrimitive?.content)
        assertEquals(operation.name, dispatch.body["operation"]?.jsonPrimitive?.content)
        assertEquals(operationId, dispatch.body["operationId"]?.jsonPrimitive?.content)
        if (method == HttpMethod.Post) {
            assertEquals(participantCount.toString(), dispatch.body["participantCount"]?.jsonPrimitive?.content)
            assertEquals("true", dispatch.body["includePlaceholderTeams"]?.jsonPrimitive?.content)
        } else {
            assertNotNull(acceptanceOperationId)
            assertNotNull(dispatch.body["proposalRevision"]?.jsonPrimitive?.content)
            assertEquals(
                acceptanceOperationId,
                dispatch.body["acceptanceOperationId"]?.jsonPrimitive?.content,
            )
        }
    }

    private fun assertIncompleteMaintenanceOutcome(
        outcome: com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto,
    ) {
        assertEquals(EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE, outcome.status)
        assertFalse(outcome.isComplete)
        assertTrue(outcome.unplacedMatchCount > 0)
        assertEquals(outcome.matchCount, outcome.matches.size)
        assertEquals(outcome.unplacedMatchCount, outcome.unscheduledMatches.size)
        assertEquals(
            outcome.matches.filter { it.placementState.equals("UNPLACED", ignoreCase = true) }
                .map(EventEditorMatchProjectionDto::id),
            outcome.unscheduledMatches.map { it.id },
        )
    }

    private fun assertCompleteMaintenanceOutcome(
        outcome: com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto,
    ) {
        assertEquals(EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE, outcome.status)
        assertTrue(outcome.isComplete)
        assertEquals(0, outcome.unplacedMatchCount)
        assertTrue(outcome.unscheduledMatches.isEmpty())
        assertEquals(outcome.matchCount, outcome.placedMatchCount)
        assertEquals(outcome.matchCount, outcome.matches.size)
    }

    private fun assertMaintenanceGraphMatches(
        projections: List<EventEditorMatchProjectionDto>,
        matches: List<MatchMVP>,
        context: String,
    ) {
        assertEquals(projections.size, matches.size, "$context row count")
        val matchesById = matches.associateBy(MatchMVP::id)
        assertEquals(
            projections.map(EventEditorMatchProjectionDto::id).toSet(),
            matchesById.keys,
            "$context ids",
        )
        projections.forEach { projection ->
            val match = assertNotNull(matchesById[projection.id], "$context is missing ${projection.id}")
            assertEquals(projection.eventId, match.eventId, "$context ${projection.id} eventId")
            assertEquals(projection.matchId, match.matchId, "$context ${projection.id} matchId")
            assertEquals(projection.team1Id, match.team1Id, "$context ${projection.id} team1Id")
            assertEquals(projection.team2Id, match.team2Id, "$context ${projection.id} team2Id")
            assertEquals(projection.team1Seed, match.team1Seed, "$context ${projection.id} team1Seed")
            assertEquals(projection.team2Seed, match.team2Seed, "$context ${projection.id} team2Seed")
            assertEquals(projection.fieldId, match.fieldId, "$context ${projection.id} fieldId")
            assertEquals(projection.start?.let(Instant::parse), match.start, "$context ${projection.id} start")
            assertEquals(projection.end?.let(Instant::parse), match.end, "$context ${projection.id} end")
            assertEquals(
                projection.placementState.equals(match.placementState, ignoreCase = true),
                true,
                "$context ${projection.id} placementState",
            )
            assertEquals(
                projection.officialCheckedIn,
                match.officialCheckedIn ?: false,
                "$context ${projection.id} officialCheckedIn",
            )
            assertEquals(projection.locked, match.locked, "$context ${projection.id} locked")
            assertEquals(projection.phase, match.phase, "$context ${projection.id} phase")
            assertEquals(projection.sourceDivisionId, match.sourceDivisionId, "$context ${projection.id} sourceDivisionId")
            assertEquals(projection.phaseDivisionId, match.phaseDivisionId, "$context ${projection.id} phaseDivisionId")
            assertEquals(projection.division, match.division, "$context ${projection.id} division")
            assertEquals(projection.side, match.side, "$context ${projection.id} side")
            assertEquals(projection.losersBracket, match.losersBracket, "$context ${projection.id} losersBracket")
            assertEquals(projection.winnerNextMatchId, match.winnerNextMatchId, "$context ${projection.id} winnerNextMatchId")
            assertEquals(projection.loserNextMatchId, match.loserNextMatchId, "$context ${projection.id} loserNextMatchId")
            assertEquals(projection.previousLeftId, match.previousLeftId, "$context ${projection.id} previousLeftId")
            assertEquals(projection.previousRightId, match.previousRightId, "$context ${projection.id} previousRightId")
            assertEquals(projection.status, match.status, "$context ${projection.id} status")
            assertEquals(projection.resultStatus, match.resultStatus, "$context ${projection.id} resultStatus")
            assertEquals(projection.resultType, match.resultType, "$context ${projection.id} resultType")
            assertEquals(projection.actualStart, match.actualStart, "$context ${projection.id} actualStart")
            assertEquals(projection.actualEnd, match.actualEnd, "$context ${projection.id} actualEnd")
            assertEquals(projection.statusReason, match.statusReason, "$context ${projection.id} statusReason")
            assertEquals(projection.winnerEventTeamId, match.winnerEventTeamId, "$context ${projection.id} winnerEventTeamId")
            assertEquals(projection.officialId, match.officialId, "$context ${projection.id} officialId")
            assertEquals(projection.teamOfficialId, match.teamOfficialId, "$context ${projection.id} teamOfficialId")
            assertEquals(projection.officialCheckedIn, match.officialCheckedIn, "$context ${projection.id} officialCheckedIn")
        }
    }

    private fun assertProjectionPreservesMatch(
        projection: EventEditorMatchProjectionDto,
        match: MatchMVP,
    ) {
        assertEquals(match.id, projection.id)
        assertEquals(match.eventId, projection.eventId)
        assertEquals(match.matchId, projection.matchId)
        assertEquals(match.team1Id, projection.team1Id)
        assertEquals(match.team2Id, projection.team2Id)
        assertEquals(match.team1Seed, projection.team1Seed)
        assertEquals(match.team2Seed, projection.team2Seed)
        assertEquals(match.fieldId, projection.fieldId)
        assertEquals(match.start, projection.start?.let(Instant::parse))
        assertEquals(match.end, projection.end?.let(Instant::parse))
        assertTrue(match.placementState.equals(projection.placementState, ignoreCase = true))
        assertEquals(match.locked, projection.locked)
        assertEquals(match.officialCheckedIn ?: false, projection.officialCheckedIn)
        assertEquals(match.phase, projection.phase)
        assertEquals(match.sourceDivisionId, projection.sourceDivisionId)
        assertEquals(match.phaseDivisionId, projection.phaseDivisionId)
        assertEquals(match.division, projection.division)
        assertEquals(match.side, projection.side)
        assertEquals(match.losersBracket, projection.losersBracket)
        assertEquals(match.winnerNextMatchId, projection.winnerNextMatchId)
        assertEquals(match.loserNextMatchId, projection.loserNextMatchId)
        assertEquals(match.previousLeftId, projection.previousLeftId)
        assertEquals(match.previousRightId, projection.previousRightId)
    }

    private suspend fun registerSeededTeamsForVariant(
        host: MobileApiTestSession,
        variant: LifecycleVariant,
        event: Event,
        hostUserId: String,
    ) {
        val divisionIdByTeamId = variant.event.divisionDetails
            .flatMap { detail -> detail.teamIds.map { teamId -> teamId to detail.id } }
            .toMap()

        variant.event.teamIds.forEachIndexed { index, fixtureTeamId ->
            val divisionId = divisionIdByTeamId[fixtureTeamId] ?: variant.primaryDivisionId
            val team = host.teamRepository.createTeam(
                Team(hostUserId).copy(
                    name = "Mobile ${variant.key} Team ${index + 1}",
                    division = divisionId,
                    sport = variant.event.sportIds.firstOrNull(),
                    teamSize = 2,
                ).withSynchronizedMembership(),
            ).getOrElse { error ->
                error("Failed to create team ${index + 1} for ${variant.key}: ${error.backendSummary()}")
            }
            createdTeamIds += team.id

            val response = runCatching {
                host.api.post<EventParticipantsRequestDto, EventParticipantsResponseDto>(
                    path = "api/events/${event.id}/participants",
                    body = EventParticipantsRequestDto(
                        teamId = team.id,
                        divisionId = divisionId,
                    ),
                )
            }.getOrElse { error ->
                error("Failed to register ${team.id} for ${variant.key}: ${error.backendSummary()}")
            }
            response.error?.takeIf(String::isNotBlank)?.let { message ->
                error("Failed to register ${team.id} for ${variant.key}: $message")
            }
        }
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
        val registrationDivisionIds = divisionIds.flatMap { divisionId ->
            listOf(divisionId, divisionId, divisionId)
        }
        registrationDivisionIds.forEachIndexed { index, divisionId ->
            val team = host.teamRepository.createTeam(
                Team(hostUserId).copy(
                    name = "Mobile Incident Team ${index + 1}",
                    division = divisionId,
                    sport = variant.event.sportIds.firstOrNull(),
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
        val segmentId = match.segments.minByOrNull { segment -> segment.sequence }?.id
            ?: "${match.id}_segment_1"
        val incidentId = "${match.id}_mobile_point_incident"

        val updated = host.matchRepository.addMatchIncident(
            match = match,
            operation = MatchIncidentOperationDto(
                action = "CREATE",
                id = incidentId,
                segmentId = segmentId,
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
        val expectedDivisionSet = variant.resourceDivisionIds.map { divisionId ->
            "${loadedEvent.id}__division__${divisionId.substringAfter("__division__")}"
        }.toSet()
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
                assertTrue(
                    slotCount >= 1,
                    "${variant.key} should have at least one time slot for $divisionId",
                )
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


}

private fun lifecycleBackendFixturesReady(): Boolean =
    backendFixturesReady(
        requiredSportIds = REQUIRED_SPORT_IDS,
        bootstrapSportId = REQUIRED_SPORT_IDS.first(),
        credentials = listOf(
            HOST_EMAIL to HOST_PASSWORD,
            PARTICIPANT_EMAIL to PARTICIPANT_PASSWORD,
        ),
    )

private fun contractBackendFixturesReady(
    bootstrapEventType: EventType = EventType.EVENT,
): Boolean =
    backendFixturesReady(
        requiredSportIds = setOf(CONTRACT_SPORT_ID),
        bootstrapSportId = CONTRACT_SPORT_ID,
        bootstrapEventType = bootstrapEventType,
        credentials = listOf(HOST_EMAIL to HOST_PASSWORD),
    )

private fun backendFixturesReady(
    requiredSportIds: Set<String>,
    bootstrapSportId: String,
    bootstrapEventType: EventType = EventType.EVENT,
    credentials: List<Pair<String, String>>,
): Boolean {
    if (System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank()) return false
    if (!mobileApiLoginFixturesReady(*credentials.toTypedArray())) return false
    val session = runCatching { MobileApiTestSession.create() }.getOrElse { return false }
    return try {
        runBlocking {
            session.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
            val sportIds = session.sportsRepository.getSports()
                .getOrNull()
                ?.map { sport -> sport.id }
                ?.toSet()
                .orEmpty()
            if (!requiredSportIds.all(sportIds::contains)) return@runBlocking false

            session.eventRepository.getEventEditorCreateBootstrap(
                EventEditorBootstrapQueryDto(
                    organizationId = SEEDED_ORGANIZATION_ID,
                    eventType = bootstrapEventType.name,
                    sportId = bootstrapSportId,
                ),
            ).getOrThrow()
            true
        }
    } finally {
        session.close()
    }
}

private fun requireBackendFixturesForContract(
    bootstrapEventType: EventType = EventType.EVENT,
) {
    if (System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank()) {
        error("Required mobile/backend contract test requires MVP_TEST_BACKEND_URL.")
    }
    val databaseUrl = System.getenv("MVP_TEST_DATABASE_URL")
        ?.trim()
        ?.takeIf(String::isNotEmpty)
        ?: error("Required mobile/backend contract test requires MVP_TEST_DATABASE_URL.")
    runCatching { validateLocalTestDatabaseUrl(databaseUrl) }.getOrElse { failure ->
        error(failure.message ?: "MVP_TEST_DATABASE_URL is not a safe local PostgreSQL URL.")
    }
    if (
        System.getenv("MVP_TEST_DISABLE_OUTBOUND_PROVIDERS")
            ?.trim()
            ?.lowercase() !in setOf("1", "true", "yes")
    ) {
        error(
            "Required mobile/backend contract test requires " +
                "MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1.",
        )
    }
    if (!mobileApiBackendTestIsolationReady()) {
        error(
            "Required mobile/backend contract test needs a reachable loopback backend " +
                "with outbound providers disabled.",
        )
    }
    val fixturesReady = contractBackendFixturesReady(bootstrapEventType)
    val fixturesPrepared = if (!fixturesReady && shouldAutoSeedBackendFixtures()) {
        runBackendSeedThenCheck(
            seed = { runTargetedBackendSeed() },
            fixturesReady = { contractBackendFixturesReady(bootstrapEventType) },
        )
    } else {
        fixturesReady
    }
    if (!fixturesPrepared) {
        error(
            "Required mobile/backend contract test fixtures are unavailable. " +
                "Set MVP_TEST_ALLOW_DB_SEED=1 or prepare the local backend fixtures.",
        )
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MobileEventEditorApiContractTest {
    private val createdEventIds = mutableListOf<String>()
    private val preparedCreates = mutableListOf<PreparedEventEditorCreate>()
    private var hostSession: MobileApiTestSession? = null

    @Before
    fun requireBackendFixtures() {
        requireBackendFixturesForContract()
    }

    @After
    fun closeSessions() {
        hostSession?.close()
        hostSession = null
    }

    @Test
    fun given_mobile_editor_create_command_when_sent_to_site_then_event_is_persisted() =
        runTest(timeout = 5.minutes) {
            var primaryFailure: Throwable? = null
            try {
                hostSession = MobileApiTestSession.create()
                val host = hostSession!!
                val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
                val runId = "mobile_api_editor_contract_${Clock.System.now().toEpochMilliseconds()}"
                val source = buildVariant(
                    runId = runId,
                    key = "contract",
                    hostUserId = hostUser.id,
                    eventType = EventType.EVENT,
                    sportId = CONTRACT_SPORT_ID,
                    singleDivision = true,
                    includePlayoffs = false,
                    officialCase = OfficialCase.NO_OFFICIALS,
                    start = Instant.parse("2026-09-02T15:00:00Z"),
                    end = Instant.parse("2026-09-03T05:00:00Z"),
                )
                val createdName = "${source.event.name} Contract"
                val created = host.createEventThroughEditor(
                    event = source.event.copy(name = createdName),
                    fields = source.fields,
                    timeSlots = source.timeSlots,
                    operationId = "mobile-editor-contract-$runId",
                    onPrepared = { preparedCreates += it },
                )
                createdEventIds += created.id

                assertCreatedEventShape(source, created)
                assertEquals(createdName, created.name)

                val reloaded = host.eventRepository.getEventEditor(created.id)
                    .getOrElse { error("Failed to reload ${created.id}: ${it.backendSummary()}") }
                    .canonicalState
                assertEquals(created.id, reloaded.event.id)
                assertEquals(createdName, reloaded.event.name)
                assertCreatedEventShape(source, reloaded.event)
                assertEquals(
                    source.fields.map(Field::id).toSet(),
                    reloaded.fields.map(Field::id).toSet(),
                )
                assertEquals(
                    source.timeSlots.map(TimeSlot::id).toSet(),
                    reloaded.timeSlots.map(TimeSlot::id).toSet(),
                )
            } catch (failure: Throwable) {
                primaryFailure = failure
                throw failure
            } finally {
                val cleanupFailures = mutableListOf<Throwable>()
                val host = hostSession
                withContext(NonCancellable + Dispatchers.IO) {
                    suspend fun attemptCleanup(block: suspend () -> Unit) {
                        try {
                            block()
                        } catch (failure: Throwable) {
                            if (failure is kotlinx.coroutines.CancellationException) throw failure
                            cleanupFailures += failure
                        }
                    }

                    try {
                        withTimeout(30_000L) {
                            val cleanupEventIds = linkedSetOf<String>().apply {
                                addAll(createdEventIds)
                            }
                            preparedCreates.asReversed().forEach { prepared ->
                                attemptCleanup {
                                    host?.resolveCreatedEventId(prepared)?.let { resolvedEventId ->
                                        prepared.resolvedEventId = resolvedEventId
                                        cleanupEventIds.add(resolvedEventId)
                                    }
                                }
                            }
                            if (preparedCreates.isNotEmpty()) {
                                attemptCleanup {
                                    host?.purgeMobileEventEditorReceipts(
                                        eventIds = cleanupEventIds,
                                        preparedCreates = preparedCreates,
                                    )?.let(cleanupEventIds::addAll)
                                }
                            }
                            cleanupEventIds.toList().asReversed().forEach { eventId ->
                                attemptCleanup {
                                    host?.api?.deleteNoResponse("api/events/$eventId")
                                }
                            }
                        }
                    } catch (failure: Throwable) {
                        cleanupFailures += failure
                    } finally {
                        createdEventIds.clear()
                        preparedCreates.clear()
                    }
                }
                val cleanupFailure = cleanupFailures.firstOrNull()
                if (cleanupFailure != null) {
                    cleanupFailures.drop(1).forEach(cleanupFailure::addSuppressed)
                    if (primaryFailure != null) {
                        primaryFailure?.addSuppressed(cleanupFailure)
                    } else {
                        throw AssertionError("Mobile contract test cleanup failed.", cleanupFailure)
                    }
                }
            }
        }
    @Test
    fun given_mobile_schedule_operation_when_accepted_then_fresh_batch_sync_shows_schedule() =
        runTest(timeout = 15.minutes) {
            var primaryFailure: Throwable? = null
            try {
                hostSession = MobileApiTestSession.create()
                val host = hostSession!!
                val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
                val runId = "mobile_api_schedule_maintenance_${Clock.System.now().toEpochMilliseconds()}"
                val source = buildVariant(
                    runId = runId,
                    key = "schedule_maintenance",
                    hostUserId = hostUser.id,
                    eventType = EventType.LEAGUE,
                    sportId = "Basketball",
                    singleDivision = true,
                    includePlayoffs = false,
                    officialCase = OfficialCase.NO_OFFICIALS,
                    start = Instant.parse("2026-10-05T15:00:00Z"),
                    end = Instant.parse("2026-10-31T23:00:00Z"),
                )
                val divisionId = source.primaryDivisionId
                val field = source.fields.first { divisionId in it.divisions }
                val teams = source.event.teamIds
                assertTrue(
                    teams.size >= 4,
                    "The maintenance fixture must have enough League teams for a Match Graph.",
                )
                val slot = source.timeSlots.first().copy(
                    id = "${source.event.id}_maintenance_slot",
                    dayOfWeek = 1,
                    daysOfWeek = listOf(1),
                    divisions = listOf(divisionId),
                    startTimeMinutes = 8 * 60,
                    endTimeMinutes = 14 * 60,
                    startDate = source.event.start,
                    timeZone = "America/Los_Angeles",
                    repeating = false,
                    endDate = source.event.start + 360.minutes,
                    scheduledFieldId = field.id,
                    scheduledFieldIds = listOf(field.id),
                )
                val division = source.event.divisionDetails.single().copy(
                    maxParticipants = teams.size,
                    gamesPerOpponent = 1,
                    teamIds = teams,
                    fieldIds = listOf(field.id),
                )
                val event = source.event.copy(
                    name = "Mobile Schedule Maintenance ${runId.substringAfterLast('-')}",
                    divisions = listOf(divisionId),
                    divisionDetails = listOf(division),
                    fieldIds = listOf(field.id),
                    timeSlotIds = listOf(slot.id),
                    teamIds = teams,
                    maxParticipants = teams.size,
                    isAutomatedScheduling = true,
                    includePlayoffs = false,
                    playoffTeamCount = null,
                    noFixedEndDateTime = false,
                    singleDivision = true,
                )

                val prepared = host.prepareEventEditorCreate(
                    event = event,
                    fields = listOf(field),
                    timeSlots = listOf(slot),
                    operationId = "${event.id}-create",
                )
                preparedCreates += prepared
                prepared.createDispatchStarted = true
                val createOnlyOutcome = try {
                    host.eventRepository.createEventEditor(
                        prepared.command.copy(
                            completion = EventEditorCreateCompletionDto(
                                EventEditorCreateCompletionMode.CREATE_ONLY,
                            ),
                            hasScheduleProposalSupport = false,
                        ),
                    ).getOrThrow()
                } finally {
                    prepared.createDispatchTerminal = true
                }
                check(createOnlyOutcome.proposal == null) {
                    "CREATE_ONLY maintenance fixture unexpectedly returned a schedule proposal."
                }
                val createdEvent = createOnlyOutcome.session.canonicalState.event
                prepared.resolvedEventId = createdEvent.id
                createdEventIds += createdEvent.id
                assertTrue(
                    createdEvent.id.isNotBlank(),
                    "The mobile editor must return a server-owned Event id.",
                )
                assertEquals(EventType.LEAGUE, createdEvent.eventType)
                assertTrue(createdEvent.isAutomatedScheduling)

                val editable = host.eventRepository.getEventEditor(createdEvent.id).getOrElse { failure ->
                    error("Failed to reload the editable maintenance Event: ${failure.backendSummary()}")
                }
                assertEquals(createdEvent.id, editable.canonicalState.event.id)
                assertEquals(EventType.LEAGUE, editable.canonicalState.event.eventType)
                assertTrue(editable.canonicalState.event.isAutomatedScheduling)
                val maintenancePostBodies = mutableListOf<JsonObject>()
                host.httpClient.plugin(HttpSend).intercept { request ->
                    if (
                        request.method == HttpMethod.Post &&
                        request.url.encodedPath.trimEnd('/') == "/api/events/${createdEvent.id}/schedule"
                    ) {
                        contractMaintenanceRequestBody(request.body)?.let(maintenancePostBodies::add)
                    }
                    execute(request)
                }

                val initialMatches = host.matchRepository.getMatchesOfTournament(createdEvent.id).getOrElse { failure ->
                    error("Failed to load the CREATE_ONLY maintenance Match Graph: ${failure.backendSummary()}")
                }
                assertTrue(initialMatches.isNotEmpty(), "The editable League must have a Match Graph.")
                assertTrue(
                    initialMatches.any { match ->
                        match.placementState.equals("UNPLACED", ignoreCase = true)
                    },
                    "Complete must start with at least one currently unscheduled Match.",
                )
                val unscheduledBeforeComplete = initialMatches.filter { match ->
                    match.placementState.equals("UNPLACED", ignoreCase = true)
                }
                val candidate = unscheduledBeforeComplete.first()
                val scheduledStart = slot.startDate
                val scheduledFieldId = slot.scheduledFieldId
                    ?: error("The maintenance fixture slot is missing its scheduled Field.")
                val placedCandidate = candidate.copy(
                    fieldId = scheduledFieldId,
                    start = scheduledStart,
                    end = scheduledStart + 20.minutes,
                    placementState = "PLACED",
                )
                host.matchRepository.updateMatchesBulk(
                    matches = listOf(placedCandidate),
                ).getOrElse { failure ->
                    error("Failed to place the initial maintenance Match: ${failure.backendSummary()}")
                }
                val beforeComplete = host.matchRepository.getMatchesOfTournament(createdEvent.id).getOrElse { failure ->
                    error("Failed to reload the partial maintenance Match Graph: ${failure.backendSummary()}")
                }
                val placedBeforeComplete = beforeComplete.single { match -> match.id == candidate.id }
                assertTrue(
                    placedBeforeComplete.placementState.equals("PLACED", ignoreCase = true),
                    "The Complete fixture must contain one placed Match.",
                )
                assertTrue(
                    beforeComplete.any { match ->
                        match.placementState.equals("UNPLACED", ignoreCase = true)
                    },
                    "The Complete fixture must retain an unplaced Match.",
                )

                val completeOperationId = "${createdEvent.id}-complete"
                val completeRevisionBinding = host.eventRepository.getEventEditor(createdEvent.id)
                    .getOrElse { failure ->
                        error("Failed to reload authoritative revisions before COMPLETE: ${failure.backendSummary()}")
                    }
                    .snapshot
                    .revisionBinding
                    ?: error("The editable maintenance Event did not provide COMPLETE revision binding.")
                val completeProposalResponse = host.eventRepository.proposeEventScheduleMaintenance(
                    EventEditorMaintenanceRequestDto(
                        contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                        eventId = createdEvent.id,
                        operation = EventEditorMaintenanceOperation.COMPLETE,
                        operationId = completeOperationId,
                        expectedRevisions = completeRevisionBinding,
                        participantCount = createdEvent.maxParticipants,
                        includePlaceholderTeams = true,
                    ),
                ).getOrElse { failure ->
                    error("Failed to propose COMPLETE maintenance: ${failure.backendSummary()}")
                }
                val completeProposal = (completeProposalResponse as? EventEditorMaintenanceResponseDto.Proposed)
                    ?.proposal
                    ?: error("Expected a COMPLETE proposal, received $completeProposalResponse")
                assertContractMaintenanceRequest(
                    dispatches = maintenancePostBodies,
                    index = 0,
                    eventId = createdEvent.id,
                    operation = EventEditorMaintenanceOperation.COMPLETE,
                    operationId = completeOperationId,
                    expectedRevisions = completeRevisionBinding,
                )
                assertEquals(EventEditorMaintenanceOperation.COMPLETE, completeProposal.operation)
                assertEquals(createdEvent.id, completeProposal.eventId)
                assertEquals(completeOperationId, completeProposal.operationId)
                assertTrue(
                    completeProposal.protectedMatchIds.contains(placedBeforeComplete.id),
                    "Complete must protect the Match that was already placed.",
                )
                assertEquals(
                    EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
                    completeProposal.scheduleOutcome.status,
                )
                assertTrue(completeProposal.scheduleOutcome.isComplete)
                assertEquals(0, completeProposal.scheduleOutcome.unplacedMatchCount)
                assertTrue(completeProposal.scheduleOutcome.unscheduledMatches.isEmpty())
                assertEquals(
                    completeProposal.graph.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                    completeProposal.scheduleOutcome.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                )
                assertContractMaintenanceProjection(
                    projection = completeProposal.graph.matches.single { match ->
                        match.id == placedBeforeComplete.id
                    },
                    match = placedBeforeComplete,
                    context = "COMPLETE proposal protected Match",
                )

                val completeAcceptanceOperationId = "${createdEvent.id}-complete-accept"
                val completeAccepted = host.eventRepository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = completeProposal.contractVersion,
                        eventId = completeProposal.eventId,
                        operation = completeProposal.operation,
                        operationId = completeProposal.operationId,
                        proposalRevision = completeProposal.proposalRevision,
                        acceptanceOperationId = completeAcceptanceOperationId,
                    ),
                ).getOrElse { failure ->
                    error("Failed to accept COMPLETE maintenance: ${failure.backendSummary()}")
                }
                assertEquals(EventEditorMaintenanceResponseStatus.ACCEPTED, completeAccepted.status)
                assertEquals(completeAcceptanceOperationId, completeAccepted.acceptanceOperationId)
                assertEquals(EventEditorMaintenanceOperation.COMPLETE, completeAccepted.operation)
                assertEquals(completeProposal.operationId, completeAccepted.operationId)
                assertEquals(completeProposal.proposalRevision, completeAccepted.proposalRevision)
                assertEquals(
                    EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
                    completeAccepted.scheduleOutcome.status,
                )
                assertTrue(completeAccepted.scheduleOutcome.isComplete)
                assertEquals(0, completeAccepted.scheduleOutcome.unplacedMatchCount)
                assertTrue(completeAccepted.scheduleOutcome.unscheduledMatches.isEmpty())
                assertContractMaintenanceProjection(
                    projection = completeAccepted.graph.matches.single { match ->
                        match.id == placedBeforeComplete.id
                    },
                    match = placedBeforeComplete,
                    context = "COMPLETE accepted protected Match",
                )
                assertEquals(
                    completeAccepted.graph.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                    completeAccepted.scheduleOutcome.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                )

                val completeRoomMatches = host.database.getMatchDao.getMatchesOfTournament(createdEvent.id)
                assertContractMaintenanceGraph(
                    projections = completeAccepted.graph.matches,
                    matches = completeRoomMatches,
                    context = "COMPLETE accepted Room graph",
                )
                val completeBatchEvent = host.eventRepository.getEventsByIds(
                    listOf(createdEvent.id),
                ).getOrElse { failure ->
                    error("Failed to fresh-sync the accepted COMPLETE Event batch: ${failure.backendSummary()}")
                }.singleOrNull { eventRow -> eventRow.id == createdEvent.id }
                    ?: error("Fresh COMPLETE Event batch did not contain ${createdEvent.id}.")
                assertEquals(EventType.LEAGUE, completeBatchEvent.eventType)
                assertTrue(completeBatchEvent.isAutomatedScheduling)
                assertTrue(completeBatchEvent.fieldIds.contains(field.id))
                assertTrue(completeBatchEvent.timeSlotIds.contains(slot.id))
                val completeBatchMatches = host.matchRepository.getMatchesByEventIds(
                    listOf(createdEvent.id),
                ).getOrElse { failure ->
                    error("Failed to fresh-sync accepted COMPLETE Matches through the batch endpoint: ${failure.backendSummary()}")
                }
                assertContractMaintenanceGraph(
                    projections = completeAccepted.graph.matches,
                    matches = completeBatchMatches,
                    context = "COMPLETE accepted batch graph",
                )
                assertContractMaintenanceProjection(
                    projection = completeAccepted.graph.matches.single { match ->
                        match.id == placedBeforeComplete.id
                    },
                    match = completeBatchMatches.single { match -> match.id == placedBeforeComplete.id },
                    context = "COMPLETE fresh batch placed Match",
                )

                val matchesBeforeRebuild = host.matchRepository.getMatchesOfTournament(createdEvent.id).getOrElse { failure ->
                    error("Failed to reload accepted COMPLETE Matches before REBUILD: ${failure.backendSummary()}")
                }
                val protectedCandidate = matchesBeforeRebuild.single { match ->
                    match.id == placedBeforeComplete.id
                }
                host.matchRepository.updateMatch(
                    protectedCandidate.copy(locked = true),
                ).getOrElse { failure ->
                    error("Failed to lock the protected REBUILD Match: ${failure.backendSummary()}")
                }
                val protectedBeforeRebuild = host.matchRepository
                    .getMatchesOfTournament(createdEvent.id)
                    .getOrElse { failure ->
                        error("Failed to reload the locked REBUILD Match: ${failure.backendSummary()}")
                    }
                    .single { match -> match.id == protectedCandidate.id }
                assertTrue(protectedBeforeRebuild.locked)
                assertTrue(
                    protectedBeforeRebuild.placementState.equals("PLACED", ignoreCase = true),
                    "The protected REBUILD Match must remain placed.",
                )

                val mutableBeforeRebuild = matchesBeforeRebuild.first { match ->
                    match.id != protectedBeforeRebuild.id
                }
                host.matchRepository.saveMatchLocally(
                    mutableBeforeRebuild.copy(
                        fieldId = "stale-local-field",
                        start = createdEvent.start,
                        end = createdEvent.start + 10.minutes,
                        placementState = "PLACED",
                    ),
                ).getOrElse { failure ->
                    error("Failed to stage stale local REBUILD schedule state: ${failure.backendSummary()}")
                }
                val staleRowId = "${createdEvent.id}-stale-rebuild-row"
                host.matchRepository.saveMatchLocally(
                    mutableBeforeRebuild.copy(
                        id = staleRowId,
                        matchId = 999,
                        fieldId = null,
                        start = null,
                        end = null,
                        placementState = "UNPLACED",
                        locked = false,
                    ),
                ).getOrElse { failure ->
                    error("Failed to stage the stale local-only REBUILD row: ${failure.backendSummary()}")
                }

                val rebuildOperationId = "${createdEvent.id}-rebuild"
                val rebuildRevisionBinding = host.eventRepository.getEventEditor(createdEvent.id)
                    .getOrElse { failure ->
                        error("Failed to reload authoritative revisions before REBUILD: ${failure.backendSummary()}")
                    }
                    .snapshot
                    .revisionBinding
                    ?: error("The editable maintenance Event did not provide REBUILD revision binding.")
                val rebuildProposalResponse = host.eventRepository.proposeEventScheduleMaintenance(
                    EventEditorMaintenanceRequestDto(
                        contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                        eventId = createdEvent.id,
                        operation = EventEditorMaintenanceOperation.REBUILD,
                        operationId = rebuildOperationId,
                        expectedRevisions = rebuildRevisionBinding,
                        participantCount = createdEvent.maxParticipants,
                        includePlaceholderTeams = true,
                    ),
                ).getOrElse { failure ->
                    error("Failed to propose REBUILD maintenance: ${failure.backendSummary()}")
                }
                val rebuildProposal = (rebuildProposalResponse as? EventEditorMaintenanceResponseDto.Proposed)
                    ?.proposal
                    ?: error("Expected a REBUILD proposal, received $rebuildProposalResponse")
                assertContractMaintenanceRequest(
                    dispatches = maintenancePostBodies,
                    index = 1,
                    eventId = createdEvent.id,
                    operation = EventEditorMaintenanceOperation.REBUILD,
                    operationId = rebuildOperationId,
                    expectedRevisions = rebuildRevisionBinding,
                )
                assertEquals(EventEditorMaintenanceOperation.REBUILD, rebuildProposal.operation)
                assertEquals(createdEvent.id, rebuildProposal.eventId)
                assertEquals(rebuildOperationId, rebuildProposal.operationId)
                assertEquals(setOf(protectedBeforeRebuild.id), rebuildProposal.protectedMatchIds.toSet())
                val rebuildProtectedProjection = rebuildProposal.graph.matches.singleOrNull { match ->
                    match.id == protectedBeforeRebuild.id
                } ?: error("REBUILD proposal dropped the protected Match identity.")
                assertContractMaintenanceProjection(
                    projection = rebuildProtectedProjection,
                    match = protectedBeforeRebuild,
                    context = "REBUILD proposal protected Match",
                )
                val rebuildReplacementProjections = rebuildProposal.graph.matches.filterNot { match ->
                    match.id == protectedBeforeRebuild.id
                }
                assertTrue(
                    rebuildReplacementProjections.isNotEmpty(),
                    "REBUILD must return replacement rows for mutable work.",
                )
                assertEquals(
                    rebuildProposal.graph.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                    rebuildProposal.scheduleOutcome.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                )

                val rebuildAcceptanceOperationId = "${createdEvent.id}-rebuild-accept"
                val rebuildAccepted = host.eventRepository.acceptEventScheduleMaintenance(
                    EventEditorAcceptMaintenanceProposalDto(
                        contractVersion = rebuildProposal.contractVersion,
                        eventId = rebuildProposal.eventId,
                        operation = rebuildProposal.operation,
                        operationId = rebuildProposal.operationId,
                        proposalRevision = rebuildProposal.proposalRevision,
                        acceptanceOperationId = rebuildAcceptanceOperationId,
                    ),
                ).getOrElse { failure ->
                    error("Failed to accept REBUILD maintenance: ${failure.backendSummary()}")
                }
                assertEquals(EventEditorMaintenanceResponseStatus.ACCEPTED, rebuildAccepted.status)
                assertEquals(rebuildAcceptanceOperationId, rebuildAccepted.acceptanceOperationId)
                assertEquals(EventEditorMaintenanceOperation.REBUILD, rebuildAccepted.operation)
                assertEquals(rebuildProposal.operationId, rebuildAccepted.operationId)
                assertEquals(rebuildProposal.proposalRevision, rebuildAccepted.proposalRevision)
                assertEquals(setOf(protectedBeforeRebuild.id), rebuildAccepted.protectedMatchIds.toSet())
                assertEquals(
                    rebuildAccepted.graph.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                    rebuildAccepted.scheduleOutcome.matches.map(EventEditorMatchProjectionDto::id).toSet(),
                )
                val acceptedRebuildProtectedProjection = rebuildAccepted.graph.matches.singleOrNull { match ->
                    match.id == protectedBeforeRebuild.id
                } ?: error("Accepted REBUILD result dropped the protected Match identity.")
                assertContractMaintenanceProjection(
                    projection = acceptedRebuildProtectedProjection,
                    match = protectedBeforeRebuild,
                    context = "REBUILD accepted protected Match",
                )
                val acceptedRebuildReplacementProjections = rebuildAccepted.graph.matches.filterNot { match ->
                    match.id == protectedBeforeRebuild.id
                }
                assertTrue(
                    acceptedRebuildReplacementProjections.isNotEmpty(),
                    "Accepted REBUILD must contain replacement rows for mutable work.",
                )

                val rebuildRoomMatches = host.database.getMatchDao.getMatchesOfTournament(createdEvent.id)
                assertFalse(
                    rebuildRoomMatches.any { match -> match.id == staleRowId },
                    "Accepted REBUILD must remove stale local-only rows.",
                )
                assertFalse(
                    rebuildRoomMatches.any { match -> match.fieldId == "stale-local-field" },
                    "Accepted REBUILD must replace stale local schedule fields.",
                )
                assertContractMaintenanceGraph(
                    projections = rebuildAccepted.graph.matches,
                    matches = rebuildRoomMatches,
                    context = "REBUILD accepted Room graph",
                )
                assertContractMaintenanceProjection(
                    projection = acceptedRebuildProtectedProjection,
                    match = rebuildRoomMatches.single { match -> match.id == protectedBeforeRebuild.id },
                    context = "REBUILD Room protected Match",
                )

                val rebuildBatchEvent = host.eventRepository.getEventsByIds(
                    listOf(createdEvent.id),
                ).getOrElse { failure ->
                    error("Failed to fresh-sync the accepted REBUILD Event batch: ${failure.backendSummary()}")
                }.singleOrNull { eventRow -> eventRow.id == createdEvent.id }
                    ?: error("Fresh REBUILD Event batch did not contain ${createdEvent.id}.")
                assertEquals(EventType.LEAGUE, rebuildBatchEvent.eventType)
                assertTrue(rebuildBatchEvent.isAutomatedScheduling)
                val rebuildBatchMatches = host.matchRepository.getMatchesByEventIds(
                    listOf(createdEvent.id),
                ).getOrElse { failure ->
                    error("Failed to fresh-sync accepted REBUILD Matches through the batch endpoint: ${failure.backendSummary()}")
                }
                assertFalse(rebuildBatchMatches.any { match -> match.id == staleRowId })
                assertFalse(rebuildBatchMatches.any { match -> match.fieldId == "stale-local-field" })
                assertContractMaintenanceGraph(
                    projections = rebuildAccepted.graph.matches,
                    matches = rebuildBatchMatches,
                    context = "REBUILD accepted batch graph",
                )
                assertContractMaintenanceProjection(
                    projection = acceptedRebuildProtectedProjection,
                    match = rebuildBatchMatches.single { match -> match.id == protectedBeforeRebuild.id },
                    context = "REBUILD fresh batch protected Match",
                )
                assertTrue(
                    rebuildBatchMatches.any { match ->
                        match.id != protectedBeforeRebuild.id &&
                            match.fieldId != "stale-local-field"
                    },
                    "Fresh REBUILD batch must expose a mutable replacement row.",
                )
            } catch (failure: Throwable) {
                primaryFailure = failure
                throw failure
            } finally {
                val cleanupFailures = mutableListOf<Throwable>()
                val host = hostSession
                withContext(NonCancellable + Dispatchers.IO) {
                    suspend fun attemptCleanup(block: suspend () -> Unit) {
                        try {
                            block()
                        } catch (failure: Throwable) {
                            if (failure is kotlinx.coroutines.CancellationException) throw failure
                            cleanupFailures += failure
                        }
                    }

                    try {
                        withTimeout(30_000L) {
                            val cleanupEventIds = linkedSetOf<String>().apply {
                                addAll(createdEventIds)
                            }
                            preparedCreates.asReversed().forEach { preparedCreate ->
                                attemptCleanup {
                                    host?.resolveCreatedEventId(preparedCreate)?.let { resolvedEventId ->
                                        preparedCreate.resolvedEventId = resolvedEventId
                                        cleanupEventIds.add(resolvedEventId)
                                    }
                                }
                            }
                            if (preparedCreates.isNotEmpty()) {
                                attemptCleanup {
                                    host?.purgeMobileEventEditorReceipts(
                                        eventIds = cleanupEventIds,
                                        preparedCreates = preparedCreates,
                                    )?.let(cleanupEventIds::addAll)
                                }
                            }
                            cleanupEventIds.toList().asReversed().forEach { eventId ->
                                attemptCleanup {
                                    host?.deleteEvent(eventId)
                                }
                            }
                        }
                    } catch (failure: Throwable) {
                        cleanupFailures += failure
                    } finally {
                        createdEventIds.clear()
                        preparedCreates.clear()
                    }
                }
                val cleanupFailure = cleanupFailures.firstOrNull()
                if (cleanupFailure != null) {
                    cleanupFailures.drop(1).forEach(cleanupFailure::addSuppressed)
                    if (primaryFailure != null) {
                        primaryFailure?.addSuppressed(cleanupFailure)
                    } else {
                        throw AssertionError("Mobile schedule contract test cleanup failed.", cleanupFailure)
                    }
                }
            }
        }

    private fun contractMaintenanceRequestBody(body: Any?): JsonObject? = when (body) {
        is OutgoingContent.ByteArrayContent -> runCatching {
            jsonMVP.parseToJsonElement(body.bytes().decodeToString()).jsonObject
        }.getOrNull()
        is OutgoingContent.ContentWrapper -> contractMaintenanceRequestBody(body.delegate())
        else -> null
    }

    private fun assertContractMaintenanceRequest(
        dispatches: List<JsonObject>,
        index: Int,
        eventId: String,
        operation: EventEditorMaintenanceOperation,
        operationId: String,
        expectedRevisions: EventEditorRevisionBindingDto,
    ) {
        val body = dispatches.getOrNull(index)
            ?: error("Expected maintenance POST $index, captured ${dispatches.size}.")
        assertEquals(eventId, body["eventId"]?.jsonPrimitive?.content, "maintenance eventId")
        assertEquals(operation.name, body["operation"]?.jsonPrimitive?.content, "maintenance operation")
        assertEquals(operationId, body["operationId"]?.jsonPrimitive?.content, "maintenance operationId")
        assertEquals(
            jsonMVP.encodeToJsonElement(
                EventEditorRevisionBindingDto.serializer(),
                expectedRevisions,
            ),
            body["expectedRevisions"],
            "maintenance expectedRevisions",
        )
    }

    private fun assertContractMaintenanceProjection(
        projection: EventEditorMatchProjectionDto,
        match: MatchMVP,
        context: String,
    ) {
        assertEquals(match.id, projection.id, "$context id")
        assertEquals(match.eventId, projection.eventId, "$context eventId")
        assertEquals(match.matchId, projection.matchId, "$context matchId")
        assertEquals(match.team1Id, projection.team1Id, "$context team1Id")
        assertEquals(match.team2Id, projection.team2Id, "$context team2Id")
        assertEquals(match.team1Seed, projection.team1Seed, "$context team1Seed")
        assertEquals(match.team2Seed, projection.team2Seed, "$context team2Seed")
        assertEquals(match.fieldId, projection.fieldId, "$context fieldId")
        assertEquals(match.start, projection.start?.let(Instant::parse), "$context start")
        assertEquals(match.end, projection.end?.let(Instant::parse), "$context end")
        assertTrue(
            match.placementState.equals(projection.placementState, ignoreCase = true),
            "$context placementState",
        )
        assertEquals(match.locked, projection.locked, "$context locked")
        assertEquals(match.phase, projection.phase, "$context phase")
        assertEquals(match.sourceDivisionId, projection.sourceDivisionId, "$context sourceDivisionId")
        assertEquals(match.phaseDivisionId, projection.phaseDivisionId, "$context phaseDivisionId")
        assertEquals(match.division, projection.division, "$context division")
        assertEquals(match.winnerNextMatchId, projection.winnerNextMatchId, "$context winnerNextMatchId")
        assertEquals(match.loserNextMatchId, projection.loserNextMatchId, "$context loserNextMatchId")
        assertEquals(match.previousLeftId, projection.previousLeftId, "$context previousLeftId")
        assertEquals(match.previousRightId, projection.previousRightId, "$context previousRightId")
    }

    private fun assertContractMaintenanceGraph(
        projections: List<EventEditorMatchProjectionDto>,
        matches: List<MatchMVP>,
        context: String,
    ) {
        assertEquals(projections.size, matches.size, "$context row count")
        val matchesById = matches.associateBy(MatchMVP::id)
        assertEquals(
            projections.map(EventEditorMatchProjectionDto::id).toSet(),
            matchesById.keys,
            "$context ids",
        )
        projections.forEach { projection ->
            assertContractMaintenanceProjection(
                projection = projection,
                match = assertNotNull(matchesById[projection.id], "$context missing ${projection.id}"),
                context = "$context ${projection.id}",
            )
        }
    }

}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MobileTournamentEventEditorApiContractTest {
    private val createdEventIds = mutableListOf<String>()
    private val preparedCreates = mutableListOf<PreparedEventEditorCreate>()
    private var hostSession: MobileApiTestSession? = null

    @Before
    fun requireBackendFixtures() {
        requireBackendFixturesForContract(EventType.TOURNAMENT)
    }

    @After
    fun closeSessions() {
        hostSession?.close()
        hostSession = null
    }

    @Test
    fun given_mobile_tournament_editor_create_command_when_sent_to_site_then_tournament_is_persisted() =
        runTest(timeout = 5.minutes) {
            var primaryFailure: Throwable? = null
            try {
                hostSession = MobileApiTestSession.create()
                val host = hostSession!!
                val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
                val runId = "mobile_api_tournament_contract_${Clock.System.now().toEpochMilliseconds()}"
                val source = buildTournamentContractVariant(
                    runId = runId,
                    hostUserId = hostUser.id,
                )
                val createdName = "${source.event.name} Contract"
                val submittedEvent = source.event.copy(name = createdName)
                var preparedCreate: PreparedEventEditorCreate? = null
                val created = host.createEventThroughEditor(
                    event = submittedEvent,
                    fields = source.fields,
                    timeSlots = source.timeSlots,
                    onPrepared = { prepared ->
                        preparedCreates += prepared
                        preparedCreate = prepared
                    },
                )
                createdEventIds += created.id

                val firstPrepared = assertNotNull(
                    preparedCreate,
                    "The mobile Tournament create path did not retain its prepared create.",
                )
                assertFalse(
                    firstPrepared.acceptanceDispatchStarted,
                    "An unscheduled Tournament create must not dispatch proposal acceptance.",
                )
                assertEquals(
                    0,
                    firstPrepared.acceptancePutDispatchCount,
                    "An unscheduled Tournament create must not dispatch an acceptance PUT.",
                )
                val firstCommand = firstPrepared.command
                assertTournamentCreateCommand(
                    variant = source,
                    submittedEvent = submittedEvent,
                    command = firstCommand,
                )
                assertCreatedEventShape(source, created)
                assertTournamentEventValues(source, created)
                assertEquals(createdName, created.name)
                assertTournamentAcceptedGraphCached(
                    variant = source,
                    event = created,
                    host = host,
                )
                val createdMatches = host.matchRepository.getMatchesOfTournament(created.id)
                    .getOrElse {
                        error("Failed to load Tournament Match Graph after create ${created.id}: ${it.backendSummary()}")
                    }
                assertTournamentMatchGraph(
                    variant = source,
                    event = created,
                    matches = createdMatches,
                )
                val persisted = host.eventRepository.getEvent(created.id)
                    .getOrElse { error("Failed to reload persisted Tournament ${created.id}: ${it.backendSummary()}") }
                val persistedMatches = host.matchRepository.getMatchesOfTournament(created.id)
                    .getOrElse {
                        error("Failed to reload persisted Tournament Match Graph ${created.id}: ${it.backendSummary()}")
                    }
                assertTournamentMatchGraph(
                    variant = source,
                    event = persisted,
                    matches = persistedMatches,
                )
                assertEquals(
                    tournamentMatchGraphSnapshot(createdMatches),
                    tournamentMatchGraphSnapshot(persistedMatches),
                    "Tournament Match Graph changed after the event repository reload.",
                )

                val reloaded = host.eventRepository.getEventEditor(created.id)
                    .getOrElse { error("Failed to reload Tournament ${created.id}: ${it.backendSummary()}") }
                assertEquals(created.id, reloaded.canonicalState.event.id)
                assertEquals(createdName, reloaded.canonicalState.event.name)
                assertCreatedEventShape(source, reloaded.canonicalState.event)
                assertTournamentEventValues(
                    variant = source,
                    event = reloaded.canonicalState.event,
                )
                assertTournamentResourcesPersisted(source, reloaded.canonicalState)
                val reloadedMatches = host.matchRepository.getMatchesOfTournament(created.id)
                    .getOrElse {
                        error("Failed to reload Tournament Match Graph after editor reload ${created.id}: ${it.backendSummary()}")
                    }
                assertTournamentMatchGraph(
                    variant = source,
                    event = reloaded.canonicalState.event,
                    matches = reloadedMatches,
                )
                assertEquals(
                    tournamentMatchGraphSnapshot(persistedMatches),
                    tournamentMatchGraphSnapshot(reloadedMatches),
                    "Tournament Match Graph changed after the editor reload.",
                )
            } catch (failure: Throwable) {
                primaryFailure = failure
                throw failure
            } finally {
                val cleanupFailures = mutableListOf<Throwable>()
                val host = hostSession
                withContext(NonCancellable + Dispatchers.IO) {
                    suspend fun attemptCleanup(block: suspend () -> Unit) {
                        try {
                            block()
                        } catch (failure: Throwable) {
                            if (failure is kotlinx.coroutines.CancellationException) throw failure
                            cleanupFailures += failure
                        }
                    }

                    try {
                        withTimeout(60_000L) {
                            val cleanupEventIds = linkedSetOf<String>().apply {
                                addAll(createdEventIds)
                                addAll(preparedCreates.map { prepared -> prepared.eventId })
                                addAll(preparedCreates.mapNotNull { prepared -> prepared.resolvedEventId })
                            }
                            if (cleanupEventIds.isNotEmpty() || preparedCreates.isNotEmpty()) {
                                attemptCleanup {
                                    val cleanupHost = host
                                        ?: error("Mobile Tournament cleanup has run-owned identifiers but no API session.")
                                    cleanupHost.purgeMobileTournamentRun(
                                        eventIds = cleanupEventIds,
                                        preparedCreates = preparedCreates,
                                        seededOrganizationId = SEEDED_ORGANIZATION_ID,
                                        seededTeamIds = SEEDED_TEAM_IDS,
                                    )
                                }
                            }
                        }
                    } catch (failure: Throwable) {
                        cleanupFailures += failure
                    } finally {
                        createdEventIds.clear()
                        preparedCreates.clear()
                    }
                }
                val cleanupFailure = cleanupFailures.firstOrNull()
                if (cleanupFailure != null) {
                    cleanupFailures.drop(1).forEach(cleanupFailure::addSuppressed)
                    if (primaryFailure != null) {
                        primaryFailure?.addSuppressed(cleanupFailure)
                    } else {
                        throw AssertionError("Mobile Tournament contract test cleanup failed.", cleanupFailure)
                    }
                }
            }
        }
    @Test
    fun given_mobile_partial_schedule_proposal_when_accepted_then_request_and_metadata_are_preserved() =
        runTest(timeout = 5.minutes) {
            var primaryFailure: Throwable? = null
            try {
                hostSession = MobileApiTestSession.create()
                val host = hostSession!!
                val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
                val runId = "mobile_api_tournament_partial_${Clock.System.now().toEpochMilliseconds()}"
                val source = buildTournamentContractVariant(
                    runId = runId,
                    hostUserId = hostUser.id,
                )
                val entryDivisionId = source.divisionIds.first()
                val entryField = source.fields.first { field -> entryDivisionId in field.divisions }
                val sourceSlot = source.timeSlots.first { slot ->
                    entryDivisionId in slot.divisions.orEmpty()
                }
                val slotStartMinutes = sourceSlot.startTimeMinutes ?: 8 * 60
                val constrainedSlot = sourceSlot.copy(
                    id = "${sourceSlot.id}_partial",
                    dayOfWeek = sourceSlot.dayOfWeek ?: 5,
                    daysOfWeek = listOf(sourceSlot.dayOfWeek ?: 5),
                    startTimeMinutes = slotStartMinutes,
                    endTimeMinutes = slotStartMinutes + 60,
                    startDate = source.event.start,
                    endDate = source.event.start + 60.minutes,
                    divisions = listOf(entryDivisionId),
                    repeating = false,
                    scheduledFieldId = entryField.id,
                    scheduledFieldIds = listOf(entryField.id),
                )
                val constrainedDivision = source.event.divisionDetails
                    .first { detail -> detail.id == entryDivisionId }
                    .copy(
                        fieldIds = listOf(entryField.id),
                        teamIds = source.event.teamIds,
                        maxParticipants = source.event.teamIds.size,
                        gamesPerOpponent = 1,
                        poolCount = null,
                        poolTeamCount = null,
                        playoffTeamCount = null,
                        playoffPlacementDivisionIds = emptyList(),
                    )
                val submittedEvent = source.event.copy(
                    name = "${source.event.name} Partial Contract",
                    divisions = listOf(entryDivisionId),
                    divisionDetails = listOf(constrainedDivision),
                    fieldIds = listOf(entryField.id),
                    timeSlotIds = listOf(constrainedSlot.id),
                    maxParticipants = source.event.teamIds.size,
                    gamesPerOpponent = 1,
                    includePlayoffs = false,
                    playoffTeamCount = null,
                    isAutomatedScheduling = true,
                    noFixedEndDateTime = false,
                    singleDivision = true,
                )
                val createOperationId = "mobile-tournament-partial-create-$runId"
                val prepared = host.prepareEventEditorCreate(
                    event = submittedEvent,
                    fields = listOf(entryField),
                    timeSlots = listOf(constrainedSlot),
                    operationId = createOperationId,
                )
                preparedCreates += prepared

                val proposed = host.eventRepository.createEventEditor(prepared.command)
                    .getOrElse { failure ->
                        error("Failed to create partial schedule proposal: ${failure.backendSummary()}")
                    }
                val proposal = assertNotNull(
                    proposed.proposal,
                    "The constrained Tournament create must return a schedule proposal.",
                )
                assertEquals("PROPOSED", proposal.status)
                assertEquals(createOperationId, proposal.createOperationId)

                val partial = proposal.scheduleOutcome
                assertEquals(EventEditorScheduleOutcomeStatus.PARTIAL, partial.status)
                assertFalse(partial.isComplete)
                assertEquals(partial.matchCount, partial.matches.size)
                assertTrue(partial.placedMatchCount > 0, "Partial fixture should retain at least one placed match.")
                assertTrue(partial.unplacedMatchCount > 0, "Partial fixture should contain an unplaced match.")
                assertEquals(partial.unplacedMatchCount, partial.unscheduledMatches.size)
                val unplacedMatches = partial.matches.filter { match ->
                    match.placementState.equals("UNPLACED", ignoreCase = true)
                }
                assertEquals(
                    unplacedMatches.map { match -> match.id },
                    partial.unscheduledMatches.map { match -> match.id },
                    "Unscheduled match ids must exactly match the unplaced projections.",
                )
                unplacedMatches.zip(partial.unscheduledMatches).forEach { (projection, unscheduled) ->
                    assertEquals(projection.matchId, unscheduled.matchId)
                    assertEquals(projection.phaseDivisionId, unscheduled.phaseDivisionId)
                    assertEquals(projection.phase, unscheduled.phase)
                    assertEquals(projection.sourceDivisionId, unscheduled.sourceDivisionId)
                    assertTrue(projection.start == null && projection.end == null)
                    assertTrue(projection.fieldId == null)
                }
                assertEquals(
                    unplacedMatches.mapNotNull { match -> match.phaseDivisionId }.distinct().sorted(),
                    partial.affectedCompetitionPhases.map { phase -> phase.id },
                    "Affected competition phases must exactly cover unplaced match phases.",
                )
                partial.affectedCompetitionPhases.forEach { phase ->
                    assertTrue(phase.id.isNotBlank())
                    assertTrue(phase.name.isNotBlank())
                    assertTrue(phase.phase.isNotBlank())
                    assertNotNull(phase.sourceDivisionId)
                }

                var staleRequestBody: JsonObject? = null
                val staleAcceptanceOperationId = "mobile-tournament-partial-stale-$runId"
                val staleFailure = runCatching {
                    host.observeAcceptancePutDispatch(
                        operationId = proposal.createOperationId,
                        onRequest = { body -> staleRequestBody = body },
                    ) {
                        host.eventRepository.acceptEventEditorPartialProposal(
                            createOperationId = proposal.createOperationId,
                            proposalRevision = proposal.proposalRevision,
                            acceptanceOperationId = staleAcceptanceOperationId,
                            draft = proposal.snapshot.draft.copy(
                                basics = proposal.snapshot.draft.basics.copy(
                                    name = "${proposal.snapshot.draft.basics.name} changed",
                                ),
                            ),
                        ).getOrThrow()
                    }
                }.exceptionOrNull()
                assertTrue(staleAcceptanceOperationId.isNotBlank())
                assertTrue(
                    staleFailure is EventEditorProposalStaleException,
                    "Changed partial acceptance draft must map to EventEditorProposalStaleException.",
                )
                val staleException = staleFailure as EventEditorProposalStaleException
                assertEquals(409, staleException.statusCode)
                assertEquals("EDITOR_PROPOSAL_STALE", staleException.payload?.code)
                assertEquals(1, staleAcceptanceOperationId.isNotBlank().compareTo(false))
                assertEquals(
                    "PARTIAL",
                    staleRequestBody?.get("acceptanceMode")?.jsonPrimitive?.content,
                )
                assertEquals(
                    staleAcceptanceOperationId,
                    staleRequestBody?.get("acceptanceOperationId")?.jsonPrimitive?.content,
                )

                var acceptanceRequestBody: JsonObject? = null
                val acceptanceOperationId = "mobile-tournament-partial-accept-$runId"
                val (accepted, acceptancePutCount) = host.observeAcceptancePutDispatch(
                    operationId = proposal.createOperationId,
                    onRequest = { body -> acceptanceRequestBody = body },
                ) {
                    host.eventRepository.acceptEventEditorPartialProposal(
                        createOperationId = proposal.createOperationId,
                        proposalRevision = proposal.proposalRevision,
                        acceptanceOperationId = acceptanceOperationId,
                        draft = proposal.snapshot.draft,
                    ).getOrElse { failure ->
                        error("Failed to accept partial schedule proposal: ${failure.backendSummary()}")
                    }
                }
                assertEquals(1, acceptancePutCount)
                val acceptanceBody = assertNotNull(
                    acceptanceRequestBody,
                    "The partial acceptance PUT body was not observed.",
                )
                assertEquals("PARTIAL", acceptanceBody["acceptanceMode"]?.jsonPrimitive?.content)
                assertEquals(proposal.proposalRevision, acceptanceBody["proposalRevision"]?.jsonPrimitive?.content)
                assertEquals(acceptanceOperationId, acceptanceBody["acceptanceOperationId"]?.jsonPrimitive?.content)
                assertTrue(acceptanceOperationId != proposal.createOperationId)
                assertEquals(
                    proposal.snapshot.draft,
                    acceptanceBody["draft"]?.let { draft ->
                        jsonMVP.decodeFromJsonElement<EventEditorDraftDto>(draft)
                    },
                )
                assertEquals(partial, accepted.scheduleOutcome)
                assertEquals(proposal.eventId, accepted.session.canonicalState.event.id)
                createdEventIds += accepted.session.canonicalState.event.id
                prepared.resolvedEventId = accepted.session.canonicalState.event.id
            } catch (failure: Throwable) {
                primaryFailure = failure
                throw failure
            } finally {
                val cleanupFailures = mutableListOf<Throwable>()
                val host = hostSession
                withContext(NonCancellable + Dispatchers.IO) {
                    suspend fun attemptCleanup(block: suspend () -> Unit) {
                        try {
                            block()
                        } catch (failure: Throwable) {
                            if (failure is kotlinx.coroutines.CancellationException) throw failure
                            cleanupFailures += failure
                        }
                    }
                    try {
                        withTimeout(60_000L) {
                            val cleanupEventIds = linkedSetOf<String>().apply {
                                addAll(createdEventIds)
                                addAll(preparedCreates.map { prepared -> prepared.eventId })
                                addAll(preparedCreates.mapNotNull { prepared -> prepared.resolvedEventId })
                            }
                            if (cleanupEventIds.isNotEmpty() || preparedCreates.isNotEmpty()) {
                                attemptCleanup {
                                    val cleanupHost = host
                                        ?: error("Mobile partial Tournament cleanup has run-owned identifiers but no API session.")
                                    cleanupHost.purgeMobileTournamentRun(
                                        eventIds = cleanupEventIds,
                                        preparedCreates = preparedCreates,
                                        seededOrganizationId = SEEDED_ORGANIZATION_ID,
                                        seededTeamIds = SEEDED_TEAM_IDS,
                                    )
                                }
                            }
                        }
                    } catch (failure: Throwable) {
                        cleanupFailures += failure
                    } finally {
                        createdEventIds.clear()
                        preparedCreates.clear()
                    }
                }
                val cleanupFailure = cleanupFailures.firstOrNull()
                if (cleanupFailure != null) {
                    cleanupFailures.drop(1).forEach(cleanupFailure::addSuppressed)
                    if (primaryFailure != null) {
                        primaryFailure?.addSuppressed(cleanupFailure)
                    } else {
                        throw AssertionError("Mobile partial Tournament cleanup failed.", cleanupFailure)
                    }
                }
            }
        }
    @Test
    fun given_mobile_scheduled_tournament_create_when_proposed_and_accepted_then_placements_and_room_reload_persist() =
        runTest(timeout = 5.minutes) {
            var primaryFailure: Throwable? = null
            try {
                hostSession = MobileApiTestSession.create()
                val host = hostSession!!
                val hostUser = host.userRepository.login(HOST_EMAIL, HOST_PASSWORD).getOrThrow()
                val runId = "mobile_api_tournament_contract_${Clock.System.now().toEpochMilliseconds()}"
                val source = buildTournamentContractVariant(
                    runId = runId,
                    hostUserId = hostUser.id,
                ).let { variant ->
                    val entryDivisionId = variant.divisionIds.first()
                    val scheduledFields = variant.fields
                        .filter { field -> entryDivisionId in field.divisions }
                    val sourceTimeSlot = variant.timeSlots.first { slot ->
                        entryDivisionId in slot.divisions.orEmpty()
                    }
                    val scheduledEnd = variant.event.end + 4320.minutes
                    val additionalDayTimeSlots = (2..4).map { day ->
                        val dayOffset = (day - 1) * 1440
                        val shiftedDayOfWeek = ((sourceTimeSlot.dayOfWeek ?: 0) + day - 1) % 7
                        sourceTimeSlot.copy(
                            id = "${sourceTimeSlot.id}_day_$day",
                            dayOfWeek = shiftedDayOfWeek,
                            daysOfWeek = listOf(shiftedDayOfWeek),
                            startDate = sourceTimeSlot.startDate + dayOffset.minutes,
                            endDate = sourceTimeSlot.endDate?.plus(dayOffset.minutes),
                        )
                    }
                    val scheduledTimeSlots = listOf(sourceTimeSlot) + additionalDayTimeSlots
                    val scheduledDivisionDetails = variant.event.divisionDetails
                        .filter { detail -> detail.id == entryDivisionId }
                        .map { detail ->
                            detail.copy(
                                gamesPerOpponent = 1,
                                maxParticipants = variant.event.teamIds.size,
                                poolTeamCount = if (
                                    detail.kind.equals("PLAYOFF", ignoreCase = true)
                                ) {
                                    detail.poolTeamCount
                                } else {
                                    (variant.event.teamIds.size / 2).coerceAtLeast(1)
                                },
                                teamIds = if (
                                    detail.kind.equals("PLAYOFF", ignoreCase = true)
                                ) {
                                    emptyList()
                                } else {
                                    variant.event.teamIds
                                },
                            )
                        }
                    variant.copy(
                        key = "tournament_contract_scheduled",
                        event = variant.event.copy(
                            divisions = listOf(entryDivisionId),
                            divisionDetails = scheduledDivisionDetails,
                            end = scheduledEnd,
                            fieldIds = scheduledFields.map(Field::id),
                            timeSlotIds = scheduledTimeSlots.map(TimeSlot::id),
                            maxParticipants = variant.event.teamIds.size,
                            gamesPerOpponent = 1,
                            isAutomatedScheduling = true,
                            noFixedEndDateTime = false,
                            singleDivision = true,
                        ),
                        fields = scheduledFields,
                        timeSlots = scheduledTimeSlots,
                        divisionIds = listOf(entryDivisionId),
                        resourceDivisionIds = listOf(entryDivisionId),
                        primaryDivisionId = entryDivisionId,
                        splitDivisions = false,
                    )
                }
                val submittedEvent = source.event.copy(name = "${source.event.name} Scheduled Contract")
                var firstPrepared: PreparedEventEditorCreate? = null
                val created = host.createEventThroughEditor(
                    event = submittedEvent,
                    fields = source.fields,
                    timeSlots = source.timeSlots,
                    operationId = "mobile-tournament-scheduled-$runId",
                    onPrepared = { prepared ->
                        preparedCreates += prepared
                        firstPrepared = prepared
                        assertTournamentCreateCommand(
                            variant = source,
                            submittedEvent = submittedEvent,
                            command = prepared.command,
                        )
                        val command = prepared.command
                        assertEquals(EventType.TOURNAMENT.name, command.draft.basics.eventType)
                        assertEquals(true, command.draft.schedule.isAutomatedScheduling)
                        assertEquals("FIXED_END", command.draft.schedule.mode)
                        assertEquals(
                            submittedEvent.end,
                            Instant.parse(command.draft.schedule.endConstraint ?: ""),
                        )
                        assertEquals("CREATE_AND_BUILD_SCHEDULE", command.completion.mode.name)
                        assertEquals(true, command.hasScheduleProposalSupport)
                    },
                )
                createdEventIds += created.id

                val prepared = assertNotNull(
                    firstPrepared,
                    "The mobile scheduled Tournament create path did not prepare a command.",
                )
                assertTrue(
                    prepared.acceptanceDispatchStarted,
                    "The mobile scheduled Tournament create path did not receive and accept a PROPOSED response.",
                )
                assertFalse(
                    prepared.acceptanceDispatchTerminal,
                    "The mobile scheduled Tournament acceptance did not complete successfully.",
                )
                assertEquals(
                    1,
                    prepared.acceptancePutDispatchCount,
                    "The scheduled Tournament create operation must dispatch exactly one acceptance PUT.",
                )
                assertCreatedEventShape(source, created)
                assertTournamentEventValues(
                    variant = source,
                    event = created,
                    divisionDetailAssertion = TournamentDivisionDetailAssertion.SERVER_NORMALIZED,
                )
                assertEquals(submittedEvent.name, created.name)
                assertEquals(true, created.isAutomatedScheduling)
                assertEquals(false, created.noFixedEndDateTime)
                assertEquals(submittedEvent.end, created.end)
                val acceptedBaselineMatches = host.database.getMatchDao
                    .getMatchesOfTournament(created.id)
                assertTournamentMatchGraph(
                    variant = source,
                    event = created,
                    matches = acceptedBaselineMatches,
                    requirePlaced = true,
                )
                assertScheduledTournamentDivisionState(
                    variant = source,
                    event = created,
                    matches = acceptedBaselineMatches,
                )
                val acceptedMatchIds = acceptedBaselineMatches.map(MatchMVP::id).toSet()
                val acceptedTeamIds = tournamentMatchTeamIds(acceptedBaselineMatches)

                val expectedAcceptedTeamIds = source.event.teamIds
                    .filter(String::isNotBlank)
                    .toSet()
                assertEquals(
                    source.event.teamIds.size,
                    expectedAcceptedTeamIds.size,
                    "Scheduled Tournament source team ids must have stable cardinality.",
                )
                assertTrue(
                    acceptedTeamIds.size >= expectedAcceptedTeamIds.size,
                    "Scheduled Tournament accepted Match Graph lost source team cardinality.",
                )
                assertTrue(
                    created.teamIds.isNotEmpty(),
                    "Scheduled Tournament accepted Event lost all team ids.",
                )
                assertEquals(
                    created.teamIds.toSet().size,
                    created.teamIds.size,
                    "Scheduled Tournament accepted Event team ids contain duplicates.",
                )
                assertTrue(
                    created.teamIds.size >= expectedAcceptedTeamIds.size,
                    "Scheduled Tournament accepted Event lost source team cardinality.",
                )

                val acceptedBaselineEvent = assertNotNull(
                    host.database.getEventDao.getEventById(created.id),
                    "Scheduled Tournament accepted Event is missing from the Room baseline.",
                )
                val acceptedBaselineDivisionIdentities = acceptedBaselineEvent.divisionDetails
                    .map(::canonicalTournamentDivisionIdentity)
                    .toSet()
                assertTrue(
                    acceptedTeamIds.isNotEmpty(),
                    "Scheduled Tournament accepted Match Graph must retain team ids.",
                )
                assertTrue(
                    acceptedMatchIds.isNotEmpty(),
                    "Scheduled Tournament accepted Match Graph must retain match ids.",
                )
                assertTrue(
                    acceptedBaselineDivisionIdentities.isNotEmpty(),
                    "Scheduled Tournament accepted Match Graph must retain division identities.",
                )
                assertTournamentAcceptedGraphCached(
                    variant = source,
                    event = created,
                    host = host,
                    label = "Scheduled Tournament Room baseline",
                    requirePlaced = true,
                    acceptedDivisionIdentities = acceptedBaselineDivisionIdentities,
                    acceptedMatchIds = acceptedMatchIds,
                    acceptedTeamIds = acceptedTeamIds,
                )
                val createdMatches = host.matchRepository.getMatchesOfTournament(created.id)
                    .getOrElse {
                        error("Failed to reload scheduled Tournament Match Graph after create ${created.id}: ${it.backendSummary()}")
                    }
                assertTournamentMatchGraph(
                    variant = source,
                    event = created,
                    matches = createdMatches,
                    requirePlaced = true,
                )
                assertScheduledTournamentDivisionState(source, created, createdMatches)
                assertAcceptedTournamentGraphStable(
                    expectedMatchIds = acceptedMatchIds,
                    expectedTeamIds = acceptedTeamIds,
                    matches = createdMatches,
                    label = "Scheduled Tournament remote Match Graph after acceptance",
                )
                val persisted = host.eventRepository.getEvent(created.id)
                    .getOrElse {
                        error("Failed to reload persisted scheduled Tournament ${created.id}: ${it.backendSummary()}")
                    }
                assertCreatedEventShape(source, persisted)
                assertTournamentEventValues(
                    variant = source,
                    event = persisted,
                    divisionDetailAssertion = TournamentDivisionDetailAssertion.SERVER_NORMALIZED,
                )
                assertEquals(submittedEvent.name, persisted.name)
                assertTournamentAcceptedGraphCached(
                    variant = source,
                    event = persisted,
                    host = host,
                    label = "Scheduled Tournament persisted Event Room cache",
                    requirePlaced = true,
                    acceptedDivisionIdentities = acceptedBaselineDivisionIdentities,
                    acceptedMatchIds = acceptedMatchIds,
                    acceptedTeamIds = acceptedTeamIds,
                )
                val persistedMatches = host.matchRepository.getMatchesOfTournament(created.id)
                    .getOrElse {
                        error("Failed to reload persisted scheduled Tournament Match Graph ${created.id}: ${it.backendSummary()}")
                    }
                assertTournamentMatchGraph(
                    variant = source,
                    event = persisted,
                    matches = persistedMatches,
                    requirePlaced = true,
                )
                assertAcceptedTournamentGraphStable(
                    expectedMatchIds = acceptedMatchIds,
                    expectedTeamIds = acceptedTeamIds,
                    matches = persistedMatches,
                    label = "Scheduled Tournament persisted Event reload",
                )
                assertEquals(
                    tournamentMatchGraphSnapshot(createdMatches),
                    tournamentMatchGraphSnapshot(persistedMatches),
                    "Scheduled Tournament Match Graph changed after the event repository reload.",
                )

                val reloaded = host.eventRepository.getEventEditor(created.id)
                    .getOrElse {
                        error("Failed to reload scheduled Tournament ${created.id}: ${it.backendSummary()}")
                    }
                assertEquals(created.id, reloaded.canonicalState.event.id)
                assertEquals(submittedEvent.name, reloaded.canonicalState.event.name)
                assertCreatedEventShape(source, reloaded.canonicalState.event)
                assertTournamentEventValues(
                    variant = source,
                    event = reloaded.canonicalState.event,
                    divisionDetailAssertion = TournamentDivisionDetailAssertion.SERVER_NORMALIZED,
                )
                assertTournamentResourcesPersisted(source, reloaded.canonicalState)
                val reloadedRoomEvent = assertNotNull(
                    host.database.getEventDao.getEventById(created.id),
                    "Scheduled Tournament editor reload Event is missing from the Room cache.",
                )
                assertEquals(reloaded.canonicalState.event.id, reloadedRoomEvent.id)
                assertTournamentAcceptedGraphCached(
                    variant = source,
                    event = reloadedRoomEvent,
                    host = host,
                    label = "Scheduled Tournament Room editor reload",
                    requirePlaced = true,
                    acceptedDivisionIdentities = acceptedBaselineDivisionIdentities,
                    acceptedMatchIds = acceptedMatchIds,
                    acceptedTeamIds = acceptedTeamIds,
                )
                val reloadedMatches = host.matchRepository.getMatchesOfTournament(created.id)
                    .getOrElse {
                        error("Failed to reload scheduled Tournament Match Graph after editor reload ${created.id}: ${it.backendSummary()}")
                    }
                assertTournamentMatchGraph(
                    variant = source,
                    event = reloadedRoomEvent,
                    matches = reloadedMatches,
                    requirePlaced = true,
                )
                assertScheduledTournamentDivisionState(source, reloadedRoomEvent, reloadedMatches)
                assertAcceptedTournamentGraphStable(
                    expectedMatchIds = acceptedMatchIds,
                    expectedTeamIds = acceptedTeamIds,
                    matches = reloadedMatches,
                    label = "Scheduled Tournament editor reload",
                )
                assertEquals(
                    tournamentMatchGraphSnapshot(persistedMatches),
                    tournamentMatchGraphSnapshot(reloadedMatches),
                    "Scheduled Tournament Match Graph changed after the editor reload.",
                )
            } catch (failure: Throwable) {
                primaryFailure = failure
                throw failure
            } finally {
                val cleanupFailures = mutableListOf<Throwable>()
                val host = hostSession
                withContext(NonCancellable + Dispatchers.IO) {
                    suspend fun attemptCleanup(block: suspend () -> Unit) {
                        try {
                            block()
                        } catch (failure: Throwable) {
                            if (failure is kotlinx.coroutines.CancellationException) throw failure
                            cleanupFailures += failure
                        }
                    }

                    try {
                        withTimeout(60_000L) {
                            val cleanupEventIds = linkedSetOf<String>().apply {
                                addAll(createdEventIds)
                                addAll(preparedCreates.map { prepared -> prepared.eventId })
                                addAll(preparedCreates.mapNotNull { prepared -> prepared.resolvedEventId })
                            }
                            if (cleanupEventIds.isNotEmpty() || preparedCreates.isNotEmpty()) {
                                attemptCleanup {
                                    val cleanupHost = host
                                        ?: error("Mobile scheduled Tournament cleanup has run-owned identifiers but no API session.")
                                    cleanupHost.purgeMobileTournamentRun(
                                        eventIds = cleanupEventIds,
                                        preparedCreates = preparedCreates,
                                        seededOrganizationId = SEEDED_ORGANIZATION_ID,
                                        seededTeamIds = SEEDED_TEAM_IDS,
                                    )
                                }
                            }
                        }
                    } catch (failure: Throwable) {
                        cleanupFailures += failure
                    } finally {
                        createdEventIds.clear()
                        preparedCreates.clear()
                    }
                }
                val cleanupFailure = cleanupFailures.firstOrNull()
                if (cleanupFailure != null) {
                    cleanupFailures.drop(1).forEach(cleanupFailure::addSuppressed)
                    if (primaryFailure != null) {
                        primaryFailure?.addSuppressed(cleanupFailure)
                    } else {
                        throw AssertionError("Mobile scheduled Tournament contract test cleanup failed.", cleanupFailure)
                    }
                }
            }
        }

}



    private fun assertCreatedEventShape(
        variant: LifecycleVariant,
        event: Event,
    ) {
        assertTrue(event.id.isNotBlank(), "${variant.key} should receive a server-owned event id")
        assertEquals(variant.event.eventType, event.eventType, "${variant.key} event type drifted")
        assertEquals(variant.event.singleDivision, event.singleDivision, "${variant.key} division mode drifted")
        assertEquals(variant.event.teamSignup, event.teamSignup, "${variant.key} registration unit drifted")
        assertEquals(
            variant.event.registrationByDivisionType,
            event.registrationByDivisionType,
            "${variant.key} registration division mode drifted",
        )
        assertEquals(
            normalizeRegistrationPaymentMode(variant.event.registrationPaymentMode),
            normalizeRegistrationPaymentMode(event.registrationPaymentMode),
            "${variant.key} payment mode drifted",
        )
        assertEquals(variant.event.priceCents, event.priceCents, "${variant.key} registration price drifted")
        assertEquals(
            variant.event.maxParticipants,
            event.maxParticipants,
            "${variant.key} participant limit drifted",
        )

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
        assertEquals(variant.event.sportIds, event.sportIds, "${variant.key} sports drifted")
        assertEquals(
            (variant.event.eventType == EventType.LEAGUE || variant.event.eventType == EventType.TOURNAMENT)
                && variant.event.usesSets,
            event.usesSets,
            "${variant.key} scoring model drifted",
        )
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
                assertEquals(OfficialSchedulingMode.SCHEDULE, event.officialSchedulingMode)
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
private fun assertTournamentCreateCommand(
    variant: LifecycleVariant,
    submittedEvent: Event,
    command: EventEditorCreateCommandDto,
) {
    val draft = command.draft
    assertEquals(3, command.contractVersion)
    assertTrue(command.createOperationId.isNotBlank(), "Tournament create must include an operation id")
    assertTrue(command.expectedRevisions.editorRevision.isNotBlank(), "Tournament create must bind the editor revision")
    assertTrue(command.expectedRevisions.scheduleRevision.isNotBlank(), "Tournament create must bind the schedule revision")
    assertEquals(EventType.TOURNAMENT.name, draft.basics.eventType)
    assertEquals(submittedEvent.name, draft.basics.name)
    assertEquals(submittedEvent.sportIds, draft.basics.sportIds)
    assertEquals(submittedEvent.start, Instant.parse(draft.basics.start))
    assertEquals(submittedEvent.organizationId, draft.basics.organizationId)
    assertEquals(submittedEvent.hostId, draft.basics.hostId)
    assertEquals(submittedEvent.state, draft.basics.state)

    assertEquals(submittedEvent.teamSignup, draft.participation.teamSignup)
    assertEquals(submittedEvent.singleDivision, draft.participation.singleDivision)
    assertEquals(submittedEvent.registrationByDivisionType, draft.participation.registrationByDivisionType)
    assertEquals(submittedEvent.maxParticipants, draft.participation.maxParticipants)
    assertEquals(submittedEvent.teamSizeLimit, draft.participation.teamSizeLimit)
    assertEquals(submittedEvent.allowTeamSplitDefault, draft.participation.allowTeamSplitDefault)

    val competition = draft.competition
    assertEquals(submittedEvent.divisions, competition.divisionIds)
    assertEquals(submittedEvent.doubleElimination, competition.doubleElimination)
    assertEquals(submittedEvent.winnerSetCount, competition.winnerSetCount)
    assertEquals(submittedEvent.loserSetCount, competition.loserSetCount)
    assertEquals(submittedEvent.includePlayoffs, competition.includePlayoffs)
    assertEquals(submittedEvent.playoffTeamCount, competition.playoffTeamCount)
    assertEquals(submittedEvent.pointsToVictory, competition.pointsToVictory)
    assertEquals(submittedEvent.winnerBracketPointsToVictory, competition.winnerBracketPointsToVictory)
    assertEquals(submittedEvent.loserBracketPointsToVictory, competition.loserBracketPointsToVictory)
    assertEquals(submittedEvent.usesSets, competition.usesSets)
    assertEquals(submittedEvent.setsPerMatch, competition.setsPerMatch)
    assertEquals(submittedEvent.setDurationMinutes?.toDouble(), competition.setDurationMinutes)
    assertEquals(submittedEvent.matchDurationMinutes?.toDouble(), competition.matchDurationMinutes)
    assertEquals(submittedEvent.restTimeMinutes?.toDouble(), competition.restTimeMinutes)
    assertEquals(submittedEvent.gamesPerOpponent, competition.gamesPerOpponent)

    val expectedRegularDetails = variant.event.divisionDetails.filterNot { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    val expectedPlayoffDetails = variant.event.divisionDetails.filter { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    assertEquals(
        expectedRegularDetails.map(DivisionDetail::id),
        competition.divisionDetails.map { detail -> detail.id },
    )
    assertEquals(
        expectedPlayoffDetails.map(DivisionDetail::id),
        competition.playoffDivisionDetails.map { detail -> detail.id },
    )
    val expectedSourceTeamIds = submittedEvent.teamIds.filter(String::isNotBlank)
    assertEquals(
        expectedSourceTeamIds.size,
        expectedSourceTeamIds.toSet().size,
        "Tournament create source team ids must have stable cardinality.",
    )
    val commandRegularTeamIds = competition.divisionDetails.flatMap { detail -> detail.teamIds }
    assertEquals(
        expectedSourceTeamIds.toSet(),
        commandRegularTeamIds.toSet(),
        "Tournament create command regular divisions lost or changed source team ids.",
    )
    assertEquals(
        expectedSourceTeamIds.size,
        commandRegularTeamIds.size,
        "Tournament create command regular division team cardinality changed.",
    )
    expectedRegularDetails.forEach { expected ->
        val actual = assertNotNull(
            competition.divisionDetails.firstOrNull { detail -> detail.id == expected.id },
            "Tournament command omitted division ${expected.id}.",
        )
        assertEquals(expected.teamIds, actual.teamIds)
        assertEquals(expected.teamIds.toSet().size, actual.teamIds.toSet().size)
        assertEquals(expected.kind ?: "LEAGUE", actual.kind)
        assertEquals(expected.maxParticipants?.toDouble(), actual.maxParticipants)
        assertEquals(expected.playoffTeamCount?.toDouble(), actual.playoffTeamCount)
        assertEquals(expected.poolCount?.toDouble(), actual.poolCount)
        assertEquals(expected.poolTeamCount?.toDouble(), actual.poolTeamCount)
        assertEquals(expected.playoffPlacementDivisionIds, actual.playoffPlacementDivisionIds)
        assertEquals(expected.gamesPerOpponent?.toDouble(), actual.gamesPerOpponent)
        assertEquals(expected.restTimeMinutes?.toDouble(), actual.restTimeMinutes)
        assertEquals(expected.usesSets, actual.usesSets)
        assertEquals(expected.matchDurationMinutes?.toDouble(), actual.matchDurationMinutes)
        assertEquals(expected.setDurationMinutes?.toDouble(), actual.setDurationMinutes)
        assertEquals(expected.setsPerMatch?.toDouble(), actual.setsPerMatch)
        assertEquals(expected.pointsToVictory, actual.pointsToVictory)
        assertEquals(expected.fieldIds, actual.fieldIds)
        assertTrue(actual.playoffConfig == null, "Regular Tournament divisions must not lose their bracket split.")
    }
    expectedPlayoffDetails.forEach { expected ->
        val actual = assertNotNull(
            competition.playoffDivisionDetails.firstOrNull { detail -> detail.id == expected.id },
            "Tournament command omitted bracket ${expected.id}.",
        )
        assertEquals("PLAYOFF", actual.kind)
        assertEquals(expected.maxParticipants?.toDouble(), actual.maxParticipants)
        assertEquals(expected.playoffTeamCount?.toDouble(), actual.playoffTeamCount)
        assertEquals(expected.poolCount?.toDouble(), actual.poolCount)
        assertEquals(expected.poolTeamCount?.toDouble(), actual.poolTeamCount)
        assertEquals(expected.fieldIds, actual.fieldIds)
        val actualPlayoffConfig = assertNotNull(
            actual.playoffConfig,
            "Tournament command omitted playoff elimination configuration.",
        ).let { config ->
            runCatching {
                jsonMVP.decodeFromJsonElement<TournamentConfig>(config)
            }.getOrElse { failure ->
                throw AssertionError(
                    "Tournament command playoff configuration is not a valid TournamentConfig.",
                    failure,
                )
            }
        }
        assertEquals(expected.toTournamentConfig(), actualPlayoffConfig)
    }
    assertEquals(
        variant.event.divisionDetails.associate { detail -> detail.id to detail.fieldIds },
        competition.divisionFieldIds,
    )

    assertEquals(submittedEvent.fieldIds, draft.resources.fieldIds)
    assertEquals(sourceFieldIds(variant.fields), draft.resources.fields.mapNotNull { field -> field.id })
    assertTrue(
        draft.resources.fields.all { field -> field.organizationId == null },
        "Newly created Tournament fields must not claim an organization ownership.",
    )
    assertEquals(submittedEvent.timeSlotIds, draft.resources.timeSlotIds)
    assertEquals(sourceTimeSlotIds(variant.timeSlots), draft.resources.timeSlots.mapNotNull { slot -> slot.id })
    variant.timeSlots.forEach { expected ->
        val actual = assertNotNull(
            draft.resources.timeSlots.firstOrNull { slot -> slot.id == expected.id },
            "Tournament command omitted time slot ${expected.id}.",
        )
        assertEquals(expected.daysOfWeek.orEmpty(), actual.daysOfWeek)
        assertEquals(expected.startTimeMinutes, actual.startTimeMinutes)
        assertEquals(expected.endTimeMinutes, actual.endTimeMinutes)
        assertEquals(expected.divisions.orEmpty(), actual.divisions)
        assertEquals(expected.scheduledFieldIds.orEmpty(), actual.scheduledFieldIds)
    }

    val expectsScheduleBuild = submittedEvent.isAutomatedScheduling
    assertEquals(expectsScheduleBuild, draft.schedule.isAutomatedScheduling)
    assertEquals("FIXED_END", draft.schedule.mode)
    assertEquals(submittedEvent.end, Instant.parse(draft.schedule.endConstraint ?: ""))
    assertEquals(null, draft.schedule.generatedScheduleEnd)
    assertEquals(
        if (expectsScheduleBuild) "CREATE_AND_BUILD_SCHEDULE" else "CREATE_ONLY",
        command.completion.mode.name,
    )
    assertEquals(expectsScheduleBuild, command.hasScheduleProposalSupport)

    assertEquals(variant.event.staffingPriority.name, draft.staff.staffingPriority)
    assertEquals(true, draft.staff.doTeamsOfficiate)
    assertEquals(true, draft.staff.teamOfficialsMaySwap)
    assertEquals(variant.event.teamCheckInMode.name, draft.staff.teamCheckInMode)
    assertEquals(variant.event.teamCheckInOpenMinutesBefore, draft.staff.teamCheckInOpenMinutesBefore)
    assertEquals(variant.event.allowMatchRosterEdits, draft.staff.allowMatchRosterEdits)
    assertEquals(variant.event.allowTemporaryMatchPlayers, draft.staff.allowTemporaryMatchPlayers)
    assertEquals(variant.event.autoCreatePointMatchIncidents, draft.staff.autoCreatePointMatchIncidents)
    assertEquals(emptyList(), draft.staff.officialIds)
    assertEquals(emptyList(), draft.staff.eventOfficials)
    assertEquals(
        variant.event.officialPositions.map { position ->
            Triple(position.name, position.count, position.order)
        },
        draft.staff.officialPositions.map { position ->
            Triple(position.name, position.count, position.order)
        },
    )
}

private fun canonicalTournamentDivisionIdentity(detail: DivisionDetail): String {
    val normalizedId = detail.id.trim()
    return if (normalizedId.contains("__division__", ignoreCase = true)) {
        canonicalTournamentDivisionIdentity(normalizedId)
    } else {
        detail.key.trim().lowercase()
    }
}

private fun canonicalTournamentDivisionIdentity(id: String): String {
    val normalizedId = id.trim()
    val divisionSuffix = if (normalizedId.contains("__division__", ignoreCase = true)) {
        normalizedId.substringAfterLast("__division__", normalizedId)
    } else {
        normalizedId
    }
    val phaseSeparator = divisionSuffix.indexOf("__phase__", ignoreCase = true)
    if (phaseSeparator < 0) {
        return divisionSuffix.lowercase()
    }
    val baseIdentity = divisionSuffix.substring(0, phaseSeparator)
    val phaseIdentity = divisionSuffix.substring(phaseSeparator + "__phase__".length)
    return when {
        phaseIdentity.equals("pool", ignoreCase = true) -> baseIdentity.lowercase()
        phaseIdentity.startsWith("pool_", ignoreCase = true) ->
            "${baseIdentity}_${phaseIdentity}".lowercase()
        else -> baseIdentity.lowercase()
    }
}

private fun tournamentPoolIdentity(bracketIdentity: String, index: Int): String {
    var value = index.coerceAtLeast(0)
    var suffix = ""
    do {
        suffix = "${('a'.code + (value % 26)).toChar()}$suffix"
        value = value / 26 - 1
    } while (value >= 0)
    return "${bracketIdentity}_pool_$suffix"
}

private enum class TournamentDivisionDetailAssertion {
    EXACT,
    SERVER_NORMALIZED,
}

private fun assertTournamentEventValues(
    variant: LifecycleVariant,
    event: Event,
    divisionDetailAssertion: TournamentDivisionDetailAssertion = TournamentDivisionDetailAssertion.EXACT,
) {
    val expected = variant.event
    assertEquals(EventType.TOURNAMENT, event.eventType)
    assertEquals(expected.start, event.start)
    assertEquals(expected.end, event.end)
    assertEquals(expected.maxParticipants, event.maxParticipants)
    assertEquals(expected.doubleElimination, event.doubleElimination)
    assertEquals(expected.winnerSetCount, event.winnerSetCount)
    assertEquals(expected.loserSetCount, event.loserSetCount)
    assertEquals(expected.winnerBracketPointsToVictory, event.winnerBracketPointsToVictory)
    assertEquals(expected.loserBracketPointsToVictory, event.loserBracketPointsToVictory)
    assertEquals(expected.includePlayoffs, event.includePlayoffs)
    assertEquals(expected.playoffTeamCount, event.playoffTeamCount)
    assertEquals(expected.pointsToVictory, event.pointsToVictory)
    assertEquals(expected.usesSets, event.usesSets)
    assertEquals(expected.setsPerMatch, event.setsPerMatch)
    assertEquals(expected.setDurationMinutes, event.setDurationMinutes)
    assertEquals(expected.matchDurationMinutes, event.matchDurationMinutes)
    assertEquals(expected.restTimeMinutes, event.restTimeMinutes)
    assertEquals(expected.gamesPerOpponent, event.gamesPerOpponent)
    assertEquals(expected.isAutomatedScheduling, event.isAutomatedScheduling)
    assertEquals(expected.noFixedEndDateTime, event.noFixedEndDateTime)
    assertEquals(expected.officialSchedulingMode, event.officialSchedulingMode)
    assertEquals(expected.staffingPriority, event.staffingPriority)
    assertEquals(expected.doTeamsOfficiate, event.doTeamsOfficiate)
    assertEquals(expected.teamOfficialsMaySwap, event.teamOfficialsMaySwap)
    assertEquals(expected.teamCheckInMode, event.teamCheckInMode)
    assertEquals(expected.teamCheckInOpenMinutesBefore, event.teamCheckInOpenMinutesBefore)
    assertEquals(expected.allowMatchRosterEdits, event.allowMatchRosterEdits)
    assertEquals(expected.allowTemporaryMatchPlayers, event.allowTemporaryMatchPlayers)
    assertEquals(expected.autoCreatePointMatchIncidents, event.autoCreatePointMatchIncidents)
    assertEquals(expected.sportIds, event.sportIds)
    assertTrue(event.divisions.isNotEmpty(), "Tournament response must include persisted division ids.")

    val expectedRegularDetails = expected.divisionDetails.filterNot { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    val expectedPlayoffDetails = expected.divisionDetails.filter { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    if (divisionDetailAssertion == TournamentDivisionDetailAssertion.EXACT && !variant.isTournamentPoolPlay) {
        expectedRegularDetails.forEach { expectedDetail ->
            val actual = assertNotNull(
                event.divisionDetails.firstOrNull { detail ->
                    detail.id == expectedDetail.id && !detail.kind.equals("PLAYOFF", ignoreCase = true)
                },
                "Persisted Tournament bracket entry ${expectedDetail.id} is missing.",
            )
            assertEquals(expectedDetail.maxParticipants, actual.maxParticipants)
            assertEquals(expectedDetail.playoffTeamCount, actual.playoffTeamCount)
            assertEquals(expectedDetail.poolCount, actual.poolCount)
            assertEquals(expectedDetail.poolTeamCount, actual.poolTeamCount)
            assertEquals(expectedDetail.gamesPerOpponent, actual.gamesPerOpponent)
            assertEquals(expectedDetail.restTimeMinutes, actual.restTimeMinutes)
            assertEquals(expectedDetail.usesSets, actual.usesSets)
            assertEquals(expectedDetail.matchDurationMinutes, actual.matchDurationMinutes)
            assertEquals(expectedDetail.setDurationMinutes, actual.setDurationMinutes)
            assertEquals(expectedDetail.setsPerMatch, actual.setsPerMatch)

            assertEquals(expectedDetail.pointsToVictory, actual.pointsToVictory)
            assertEquals(expectedDetail.fieldIds.toSet(), actual.fieldIds.toSet())
        }
    }
    if (divisionDetailAssertion == TournamentDivisionDetailAssertion.EXACT) {
        expectedPlayoffDetails.forEach { expectedDetail ->
            val actual = assertNotNull(
                event.divisionDetails.firstOrNull { detail ->
                    canonicalTournamentDivisionIdentity(detail) ==
                        canonicalTournamentDivisionIdentity(expectedDetail)
                },
                "Persisted Tournament bracket ${expectedDetail.id} is missing; " +
                    "expectedIdentity=${canonicalTournamentDivisionIdentity(expectedDetail)}; actual=" +
                    event.divisionDetails.joinToString { detail ->
                        "${detail.id}|${detail.key}|${detail.kind}|identity=${canonicalTournamentDivisionIdentity(detail)}"
                    },
            )
            assertEquals(expectedDetail.maxParticipants, actual.maxParticipants)
            assertEquals(expectedDetail.playoffTeamCount, actual.playoffTeamCount)
            assertEquals(expectedDetail.poolCount, actual.poolCount)
            assertEquals(expectedDetail.poolTeamCount, actual.poolTeamCount)
            assertEquals(expectedDetail.fieldIds.toSet(), actual.fieldIds.toSet())
            assertEquals(expectedDetail.toTournamentConfig(), actual.toTournamentConfig())
        }
    }
}
private fun assertScheduledTournamentDivisionState(
    variant: LifecycleVariant,
    event: Event,
    matches: List<MatchMVP>,
) {
    val expectedRegularDetails = variant.event.divisionDetails.filterNot { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    val expectedPlayoffDetails = variant.event.divisionDetails.filter { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    val expectedRegularIdentities = expectedRegularDetails
        .map(::canonicalTournamentDivisionIdentity)
        .toSet()
    val expectedPlayoffIdentities = expectedPlayoffDetails
        .map(::canonicalTournamentDivisionIdentity)
        .toSet()
    assertEquals(
        expectedRegularIdentities,
        expectedPlayoffIdentities,
        "Scheduled Tournament regular and playoff division identities must align.",
    )
    val expectedPoolIdentities = expectedRegularDetails.flatMap { detail ->
        val bracketIdentity = canonicalTournamentDivisionIdentity(detail)
        (0 until (detail.poolCount ?: 0)).map { index ->
            tournamentPoolIdentity(bracketIdentity, index)
        }
    }.toSet()
    val expectedPersistedIdentities = expectedRegularIdentities + expectedPoolIdentities
    val actualPersistedIdentities = event.divisionDetails
        .map(::canonicalTournamentDivisionIdentity)
        .toSet()
    assertEquals(
        expectedPersistedIdentities,
        actualPersistedIdentities,
        "Scheduled Tournament accepted generated division identities changed after server normalization.",
    )
    val actualPoolPhaseIdentities = matches
        .filter { match -> match.phase.equals("POOL", ignoreCase = true) }
        .mapNotNull { match -> match.phaseDivisionId }
        .map { phaseId ->
            canonicalTournamentDivisionIdentity(phaseId.removeSuffix("__phase__pool"))
        }
        .toSet()
    assertEquals(
        expectedPoolIdentities,
        actualPoolPhaseIdentities,
        "Scheduled Tournament Match Graph pool division identities changed.",
    )
    assertEquals(
        expectedPoolIdentities.size,
        actualPoolPhaseIdentities.size,
        "Scheduled Tournament Match Graph pool division identity cardinality changed.",
    )
    val acceptedPhaseDivisionIds = matches
        .mapNotNull { match -> match.phaseDivisionId?.takeIf(String::isNotBlank) }
        .toSet()
    assertTrue(
        acceptedPhaseDivisionIds.isNotEmpty(),
        "Scheduled Tournament accepted Match Graph must retain phase division ids.",
    )
    acceptedPhaseDivisionIds.forEach { phaseDivisionId ->
        val phaseMarker = phaseDivisionId.indexOf("__phase__", ignoreCase = true)
        val entryDivisionId = if (phaseMarker >= 0) {
            phaseDivisionId.substring(0, phaseMarker)
        } else {
            phaseDivisionId
        }
        val persistedDetail = assertNotNull(
            event.divisionDetails.firstOrNull { detail ->
                detail.id.equals(phaseDivisionId, ignoreCase = true) ||
                    detail.id.equals(entryDivisionId, ignoreCase = true)
            },
            "Scheduled Tournament accepted phase $phaseDivisionId has no persisted division detail.",
        )
        if (phaseDivisionId.endsWith("__phase__pool", ignoreCase = true)) {
            assertTrue(
                persistedDetail.isSystemGenerated == true,
                "Scheduled Tournament pool phase $phaseDivisionId did not resolve to a generated division detail.",
            )
        }
    }

    expectedRegularDetails.forEach { expected ->
        val expectedIdentity = canonicalTournamentDivisionIdentity(expected)
        val actual = assertNotNull(
            event.divisionDetails.firstOrNull { detail ->
                canonicalTournamentDivisionIdentity(detail) == expectedIdentity &&
                    !detail.kind.equals("PLAYOFF", ignoreCase = true)
            },
            "Scheduled Tournament regular division $expectedIdentity is missing after normalization.",
        )
        assertTrue(
            actual.maxParticipants == expected.maxParticipants ||
                actual.maxParticipants?.let { capacity -> capacity >= expected.teamIds.size } == true,
            "Scheduled Tournament regular division $expectedIdentity has an invalid normalized capacity.",
        )
        assertEquals(expected.poolCount, actual.poolCount)
        assertEquals(expected.poolTeamCount, actual.poolTeamCount)
        assertEquals(expected.playoffTeamCount, actual.playoffTeamCount)
        assertEquals(expected.gamesPerOpponent, actual.gamesPerOpponent)
        assertEquals(expected.fieldIds.toSet(), actual.fieldIds.toSet())
    }
    expectedPlayoffDetails.forEach { expected ->
        val expectedIdentity = canonicalTournamentDivisionIdentity(expected)
        val phaseDivisionId = assertNotNull(
            acceptedPhaseDivisionIds.firstOrNull { phaseId ->
                matches.any { match ->
                    match.phase.equals("BRACKET", ignoreCase = true) &&
                        match.phaseDivisionId == phaseId
                } &&
                    canonicalTournamentDivisionIdentity(phaseId) == expectedIdentity
            },
            "Scheduled Tournament playoff division $expectedIdentity has no accepted phase.",
        )
        val phaseMarker = phaseDivisionId.indexOf("__phase__", ignoreCase = true)
        val entryDivisionId = if (phaseMarker >= 0) {
            phaseDivisionId.substring(0, phaseMarker)
        } else {
            phaseDivisionId
        }
        val actual = assertNotNull(
            event.divisionDetails.firstOrNull { detail ->
                detail.id.equals(entryDivisionId, ignoreCase = true)
            },
            "Scheduled Tournament playoff phase $phaseDivisionId has no persisted division detail.",
        )
        assertTrue(
            expected.playoffConfig != null,
            "Scheduled Tournament playoff division ${expected.id} lost elimination configuration in the fixture.",
        )
        assertEquals(
            expected.toTournamentConfig(),
            actual.toTournamentConfig(),
            "Scheduled Tournament playoff configuration changed after acceptance.",
        )
    }
}
private suspend fun assertTournamentAcceptedGraphCached(
    variant: LifecycleVariant,
    event: Event,
    host: MobileApiTestSession,
    label: String = "Accepted Tournament Room cache",
    requirePlaced: Boolean = false,
    assertDivisionDetails: Boolean = true,
    assertEventTeamIds: Boolean = true,
    acceptedDivisionIdentities: Set<String>? = null,
    acceptedMatchIds: Set<String>? = null,
    acceptedTeamIds: Set<String>? = null,
) {
    val database = host.database
    val cachedEvent = assertNotNull(
        database.getEventDao.getEventById(event.id),
        "Accepted Tournament ${event.id} is missing from the Room Event cache.",
    )
    assertEquals(event.id, cachedEvent.id)
    val cachedDivisionIdentities = cachedEvent.divisionDetails
        .map(::canonicalTournamentDivisionIdentity)
        .toSet()
    if (acceptedDivisionIdentities != null) {
        assertEquals(
            acceptedDivisionIdentities,
            cachedDivisionIdentities,
            "$label division identities changed in the Room cache.",
        )
    } else if (assertDivisionDetails) {
        assertEquals(event.divisionDetails, cachedEvent.divisionDetails)
    } else {
        assertEquals(
            event.divisionDetails.map(::canonicalTournamentDivisionIdentity).toSet(),
            cachedDivisionIdentities,
            "Accepted Tournament division identities changed in the Room cache.",
        )
    }
    if (acceptedTeamIds == null && assertEventTeamIds) {
        assertEquals(event.teamIds, cachedEvent.teamIds)
    }
    assertEquals(event.fieldIds, cachedEvent.fieldIds)
    assertEquals(event.timeSlotIds, cachedEvent.timeSlotIds)

    val relations = database.getEventDao.getEventWithRelationsById(event.id)
    assertEquals(cachedEvent.id, relations.event.id)
    if (acceptedTeamIds != null) {
        assertTrue(
            acceptedTeamIds.isNotEmpty(),
            "Accepted Tournament Match Graph must retain at least one team.",
        )
    } else if (!assertEventTeamIds) {
        assertTrue(
            relations.teams.isNotEmpty(),
            "Accepted Tournament Room relations must retain related team rows.",
        )
    }
    val expectedRelatedTeamIds = acceptedTeamIds ?: if (assertEventTeamIds) {
        event.teamIds.toSet()
    } else {
        relations.teams.map(Team::id).toSet()
    }
    assertEquals(
        expectedRelatedTeamIds,
        relations.teams.map(Team::id).toSet(),
        "Accepted Tournament teams are not fully related to the cached Event.",
    )
    assertEquals(
        expectedRelatedTeamIds.size,
        relations.teams.size,
        "Accepted Tournament team relations contain duplicate or missing rows.",
    )

    val cachedFields = database.getFieldDao.getFieldsByIds(event.fieldIds)
    assertEquals(
        event.fieldIds.toSet(),
        cachedFields.map(Field::id).toSet(),
        "Accepted Tournament fields are not fully persisted in Room.",
    )
    assertEquals(
        event.fieldIds.size,
        cachedFields.size,
        "Accepted Tournament field persistence changed the accepted field cardinality.",
    )
    variant.fields.forEach { expected ->
        val actual = assertNotNull(
            cachedFields.firstOrNull { field -> field.id == expected.id },
            "Accepted Tournament field ${expected.id} is missing from Room.",
        )
        assertEquals(expected.name, actual.name)
        assertEquals(expected.location, actual.location)
        assertEquals(expected.organizationId, actual.organizationId)
        assertEquals(expected.sportIds, actual.sportIds)
        assertTrue(
            actual.divisions
                .map(::canonicalTournamentDivisionIdentity)
                .toSet()
                .containsAll(expected.divisions.map(::canonicalTournamentDivisionIdentity).toSet()),
            "Accepted Tournament field ${expected.id} lost a division assignment in Room.",
        )
    }

    val cachedTimeSlotEntries = database.getEventTimeSlotDao
        .getTimeSlotsByEventId(event.id)
    assertEquals(
        event.timeSlotIds.toSet(),
        cachedTimeSlotEntries.map { entry -> entry.slotId }.toSet(),
        "Accepted Tournament time slots are not fully persisted in Room.",
    )
    assertEquals(
        event.timeSlotIds.size,
        cachedTimeSlotEntries.size,
        "Accepted Tournament time-slot persistence changed the accepted cardinality.",
    )
    assertEquals(
        cachedTimeSlotEntries.map { entry -> entry.slotId },
        relations.timeSlotCacheEntries.map { entry -> entry.slotId },
        "Room Event relations do not expose the accepted Tournament time slots.",
    )
    variant.timeSlots.forEach { expected ->
        val actual = assertNotNull(
            cachedTimeSlotEntries.firstOrNull { entry -> entry.slotId == expected.id },
            "Accepted Tournament time slot ${expected.id} is missing from Room.",
        )
        assertEquals(expected.dayOfWeek, actual.dayOfWeek)
        assertEquals(expected.daysOfWeek, actual.daysOfWeek)
        assertEquals(expected.startTimeMinutes, actual.startTimeMinutes)
        assertEquals(expected.endTimeMinutes, actual.endTimeMinutes)
        assertEquals(expected.startDate, actual.startDate)
        assertEquals(expected.timeZone, actual.timeZone)
        assertEquals(expected.repeating, actual.repeating)
        assertEquals(expected.endDate, actual.endDate)
        assertEquals(expected.scheduledFieldId, actual.scheduledFieldId)
        assertEquals(expected.scheduledFieldIds, actual.scheduledFieldIds)
        assertEquals(expected.price, actual.price)
        assertEquals(expected.requiredTemplateIds, actual.requiredTemplateIds)
        assertEquals(expected.hostRequiredTemplateIds, actual.hostRequiredTemplateIds)
        assertEquals(expected.sourceType, actual.sourceType)
        assertEquals(expected.rentalBookingId, actual.rentalBookingId)
        assertEquals(expected.rentalBookingItemId, actual.rentalBookingItemId)
        assertEquals(expected.rentalLocked, actual.rentalLocked)
        assertTrue(
            actual.divisions.orEmpty()
                .map(::canonicalTournamentDivisionIdentity)
                .toSet()
                .containsAll(expected.divisions.orEmpty().map(::canonicalTournamentDivisionIdentity).toSet()),
            "Accepted Tournament time slot ${expected.id} lost a division assignment in Room.",
        )
    }

    val cachedMatches = database.getMatchDao.getMatchesOfTournament(event.id)
    if (acceptedMatchIds != null && acceptedTeamIds != null) {
        assertAcceptedTournamentGraphStable(
            expectedMatchIds = acceptedMatchIds,
            expectedTeamIds = acceptedTeamIds,
            matches = cachedMatches,
            label = "Accepted Tournament Room cache",
        )
    }
    assertTournamentMatchGraph(
        variant = variant,
        event = cachedEvent,
        matches = cachedMatches,
        requirePlaced = requirePlaced,
    )
}

private data class TournamentMatchGraphSnapshot(
    val id: String,
    val matchId: Int,
    val eventId: String,
    val placementState: String,
    val phase: String?,
    val sourceDivisionId: String?,
    val phaseDivisionId: String?,
    val division: String?,
    val fieldId: String?,
    val team1Id: String?,
    val team2Id: String?,
    val team1Seed: Int?,
    val team2Seed: Int?,
    val start: Instant?,
    val end: Instant?,
    val side: String?,
    val losersBracket: Boolean,
    val winnerNextMatchId: String?,
    val loserNextMatchId: String?,
    val previousLeftId: String?,
    val previousRightId: String?,
)

private fun tournamentMatchGraphSnapshot(
    matches: List<MatchMVP>,
): List<TournamentMatchGraphSnapshot> =
    matches
        .sortedBy { match -> match.id }
        .map { match ->
            TournamentMatchGraphSnapshot(
                id = match.id,
                matchId = match.matchId,
                eventId = match.eventId,
                placementState = match.placementState,
                phase = match.phase,
                sourceDivisionId = match.sourceDivisionId,
                phaseDivisionId = match.phaseDivisionId,
                division = match.division,
                fieldId = match.fieldId,
                team1Id = match.team1Id,
                team2Id = match.team2Id,
                team1Seed = match.team1Seed,
                team2Seed = match.team2Seed,
                start = match.start,
                end = match.end,
                side = match.side,
                losersBracket = match.losersBracket,
                winnerNextMatchId = match.winnerNextMatchId,
                loserNextMatchId = match.loserNextMatchId,
                previousLeftId = match.previousLeftId,
                previousRightId = match.previousRightId,
            )
        }

private data class TournamentMatchDemandKey(
    val phase: String,
    val sourceDivisionId: String,
    val phaseDivisionId: String,
)

private fun tournamentPoolMatchDemand(
    teamCount: Int,
    gamesPerOpponent: Int,
): Int =
    if (teamCount < 2 || gamesPerOpponent < 1) {
        0
    } else {
        teamCount * (teamCount - 1) / 2 * gamesPerOpponent
    }

private fun tournamentBracketMatchDemand(
    teamCount: Int,
    doubleElimination: Boolean,
): Int =
    if (teamCount < 2) {
        0
    } else if (doubleElimination) {
        teamCount * 2 - 1
    } else {
        teamCount - 1
    }

private fun tournamentMatchTeamIds(matches: List<MatchMVP>): Set<String> =
    matches
        .flatMap { match -> listOfNotNull(match.team1Id, match.team2Id) }
        .filter(String::isNotBlank)
        .toSet()

private fun assertAcceptedTournamentGraphStable(
    expectedMatchIds: Set<String>,
    expectedTeamIds: Set<String>,
    matches: List<MatchMVP>,
    label: String,
) {
    assertEquals(
        expectedMatchIds.size,
        matches.size,
        "$label accepted Match Graph cardinality changed after reload.",
    )
    assertEquals(
        expectedTeamIds.size,
        tournamentMatchTeamIds(matches).size,
        "$label accepted Match Graph team cardinality changed after reload.",
    )
    assertEquals(
        expectedMatchIds,
        matches.map(MatchMVP::id).toSet(),
        "$label accepted Match Graph ids changed after reload.",
    )
    assertEquals(
        expectedTeamIds,
        tournamentMatchTeamIds(matches),
        "$label accepted Match Graph team ids changed after reload.",
    )
}

private data class TournamentTimeSlotWindow(
    val slot: TimeSlot,
    val start: Instant,
    val end: Instant,
)

private fun sourceTournamentTimeSlotWindow(slot: TimeSlot): TournamentTimeSlotWindow {
    assertFalse(slot.repeating, "Scheduled Tournament fixture slots must be one-time windows.")
    val timeZone = TimeZone.of(slot.timeZone)
    val localStart = slot.startDate.toLocalDateTime(timeZone)
    val localEnd = slot.endDate?.toLocalDateTime(timeZone)
    assertTrue(
        localEnd == null || localEnd.date == localStart.date,
        "Scheduled Tournament fixture slots must resolve start and end on one local date.",
    )
    val startMinutes = slot.startTimeMinutes ?: localStart.hour * 60 + localStart.minute
    val endMinutes = slot.endTimeMinutes ?: localEnd?.let { end -> end.hour * 60 + end.minute }
    assertNotNull(endMinutes, "Scheduled Tournament fixture slots must include an end time.")
    assertTrue(
        endMinutes > startMinutes,
        "Scheduled Tournament fixture slot end time must follow its start time.",
    )
    val localDayStart = localStart.date.atStartOfDayIn(timeZone)
    return TournamentTimeSlotWindow(
        slot = slot,
        start = localDayStart + startMinutes.minutes,
        end = localDayStart + endMinutes.minutes,
    )
}

private fun tournamentDivisionScopeIncludes(
    slotDivisionId: String,
    matchDivisionId: String,
): Boolean {
    val slotIdentity = canonicalTournamentDivisionIdentity(slotDivisionId)
    val matchIdentity = canonicalTournamentDivisionIdentity(matchDivisionId)
    return matchIdentity == slotIdentity ||
        matchIdentity.startsWith("${slotIdentity}_pool_")
}

private fun tournamentMatchFitsSourceTimeSlot(
    match: MatchMVP,
    window: TournamentTimeSlotWindow,
): Boolean {
    val fieldId = match.fieldId ?: return false
    val slotFieldIds = (
        window.slot.scheduledFieldIds.orEmpty() +
            listOfNotNull(window.slot.scheduledFieldId)
        ).toSet()
    if (fieldId !in slotFieldIds) return false
    val sourceDivisionId = match.sourceDivisionId
        ?.takeIf(String::isNotBlank)
        ?: return false
    val phaseDivisionId = match.phaseDivisionId
        ?.takeIf(String::isNotBlank)
        ?: return false
    val divisionId = match.division
        ?.takeIf(String::isNotBlank)
        ?: return false
    val sourceDivisionIdentity = canonicalTournamentDivisionIdentity(sourceDivisionId)
    val phaseDivisionIdentity = canonicalTournamentDivisionIdentity(phaseDivisionId)
    val divisionIdentity = canonicalTournamentDivisionIdentity(divisionId)
    if (sourceDivisionIdentity != divisionIdentity) return false
    val sourceDivisionBaseIdentity = sourceDivisionIdentity.substringBeforeLast(
        "_pool_",
        sourceDivisionIdentity,
    )
    if (
        phaseDivisionIdentity != sourceDivisionIdentity &&
        phaseDivisionIdentity != sourceDivisionBaseIdentity
    ) {
        return false
    }
    if (
        !window.slot.divisions.orEmpty().any { slotDivisionId ->
            tournamentDivisionScopeIncludes(slotDivisionId, sourceDivisionId)
        }
    ) {
        return false
    }
    val start = match.start ?: return false
    val end = match.end ?: return false
    return start >= window.start && end <= window.end
}

private fun assertTournamentMatchGraph(
    variant: LifecycleVariant,
    event: Event,
    matches: List<MatchMVP>,
    requirePlaced: Boolean = false,
) {
    val label = variant.key
    assertTrue(matches.isNotEmpty(), "$label should persist a non-empty Tournament Match Graph.")
    val matchIds = matches.map(MatchMVP::id)
    assertTrue(matchIds.all(String::isNotBlank), "$label Match Graph rows must have ids.")
    assertEquals(
        matchIds.size,
        matchIds.toSet().size,
        "$label Match Graph must not contain duplicate rows.",
    )
    assertTrue(
        matches.all { match -> match.eventId == event.id },
        "$label Match Graph rows must retain the created event identity.",
    )
    if (requirePlaced) {
        val allowedFieldIds = variant.fields.map(Field::id).toSet()
        assertTrue(
            matches.all { match ->
                val start = match.start
                val end = match.end
                match.placementState.equals("PLACED", ignoreCase = true) &&
                    start != null &&
                    end != null &&
                    match.fieldId?.let(allowedFieldIds::contains) == true &&
                    start >= event.start &&
                    end > start &&
                    end <= event.end
            },
            "$label scheduled Match Graph rows must contain valid time and Field placement within the fixed end.",
        )
        val sourceTimeSlotWindows = variant.timeSlots.map(::sourceTournamentTimeSlotWindow)
        matches.forEach { match ->
            val matchingWindow = sourceTimeSlotWindows.firstOrNull { window ->
                tournamentMatchFitsSourceTimeSlot(match, window)
            }
            assertNotNull(
                matchingWindow,
                "$label scheduled Match Graph placement did not fit a source Time Slot: " +
                    "match=${match.id}, field=${match.fieldId}, sourceDivision=${match.sourceDivisionId}, " +
                    "phaseDivision=${match.phaseDivisionId}, division=${match.division}, " +
                    "start=${match.start}, end=${match.end}, " +
                    "windows=${sourceTimeSlotWindows.joinToString { window -> "(${window.slot.id},${window.start},${window.end})" }}",
            )
        }
        assertTrue(
            matches.any { match ->
                !match.team1Id.isNullOrBlank() && !match.team2Id.isNullOrBlank()
            },
            "$label scheduled Match Graph should contain a match with both team assignments.",
        )
    } else {
        assertTrue(
            matches.all { match -> match.placementState.equals("UNPLACED", ignoreCase = true) },
            "$label CREATE_ONLY Match Graph rows must remain UNPLACED.",
        )
        assertTrue(
            matches.all { match ->
                match.start == null &&
                    match.end == null &&
                    match.fieldId == null
            },
            "$label CREATE_ONLY Match Graph rows must not gain scheduled placement.",
        )
    }

    val poolMatches = matches.filter { match ->
        match.phase.equals("POOL", ignoreCase = true)
    }
    val bracketMatches = matches.filter { match ->
        match.phase.equals("BRACKET", ignoreCase = true)
    }
    assertTrue(poolMatches.isNotEmpty(), "$label Match Graph must include Tournament pool matches.")
    assertTrue(bracketMatches.isNotEmpty(), "$label Match Graph must include Tournament bracket matches.")
    assertTrue(
        matches.all { match ->
            match.phase.equals("POOL", ignoreCase = true) ||
                match.phase.equals("BRACKET", ignoreCase = true)
        },
        "$label Match Graph rows must retain a Tournament phase.",
    )
    assertTrue(
        matches.all { match ->
            !match.sourceDivisionId.isNullOrBlank() &&
                !match.phaseDivisionId.isNullOrBlank() &&
                !match.division.isNullOrBlank()
        },
        "$label Match Graph rows must retain source, phase, and division identity.",
    )
    assertTrue(
        matches.all { match ->
            match.division == (match.sourceDivisionId ?: match.phaseDivisionId)
        },
        "$label Match Graph rows must keep division identity aligned with their phase source.",
    )

    val expectedRegularDetails = variant.event.divisionDetails.filterNot { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    val expectedPoolDetailsByIdentity = linkedMapOf<String, DivisionDetail>().apply {
        expectedRegularDetails.forEach { detail ->
            val bracketIdentity = canonicalTournamentDivisionIdentity(detail)
            repeat(detail.poolCount ?: 0) { index ->
                put(tournamentPoolIdentity(bracketIdentity, index), detail)
            }
        }
    }
    val expectedPoolPhaseIdentities = expectedPoolDetailsByIdentity.keys.toSet()
    assertEquals(
        expectedRegularDetails.sumOf { detail -> detail.poolCount ?: 0 },
        expectedPoolPhaseIdentities.size,
        "$label Match Graph fixture pool phase identities must be unique.",
    )
    val poolPhaseIds = poolMatches.mapNotNull { match -> match.phaseDivisionId }.toSet()
    val actualPoolPhaseIdsByIdentity = poolPhaseIds.associateBy(::canonicalTournamentDivisionIdentity)
    assertEquals(
        expectedPoolPhaseIdentities,
        actualPoolPhaseIdsByIdentity.keys,
        "$label Match Graph must contain exactly the configured Tournament pool phases.",
    )
    assertEquals(
        expectedPoolPhaseIdentities.size,
        actualPoolPhaseIdsByIdentity.size,
        "$label Tournament pool phase identities must be unique.",
    )
    assertTrue(
        poolPhaseIds.all { phaseId -> phaseId.endsWith("__phase__pool") },
        "$label pool matches must point to persisted POOL phase divisions.",
    )
    poolPhaseIds.forEach { phaseId ->
        val poolEntryId = phaseId.removeSuffix("__phase__pool")
        val phaseMatches = poolMatches.filter { match ->
            match.phaseDivisionId == phaseId
        }
        assertTrue(
            phaseMatches.isNotEmpty(),
            "$label pool phase $phaseId must retain its Match Graph demand.",
        )
        assertTrue(
            phaseMatches.all { match -> match.sourceDivisionId == poolEntryId },
            "$label pool phase $phaseId lost its source division identity.",
        )
    }

    val expectedBracketDetails = variant.event.divisionDetails.filter { detail ->
        detail.kind.equals("PLAYOFF", ignoreCase = true)
    }
    val bracketPhaseIds = bracketMatches.mapNotNull { match -> match.phaseDivisionId }.toSet()
    val expectedBracketIdentities = expectedBracketDetails
        .map(::canonicalTournamentDivisionIdentity)
        .toSet()
    val actualBracketIdentitiesByPhaseId = bracketPhaseIds.associateBy(::canonicalTournamentDivisionIdentity)
    assertEquals(
        expectedBracketDetails.size,
        bracketPhaseIds.size,
        "$label Tournament bracket phase cardinality changed.",
    )
    assertEquals(
        expectedBracketIdentities,
        actualBracketIdentitiesByPhaseId.keys,
        "$label Tournament bracket phase definitions changed.",
    )
    assertEquals(
        expectedBracketDetails.size,
        actualBracketIdentitiesByPhaseId.size,
        "$label Tournament bracket phase identities changed.",
    )
    val expectedBracketPhaseIds = bracketPhaseIds
    expectedBracketPhaseIds.forEach { phaseId ->
        assertTrue(
            bracketMatches.any { match -> match.phaseDivisionId == phaseId },
            "$label bracket phase $phaseId must retain its Match Graph demand.",
        )
    }

    val expectedDemandByGroup = linkedMapOf<TournamentMatchDemandKey, Int>()
    expectedPoolDetailsByIdentity.forEach { (poolIdentity, sourceRegularDetail) ->
        val phaseId = assertNotNull(
            actualPoolPhaseIdsByIdentity[poolIdentity],
            "$label pool phase identity $poolIdentity has no matching Match Graph phase.",
        )
        val sourceDivisionId = phaseId.removeSuffix("__phase__pool")
        val teamCount = sourceRegularDetail.poolTeamCount
            ?: sourceRegularDetail.maxParticipants
            ?: 0
        val gamesPerOpponent = sourceRegularDetail.gamesPerOpponent
            ?: variant.event.gamesPerOpponent
            ?: 1
        expectedDemandByGroup[
            TournamentMatchDemandKey(
                phase = "POOL",
                sourceDivisionId = sourceDivisionId,
                phaseDivisionId = phaseId,
            )
        ] = tournamentPoolMatchDemand(teamCount, gamesPerOpponent)
    }
    expectedBracketDetails.forEach { expectedDetail ->
        val bracketIdentity = canonicalTournamentDivisionIdentity(expectedDetail)
        val phaseId = assertNotNull(
            actualBracketIdentitiesByPhaseId[bracketIdentity],
            "$label bracket phase identity $bracketIdentity has no matching Match Graph phase.",
        )
        val phaseMatches = bracketMatches.filter { match ->
            match.phaseDivisionId == phaseId
        }
        assertTrue(
            phaseMatches.isNotEmpty(),
            "$label bracket phase $phaseId must retain its Match Graph demand.",
        )
        val sourceDivisionIds = phaseMatches.mapNotNull { match ->
            match.sourceDivisionId?.takeIf(String::isNotBlank)
        }.toSet()
        assertEquals(
            1,
            sourceDivisionIds.size,
            "$label bracket phase $phaseId changed its source division identity.",
        )
        val sourceDivisionId = sourceDivisionIds.single()
        val teamCount = expectedDetail.playoffTeamCount
            ?: variant.event.playoffTeamCount
            ?: 0
        expectedDemandByGroup[
            TournamentMatchDemandKey(
                phase = "BRACKET",
                sourceDivisionId = sourceDivisionId,
                phaseDivisionId = phaseId,
            )
        ] = tournamentBracketMatchDemand(
            teamCount = teamCount,
            doubleElimination = variant.event.doubleElimination,
        )
    }
    val configuredAdvancementBracketIdentities = expectedRegularDetails
        .flatMap { detail -> detail.playoffPlacementDivisionIds }
        .map(::canonicalTournamentDivisionIdentity)
        .toSet()
    assertEquals(
        expectedBracketIdentities,
        configuredAdvancementBracketIdentities,
        "$label Tournament fixture advancement mappings changed.",
    )
    val actualDemandByGroup = matches
        .groupingBy { match ->
            TournamentMatchDemandKey(
                phase = match.phase.orEmpty().trim().uppercase(),
                sourceDivisionId = match.sourceDivisionId.orEmpty(),
                phaseDivisionId = match.phaseDivisionId.orEmpty(),
            )
        }
        .eachCount()
    assertEquals(
        expectedDemandByGroup,
        actualDemandByGroup,
        "$label Match Graph demand must match the exact fixture count for every source and phase division.",
    )
    val matchesById = matches.associateBy(MatchMVP::id)
    bracketMatches.forEach { match ->
        val references = listOf(
            "winnerNextMatchId" to match.winnerNextMatchId,
            "loserNextMatchId" to match.loserNextMatchId,
            "previousLeftId" to match.previousLeftId,
            "previousRightId" to match.previousRightId,
        )
        references.forEach { (referenceName, referenceId) ->
            if (referenceId != null) {
                assertTrue(
                    matchesById.containsKey(referenceId),
                    "$label $referenceName on ${match.id} points to a missing Match Graph row.",
                )
            }
        }
        match.winnerNextMatchId?.let { nextId ->
            val next = assertNotNull(matchesById[nextId], "$label winner advancement target $nextId is missing.")
            assertTrue(
                next.previousLeftId == match.id || next.previousRightId == match.id,
                "$label winner advancement from ${match.id} is not represented by the target's previous links.",
            )
        }
        match.loserNextMatchId?.let { nextId ->
            val next = assertNotNull(matchesById[nextId], "$label loser advancement target $nextId is missing.")
            assertTrue(
                next.previousLeftId == match.id || next.previousRightId == match.id,
                "$label loser advancement from ${match.id} is not represented by the target's previous links.",
            )
        }
        listOf(match.previousLeftId, match.previousRightId).filterNotNull().forEach { previousId ->
            val previous = assertNotNull(matchesById[previousId], "$label previous Match Graph row $previousId is missing.")
            assertTrue(
                previous.winnerNextMatchId == match.id || previous.loserNextMatchId == match.id,
                "$label previous link $previousId -> ${match.id} is not represented by advancement.",
            )
        }
    }
    assertTrue(
        bracketMatches.any(MatchMVP::losersBracket),
        "$label Match Graph must retain a losers-bracket lane.",
    )
    assertTrue(
        bracketMatches.any { match -> match.loserNextMatchId != null },
        "$label Match Graph must retain loser advancement links.",
    )
    assertTrue(
        bracketMatches.any { match ->
            match.previousLeftId != null && match.previousRightId != null
        },
        "$label Match Graph must retain a bracket node with both advancement inputs.",
    )
}


private fun assertTournamentResourcesPersisted(
    variant: LifecycleVariant,
    state: EventEditorCanonicalState,
) {
    assertEquals(
        sourceFieldIds(variant.fields).toSet(),
        state.fields.map(Field::id).toSet(),
        "Tournament fields did not survive the editor reload.",
    )
    assertEquals(
        sourceTimeSlotIds(variant.timeSlots).toSet(),
        state.timeSlots.map(TimeSlot::id).toSet(),
        "Tournament time slots did not survive the editor reload.",
    )
    variant.fields.forEach { expected ->
        val actual = assertNotNull(
            state.fields.firstOrNull { field -> field.id == expected.id },
            "Tournament field ${expected.id} is missing after reload.",
        )
        assertEquals(expected.name, actual.name)
        assertEquals(expected.location, actual.location)
        assertEquals(expected.organizationId, actual.organizationId)
        assertTrue(
            actual.divisions
                .map(::canonicalTournamentDivisionIdentity)
                .toSet()
                .containsAll(expected.divisions.map(::canonicalTournamentDivisionIdentity).toSet()),
            "Tournament field ${expected.id} lost its division assignment.",
        )
    }
    variant.timeSlots.forEach { expected ->
        val actual = assertNotNull(
            state.timeSlots.firstOrNull { slot -> slot.id == expected.id },
            "Tournament time slot ${expected.id} is missing after reload.",
        )
        assertEquals(expected.daysOfWeek, actual.daysOfWeek)
        assertEquals(expected.startTimeMinutes, actual.startTimeMinutes)
        assertEquals(expected.endTimeMinutes, actual.endTimeMinutes)
        assertEquals(expected.startDate, actual.startDate)
        assertEquals(expected.endDate, actual.endDate)
        assertEquals(expected.scheduledFieldIds, actual.scheduledFieldIds)
        assertTrue(
            actual.divisions.orEmpty()
                .map(::canonicalTournamentDivisionIdentity)
                .toSet()
                .containsAll(expected.divisions.orEmpty().map(::canonicalTournamentDivisionIdentity).toSet()),
            "Tournament time slot ${expected.id} lost its division assignment.",
        )
    }
    variant.event.divisionDetails
        .filterNot { detail -> detail.kind.equals("PLAYOFF", ignoreCase = true) }
        .forEach { expected ->
            val expectedDivisionIdentity = canonicalTournamentDivisionIdentity(expected.id)
            val assignedFieldIds = state.divisionFieldIds
                .filterKeys { divisionId ->
                    canonicalTournamentDivisionIdentity(divisionId) == expectedDivisionIdentity
                }
                .values
                .flatten()
                .toSet()
            assertTrue(
                assignedFieldIds.containsAll(expected.fieldIds),
                "Tournament division ${expected.id} lost its field assignment. " +
                    "expectedFieldIds=${expected.fieldIds}; assignedFieldIds=$assignedFieldIds; " +
                    "divisionFieldIds=${state.divisionFieldIds}; stateFieldIds=${state.fields.map(Field::id)}",
            )
        }
}

private fun sourceFieldIds(fields: List<Field>): List<String> = fields.map(Field::id)

private fun sourceTimeSlotIds(timeSlots: List<TimeSlot>): List<String> = timeSlots.map(TimeSlot::id)
private fun runOwnedTournamentTeamIds(eventId: String): List<String> =
    SEEDED_TEAM_IDS.map { teamId -> "${eventId}__team__${teamId}" }


private fun buildTournamentContractVariant(
    runId: String,
    hostUserId: String,
): LifecycleVariant {
    val eventId = "${runId}_tournament_contract"
    val tournamentTimeZone = "America/Los_Angeles"
    val start = Instant.parse("2026-10-03T15:00:00Z")
    val end = Instant.parse("2026-10-04T05:00:00Z")
    val divisionIds = listOf(
        "${eventId}__division__open",
        "${eventId}__division__advanced",
    )
    val teamIds = runOwnedTournamentTeamIds(eventId)
    val fields = buildFields(
        eventId = eventId,
        divisionIds = divisionIds,
        splitDivisions = true,
        organizationId = null,
    )
    val timeSlots = buildTimeSlots(
        eventId = eventId,
        eventType = EventType.TOURNAMENT,
        start = start,
        end = end,
        fields = fields,
        divisionIds = divisionIds,
        splitDivisions = true,
    ).map { slot ->
        slot.copy(
            timeZone = tournamentTimeZone,
            dayOfWeek = 5,
            daysOfWeek = listOf(5),
            startDate = start + ((slot.startTimeMinutes ?: 8 * 60) - 8 * 60).minutes,
            rentalLocked = false,
        )
    }
    val regularDetails = buildRegularDivisionDetails(
        eventId = eventId,
        divisionIds = divisionIds,
        fields = fields,
        teamIds = teamIds,
        eventType = EventType.TOURNAMENT,
        includePlayoffs = true,
        usesSets = true,
    ).map { detail ->
        detail.copy(
            kind = "LEAGUE",
            isSystemGenerated = false,
            maxParticipants = 6,
            playoffTeamCount = 4,
            poolCount = 2,
            poolTeamCount = 3,
            playoffPlacementDivisionIds = listOf(detail.id),
            gamesPerOpponent = 2,
            restTimeMinutes = 10,
            usesSets = true,
            matchDurationMinutes = 45,
            setDurationMinutes = 15,
            setsPerMatch = 3,
            pointsToVictory = listOf(21, 21, 15),
        )
    }
    val playoffConfig = TournamentConfig(
        doubleElimination = true,
        winnerSetCount = 3,
        loserSetCount = 3,
        winnerBracketPointsToVictory = listOf(25, 25, 15),
        loserBracketPointsToVictory = listOf(25, 25, 15),
        prize = "Championship Trophy",
        fieldCount = 2,
        restTimeMinutes = 10,
        usesSets = true,
        matchDurationMinutes = null,
        setDurationMinutes = 15,
    )
    val playoffDetails = regularDetails.map { detail ->
        detail.copy(
            kind = "PLAYOFF",
            name = "${detail.name} Bracket",
            teamIds = emptyList(),
            playoffPlacementDivisionIds = emptyList(),
            playoffConfig = playoffConfig,
        )
    }
    val officialBundle = buildOfficialBundle(
        eventId = eventId,
        fieldIds = fields.map(Field::id),
        officialCase = OfficialCase.TEAM_OFFICIALS,
    )
    val event = Event(
        id = eventId,
        name = "Mobile Tournament Contract",
        description = "Provider-independent Tournament Event Editor contract fixture.",
        divisions = divisionIds,
        divisionDetails = regularDetails + playoffDetails,
        location = "Local Sports Complex",
        address = "1 Test Street",
        start = start,
        end = end,
        timeZone = tournamentTimeZone,
        imageId = UPLOADED_DOCUMENT_IMAGE_ID,
        coordinates = listOf(-122.4194, 37.7749),
        hostId = hostUserId,
        noFixedEndDateTime = false,
        isAutomatedScheduling = false,
        teamSignup = true,
        singleDivision = false,
        teamIds = teamIds,
        fieldIds = fields.map(Field::id),
        timeSlotIds = timeSlots.map(TimeSlot::id),
        sportIds = listOf(CONTRACT_SPORT_ID),
        organizationId = SEEDED_ORGANIZATION_ID,
        registrationPaymentMode = "FREE",
        maxParticipants = 12,
        teamSizeLimit = 2,
        registrationByDivisionType = true,
        eventType = EventType.TOURNAMENT,
        gamesPerOpponent = 2,
        includePlayoffs = true,
        playoffTeamCount = 4,
        doubleElimination = true,
        winnerSetCount = 3,
        loserSetCount = 3,
        winnerBracketPointsToVictory = listOf(25, 25, 15),
        loserBracketPointsToVictory = listOf(25, 25, 15),
        usesSets = true,
        matchDurationMinutes = 45,
        setDurationMinutes = 15,
        setsPerMatch = 3,
        pointsToVictory = listOf(21, 21, 15),
        restTimeMinutes = 10,
        state = "UNPUBLISHED",
        officialSchedulingMode = officialBundle.schedulingMode,
        staffingPriority = officialBundle.schedulingMode.toStaffingPriority(),
        officialPositions = officialBundle.positions,
        eventOfficials = officialBundle.eventOfficials,
        officialIds = officialBundle.officialIds,
        doTeamsOfficiate = true,
        teamOfficialsMaySwap = true,
        teamCheckInMode = TeamCheckInMode.MATCH,
        teamCheckInOpenMinutesBefore = 45,
        allowMatchRosterEdits = true,
        allowTemporaryMatchPlayers = true,
        autoCreatePointMatchIncidents = true,
        allowTeamSplitDefault = true,
    )
    return LifecycleVariant(
        key = "tournament_contract",
        event = event,
        fields = fields,
        timeSlots = timeSlots,
        divisionIds = divisionIds,
        resourceDivisionIds = divisionIds,
        primaryDivisionId = divisionIds.first(),
        splitDivisions = true,
        officialCase = OfficialCase.TEAM_OFFICIALS,
        occurrence = null,
    )
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
        occurrenceDate = "2026-09-09",
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
        start = Instant.parse("2026-09-02T15:00:00Z"),
        end = Instant.parse("2026-09-03T05:00:00Z"),
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
        start = Instant.parse("2026-09-05T15:00:00Z"),
        end = Instant.parse("2026-09-06T05:00:00Z"),
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
        start = Instant.parse("2026-09-08T15:00:00Z"),
        end = Instant.parse("2026-09-16T05:00:00Z"),
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
        start = Instant.parse("2026-09-11T15:00:00Z"),
        end = Instant.parse("2026-09-12T05:00:00Z"),
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
        start = Instant.parse("2026-09-14T15:00:00Z"),
        end = Instant.parse("2026-09-15T05:00:00Z"),
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
        start = Instant.parse("2026-09-16T15:00:00Z"),
        end = Instant.parse("2026-11-17T05:00:00Z"),
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
        start = Instant.parse("2026-09-18T15:00:00Z"),
        end = Instant.parse("2026-11-19T05:00:00Z"),
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
        start = Instant.parse("2026-09-20T15:00:00Z"),
        end = Instant.parse("2026-11-21T05:00:00Z"),
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
        start = Instant.parse("2026-09-22T15:00:00Z"),
        end = Instant.parse("2026-11-23T05:00:00Z"),
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
        organizationId = null,
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
        address = "1 Test Street",
        timeZone = "America/Los_Angeles",
        start = start,
        end = end,
        assistantHostIds = if (officialCase == OfficialCase.NAMED_OFFICIALS) {
            listOf(ASSISTANT_HOST_ONE_ID, ASSISTANT_HOST_TWO_ID)
        } else {
            emptyList()
        },
        imageId = UPLOADED_DOCUMENT_IMAGE_ID,
        coordinates = listOf(-122.4194, 37.7749),
        noFixedEndDateTime = false,
        isAutomatedScheduling = eventType.isSchedulable(),
        teamSignup = eventType.isSchedulable(),
        singleDivision = singleDivision,
        userIds = if (eventType.isSchedulable()) emptyList() else emptyList(),
        fieldIds = fields.map(Field::id),
        timeSlotIds = timeSlots.map(TimeSlot::id),
        sportIds = listOf(sportId),
        organizationId = if (officialCase == OfficialCase.NAMED_OFFICIALS) {
            null
        } else {
            SEEDED_ORGANIZATION_ID
        },
        maxParticipants = if (eventType.isSchedulable()) teamIds.size else 24,
        registrationPaymentMode = "FREE",
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
        staffingPriority = officialBundle.schedulingMode.toStaffingPriority(),
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
    organizationId: String? = null,
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
                    organizationId = organizationId,
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
                organizationId = organizationId,
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
    val oneTimeDayCount = if (repeating) {
        1
    } else {
        (end - start).inWholeDays.toInt().coerceAtLeast(0) + 1
    }
    return if (splitDivisions) {
        divisionIds.flatMapIndexed { index, divisionId ->
            val fieldIds = fields
                .filter { field -> divisionId in field.divisions }
                .map(Field::id)
            (0 until oneTimeDayCount).map { dayOffset ->
                val slotStart = if (repeating) {
                    start
                } else {
                    start + (dayOffset * 24 * 60).minutes
                }
                val slotEnd = if (repeating) {
                    end
                } else {
                    slotStart + (14 * 60 - index * 30).minutes
                }
                TimeSlot(
                    id = if (oneTimeDayCount == 1) {
                        "${eventId}_slot_${index + 1}"
                    } else {
                        "${eventId}_slot_${index + 1}_day_${dayOffset + 1}"
                    },
                    dayOfWeek = daysOfWeek.first(),
                    daysOfWeek = daysOfWeek,
                    divisions = listOf(divisionId),
                    startTimeMinutes = 8 * 60 + index * 30,
                    endTimeMinutes = 22 * 60,
                    startDate = slotStart,
                    timeZone = "America/Los_Angeles",
                    repeating = repeating,
                    endDate = slotEnd,
                    scheduledFieldId = fieldIds.first(),
                    scheduledFieldIds = fieldIds,
                    price = 0,
                )
            }
        }
    } else {
        (0 until oneTimeDayCount).map { dayOffset ->
            val slotStart = if (repeating) {
                start
            } else {
                start + (dayOffset * 24 * 60).minutes
            }
            val slotEnd = if (repeating) {
                end
            } else {
                slotStart + (14 * 60).minutes
            }
            TimeSlot(
                id = if (oneTimeDayCount == 1) {
                    "${eventId}_slot_1"
                } else {
                    "${eventId}_slot_1_day_${dayOffset + 1}"
                },
                dayOfWeek = daysOfWeek.first(),
                daysOfWeek = daysOfWeek,
                divisions = divisionIds,
                startTimeMinutes = 8 * 60,
                endTimeMinutes = 22 * 60,
                startDate = slotStart,
                timeZone = "America/Los_Angeles",
                repeating = repeating,
                endDate = slotEnd,
                scheduledFieldId = fields.first().id,
                scheduledFieldIds = fields.map(Field::id),
                price = 0,
            )
        }
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
            schedulingMode = OfficialSchedulingMode.SCHEDULE,
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
    val responseBody = (this as? EventEditorApiException)?.responseBody
        ?: (this as? ApiException)?.responseBody
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
private const val CONTRACT_SPORT_ID = "Basketball"
private const val UPLOADED_DOCUMENT_IMAGE_ID = "camka_upload_upscaled_cc_indoor_sports_024be2e8d5cdead5_jpg"
private const val ASSISTANT_HOST_ONE_ID = "dev_user_3"
private const val ASSISTANT_HOST_TWO_ID = "dev_user_4"
private const val OFFICIAL_ONE_ID = "dev_user_1"
private const val OFFICIAL_TWO_ID = "dev_user_2"
private const val DIRECT_SCORE_POINTS = 7
private const val TIMED_MATCH_DURATION_MINUTES = 20
private const val SET_MATCH_DURATION_MINUTES = 10
private const val TOURNAMENT_POOL_PLAYOFF_TEAM_COUNT = 3
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
