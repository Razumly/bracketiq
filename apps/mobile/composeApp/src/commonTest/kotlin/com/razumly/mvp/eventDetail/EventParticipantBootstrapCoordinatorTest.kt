package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventParticipantManagementEntry
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class EventParticipantBootstrapCoordinatorTest {
    @Test
    fun room_state_switches_team_to_user_compliance_and_clears_for_missing_weekly_target() = runTest {
        val fixture = fixture(
            initialEvent = Event(id = "event-1", teamSignup = true),
        )
        var localState = ParticipantManagementLocalState()
        backgroundScope.launch {
            fixture.coordinator.participantLocalStateFlow().collect { state ->
                localState = state
            }
        }
        runCurrent()

        fixture.snapshotFlow("event-1").value = participantSnapshot("registration-team")
        fixture.teamComplianceFlow("event-1").value = listOf(
            EventTeamComplianceSummary(teamId = "team-1", teamName = "Team One"),
        )
        runCurrent()

        assertEquals("registration-team", localState.snapshot.teamRegistrations.single().registrationId)
        assertEquals(setOf("team-1"), localState.teamSummaries.keys)
        assertTrue(localState.userSummaries.isEmpty())

        fixture.selectedEvent.value = fixture.selectedEvent.value.copy(teamSignup = false)
        runCurrent()
        fixture.userComplianceFlow("event-1").value = listOf(
            EventComplianceUserSummary(userId = "user-1", fullName = "User One"),
        )
        runCurrent()

        assertTrue(localState.teamSummaries.isEmpty())
        assertEquals(setOf("user-1"), localState.userSummaries.keys)

        fixture.teamComplianceFlow("event-1").value = listOf(
            EventTeamComplianceSummary(teamId = "stale-team", teamName = "Stale Team"),
        )
        runCurrent()
        assertTrue(localState.teamSummaries.isEmpty())
        assertEquals(setOf("user-1"), localState.userSummaries.keys)

        fixture.selectedEvent.value = weeklyEvent(teamSignup = false)
        runCurrent()

        assertEquals(EventParticipantManagementSnapshot(), localState.snapshot)
        assertTrue(localState.teamSummaries.isEmpty())
        assertTrue(localState.userSummaries.isEmpty())
    }

    @Test
    fun organization_permission_transition_bootstraps_once_and_applies_participants_before_resources_and_staff() = runTest {
        val fixture = fixture(Event(id = "event-1", teamSignup = true))
        val currentUser = MutableStateFlow(UserData().copy(id = "user-1"))
        val organization = MutableStateFlow<Organization?>(null)
        val warning = EventParticipantDivisionWarning(
            divisionId = "division-1",
            code = "NO_FIELD",
            message = "No field assigned.",
        )
        fixture.syncEventDetailHandler = { event, _, _ ->
            fixture.events += "sync"
            Result.success(
                EventDetailSyncResult(
                    participants = EventParticipantsSyncResult(
                        event = event,
                        participantCount = 4,
                        divisionWarnings = listOf(warning),
                    ),
                    staffRevision = "staff-v1",
                )
            )
        }
        backgroundScope.launch {
            fixture.coordinator.managedBootstrapTargetFlow(
                currentUser = currentUser,
                eventOrganization = organization,
                canManage = { _, _, loadedOrganization -> loadedOrganization != null },
            ).collect { target ->
                fixture.coordinator.refreshManagedBootstrap(target)
            }
        }
        runCurrent()

        assertTrue(fixture.events.isEmpty())
        organization.value = organization("org-1")
        runCurrent()

        assertEquals(
            listOf("sync", "resources:1", "staff:staff-v1"),
            fixture.events,
        )
        assertEquals(listOf(warning), fixture.participantCoordinator.participantDivisionWarnings.value)
        assertFalse(fixture.participantCoordinator.participantManagementLoading.value)
        assertFalse(fixture.participantCoordinator.participantComplianceLoading.value)

        organization.value = organization("org-1").copy(name = "Updated Organization")
        runCurrent()
        assertEquals(1, fixture.events.count { it == "sync" })
    }

    @Test
    fun failed_managed_bootstrap_finishes_loading_and_clears_suppression_for_retry() = runTest {
        val fixture = fixture(Event(id = "event-1", teamSignup = true))
        val target = ParticipantManagementRoomTarget(
            eventId = "event-1",
            slotId = null,
            occurrenceDate = null,
            teamSignup = true,
        )
        var calls = 0
        fixture.syncEventDetailHandler = { _, _, _ ->
            calls += 1
            assertTrue(fixture.participantCoordinator.participantManagementLoading.value)
            assertTrue(fixture.participantCoordinator.participantComplianceLoading.value)
            Result.failure(IllegalStateException("Bootstrap unavailable"))
        }

        fixture.coordinator.refreshManagedBootstrap(target)
        fixture.coordinator.refreshManagedBootstrap(target)

        assertEquals(2, calls)
        assertFalse(fixture.participantCoordinator.participantManagementLoading.value)
        assertFalse(fixture.participantCoordinator.participantComplianceLoading.value)
        assertEquals(2, fixture.warnings.count { it.contains("Bootstrap unavailable") })
    }

    @Test
    fun mobile_hydration_marks_managed_target_before_launching_and_suppresses_duplicate_bootstrap() = runTest {
        val fixture = fixture(Event(id = "event-1", teamSignup = true))
        val eventResponse = CompletableDeferred<Result<Event>>()
        fixture.getEventHandler = { eventResponse.await() }
        var managedBootstrapCalls = 0
        fixture.syncEventDetailHandler = { event, _, _ ->
            managedBootstrapCalls += 1
            Result.success(EventDetailSyncResult(EventParticipantsSyncResult(event)))
        }
        val target = ParticipantManagementRoomTarget(
            eventId = "event-1",
            slotId = null,
            occurrenceDate = null,
            teamSignup = true,
        )

        fixture.coordinator.hydrateMobileEventDetail(
            showDetailsOnSuccess = false,
            showLoading = false,
            reportErrors = false,
        )
        fixture.coordinator.refreshManagedBootstrap(target)

        assertEquals(0, managedBootstrapCalls)
        runCurrent()
        eventResponse.complete(Result.success(fixture.selectedEvent.value))
        runCurrent()

        assertEquals(0, managedBootstrapCalls)
        assertFalse(fixture.matchesLoading.value)
    }

    @Test
    fun newer_hydration_keeps_loading_until_it_finishes_and_only_it_can_show_details() = runTest {
        val fixture = fixture(Event(id = "event-1"))
        val firstResponse = CompletableDeferred<Result<Event>>()
        val secondResponse = CompletableDeferred<Result<Event>>()
        var getEventCalls = 0
        fixture.getEventHandler = { eventId ->
            getEventCalls += 1
            if (getEventCalls == 1) firstResponse.await() else secondResponse.await()
        }

        fixture.coordinator.hydrateMobileEventDetail(
            showDetailsOnSuccess = true,
            showLoading = true,
            reportErrors = true,
        )
        runCurrent()
        assertTrue(fixture.participantCoordinator.eventTeamsAndParticipantsLoading.value)
        assertTrue(fixture.matchesLoading.value)

        fixture.selectedEvent.value = Event(id = "event-2")
        fixture.coordinator.hydrateMobileEventDetail(
            showDetailsOnSuccess = true,
            showLoading = true,
            reportErrors = true,
        )
        runCurrent()

        firstResponse.complete(Result.success(Event(id = "event-1")))
        runCurrent()
        assertTrue(fixture.participantCoordinator.eventTeamsAndParticipantsLoading.value)
        assertTrue(fixture.matchesLoading.value)
        assertEquals(0, fixture.showDetailsCount)

        secondResponse.complete(Result.success(Event(id = "event-2")))
        runCurrent()

        assertFalse(fixture.participantCoordinator.eventTeamsAndParticipantsLoading.value)
        assertFalse(fixture.matchesLoading.value)
        assertEquals(1, fixture.showDetailsCount)
        assertEquals(listOf(true, true, false), fixture.matchesLoadingEvents)
        assertTrue(fixture.errors.isEmpty())
    }

    @Test
    fun weekly_selection_preserves_cache_membership_sync_order_and_replaces_summary_prefetch_job() = runTest {
        val fixture = fixture(weeklyEvent())
        val selection = fixture.weeklyCoordinator.selectWeeklySession(
            isWeeklyParent = true,
            sessionStart = Instant.parse("2026-07-20T18:00:00Z"),
            sessionEnd = Instant.parse("2026-07-20T19:00:00Z"),
            slotId = "slot-selected",
            occurrenceDate = "2026-07-20",
            label = "July 20",
        ) as WeeklySessionSelectionResult.Selected
        val cachedSummary = WeeklyOccurrenceSummary(participantCount = 3, participantCapacity = 8)
        fixture.weeklyCoordinator.rememberWeeklyOccurrenceSummary(
            EventOccurrenceSelection("slot-selected", "2026-07-20"),
            cachedSummary,
        )
        fixture.weeklyCoordinator.clearSelectedWeeklyOccurrenceSummary()
        fixture.syncEventDetailHandler = { event, occurrence, _ ->
            fixture.events += "sync:${occurrence?.slotId}"
            Result.success(
                EventDetailSyncResult(
                    EventParticipantsSyncResult(
                        event = event,
                        participantCount = 4,
                        participantCapacity = 8,
                    )
                )
            )
        }

        fixture.coordinator.onWeeklyOccurrenceChanged(selection.selection)

        assertEquals(
            listOf("membership-cache:true", "sync:slot-selected", "resources:0", "staff:null"),
            fixture.events,
        )

        val firstOccurrence = EventOccurrenceSelection("slot-first", "2026-07-21")
        val secondOccurrence = EventOccurrenceSelection("slot-second", "2026-07-22")
        val firstSummary = CompletableDeferred<Result<EventParticipantsSummary>>()
        val secondSummary = CompletableDeferred<Result<EventParticipantsSummary>>()
        fixture.summaryHandler = { _, occurrence ->
            when (occurrence.slotId) {
                "slot-first" -> firstSummary.await()
                else -> secondSummary.await()
            }
        }

        fixture.coordinator.prefetchWeeklyOccurrenceSummaries(listOf(firstOccurrence))
        runCurrent()
        fixture.coordinator.prefetchWeeklyOccurrenceSummaries(listOf(secondOccurrence))
        runCurrent()
        firstSummary.complete(Result.success(EventParticipantsSummary(participantCount = 1)))
        secondSummary.complete(Result.success(EventParticipantsSummary(participantCount = 2)))
        runCurrent()

        val summaries = fixture.weeklyCoordinator.weeklyOccurrenceSummaries.value
        assertNull(summaries[weeklyOccurrenceSummaryKey("slot-first", "2026-07-21")])
        assertEquals(
            WeeklyOccurrenceSummary(participantCount = 2, participantCapacity = null),
            summaries[weeklyOccurrenceSummaryKey("slot-second", "2026-07-22")],
        )
    }

    private fun TestScope.fixture(initialEvent: Event): CoordinatorFixture =
        CoordinatorFixture(
            scope = backgroundScope,
            initialEvent = initialEvent,
        )

    private class CoordinatorFixture(
        scope: CoroutineScope,
        initialEvent: Event,
    ) {
        val selectedEvent = MutableStateFlow(initialEvent)
        val participantCoordinator = EventParticipantManagementCoordinator(false)
        val weeklyCoordinator = EventWeeklyOccurrenceCoordinator()
        val matchesLoading = MutableStateFlow(false)
        val matchesLoadingEvents = mutableListOf<Boolean>()
        val events = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        val errors = mutableListOf<String>()
        var showDetailsCount = 0
        var canManage = true

        private val snapshotFlows = mutableMapOf<String, MutableStateFlow<EventParticipantManagementSnapshot>>()
        private val teamComplianceFlows = mutableMapOf<String, MutableStateFlow<List<EventTeamComplianceSummary>>>()
        private val userComplianceFlows = mutableMapOf<String, MutableStateFlow<List<EventComplianceUserSummary>>>()

        var getEventHandler: suspend (String) -> Result<Event> = { Result.success(selectedEvent.value) }
        var syncParticipantHandler: suspend (
            Event,
            EventOccurrenceSelection?,
        ) -> Result<EventParticipantsSyncResult> = { event, _ ->
            Result.success(EventParticipantsSyncResult(event))
        }
        var syncEventDetailHandler: suspend (
            Event,
            EventOccurrenceSelection?,
            Boolean,
        ) -> Result<EventDetailSyncResult> = { event, _, _ ->
            Result.success(EventDetailSyncResult(EventParticipantsSyncResult(event)))
        }
        var summaryHandler: suspend (
            String,
            EventOccurrenceSelection,
        ) -> Result<EventParticipantsSummary> = { _, _ ->
            Result.success(EventParticipantsSummary())
        }

        val coordinator = EventParticipantBootstrapCoordinator(
            selectedEvent = selectedEvent,
            participantManagementCoordinator = participantCoordinator,
            weeklyOccurrenceCoordinator = weeklyCoordinator,
            operations = EventParticipantBootstrapOperations(
                getEvent = { eventId -> getEventHandler(eventId) },
                syncCurrentUserRegistrationCacheForEvent = { Result.success(Unit) },
                syncEventParticipants = { event, occurrence -> syncParticipantHandler(event, occurrence) },
                syncEventDetail = { event, occurrence, manage ->
                    syncEventDetailHandler(event, occurrence, manage)
                },
                refreshMatches = { Result.success(emptyList()) },
                observeParticipantManagementSnapshot = { eventId, _ -> snapshotFlow(eventId) },
                observeTeamCompliance = { eventId, _ -> teamComplianceFlow(eventId) },
                observeUserCompliance = { eventId, _ -> userComplianceFlow(eventId) },
                loadParticipantManagementSnapshot = { eventId, _ ->
                    Result.success(snapshotFlow(eventId).value)
                },
                loadTeamCompliance = { eventId, _ ->
                    Result.success(teamComplianceFlow(eventId).value)
                },
                loadUserCompliance = { eventId, _ ->
                    Result.success(userComplianceFlow(eventId).value)
                },
                getEventParticipantsSummary = { eventId, occurrence ->
                    summaryHandler(eventId, occurrence)
                },
            ),
            effects = EventParticipantBootstrapEffects(
                canManageParticipantData = { canManage },
                refreshCurrentUserMembershipState = {
                    events += "membership-cache:${weeklyCoordinator.selectedWeeklyOccurrenceSummary.value != null}"
                },
                applyBootstrapSyncResult = {
                    events += "resources:${participantCoordinator.participantDivisionWarnings.value.size}"
                },
                replaceStaffInvites = { _, revision -> events += "staff:$revision" },
                setMatchesLoading = { loading ->
                    matchesLoading.value = loading
                    matchesLoadingEvents += loading
                },
                showDetails = { showDetailsCount += 1 },
                setError = { error -> errors += error.message },
                logWarning = { message, throwable -> warnings += "$message ${throwable.message}" },
            ),
            scope = scope,
        )

        fun snapshotFlow(eventId: String): MutableStateFlow<EventParticipantManagementSnapshot> =
            snapshotFlows.getOrPut(eventId) { MutableStateFlow(EventParticipantManagementSnapshot()) }

        fun teamComplianceFlow(eventId: String): MutableStateFlow<List<EventTeamComplianceSummary>> =
            teamComplianceFlows.getOrPut(eventId) { MutableStateFlow(emptyList()) }

        fun userComplianceFlow(eventId: String): MutableStateFlow<List<EventComplianceUserSummary>> =
            userComplianceFlows.getOrPut(eventId) { MutableStateFlow(emptyList()) }
    }

    private companion object {
        fun participantSnapshot(registrationId: String): EventParticipantManagementSnapshot =
            EventParticipantManagementSnapshot(
                teamRegistrations = listOf(
                    EventParticipantManagementEntry(
                        registrationId = registrationId,
                        registrantId = "team-1",
                        registrantType = "TEAM",
                    )
                ),
            )

        fun weeklyEvent(teamSignup: Boolean = true): Event =
            Event(
                id = "event-1",
                eventType = EventType.WEEKLY_EVENT,
                timeSlotIds = listOf("slot-selected", "slot-first", "slot-second"),
                teamSignup = teamSignup,
            )

        fun organization(id: String): Organization =
            Organization(
                id = id,
                name = "Organization",
                location = null,
                description = null,
                logoId = null,
                ownerId = "owner-1",
                website = null,
                hasStripeAccount = false,
                coordinates = null,
            )
    }
}
