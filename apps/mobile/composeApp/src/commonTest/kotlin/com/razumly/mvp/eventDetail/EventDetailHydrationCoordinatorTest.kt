package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class EventDetailHydrationCoordinatorTest {
    @Test
    fun prefetch_non_weekly_participants_marks_syncs_and_applies_detail_result() = runTest {
        val coordinator = EventDetailHydrationCoordinator()
        val events = mutableListOf<String>()

        coordinator.prefetchNonWeeklyParticipants(
            event = Event(id = "event-1"),
            isWeeklyParentEvent = { false },
            manage = true,
            markManagedBootstrapRequested = { event, occurrence, manage ->
                events += "mark:${event.id}:${occurrence?.slotId}:$manage"
            },
            syncEventDetail = { event, occurrence, manage ->
                events += "sync:${event.id}:${occurrence?.slotId}:$manage"
                Result.success(
                    EventDetailSyncResult(
                        participants = EventParticipantsSyncResult(
                            event = event,
                            participantCount = 4,
                            participantCapacity = 8,
                        )
                    )
                )
            },
            applyEventDetailSyncResult = { result ->
                events += "apply:${result.participants.participantCount}:${result.participants.participantCapacity}"
            },
            clearManagedBootstrapRequestIfCurrent = { event, occurrence ->
                events += "clear:${event.id}:${occurrence?.slotId}"
            },
            setError = { error ->
                events += "error:${error.message}"
            },
        )

        assertEquals(
            listOf(
                "mark:event-1:null:true",
                "sync:event-1:null:true",
                "apply:4:8",
            ),
            events,
        )
    }

    @Test
    fun weekly_occurrence_sync_applies_detail_and_selected_summary() = runTest {
        val coordinator = EventDetailHydrationCoordinator()
        val events = mutableListOf<String>()
        val occurrence = EventOccurrenceSelection(slotId = "slot-1", occurrenceDate = "2026-07-01")

        coordinator.syncSelectedWeeklyOccurrenceParticipants(
            event = Event(id = "event-1"),
            occurrence = occurrence,
            isWeeklyParentEvent = { true },
            manage = false,
            reportErrors = true,
            clearSelectedWeeklyOccurrenceSummary = { events += "clear-selected" },
            markManagedBootstrapRequested = { event, targetOccurrence, manage ->
                events += "mark:${event.id}:${targetOccurrence?.slotId}:$manage"
            },
            syncEventDetail = { event, targetOccurrence, manage ->
                events += "sync:${event.id}:${targetOccurrence?.slotId}:$manage"
                Result.success(
                    EventDetailSyncResult(
                        participants = EventParticipantsSyncResult(
                            event = event,
                            participantCount = 6,
                            participantCapacity = 10,
                        )
                    )
                )
            },
            applyEventDetailSyncResult = { result ->
                events += "apply:${result.participants.participantCount}"
            },
            applySelectedOccurrenceParticipantSummary = { targetOccurrence, required, count, capacity ->
                events += "selected:${targetOccurrence?.slotId}:$required:$count:$capacity"
            },
            clearManagedBootstrapRequestIfCurrent = { event, targetOccurrence ->
                events += "clear:${event.id}:${targetOccurrence?.slotId}"
            },
            setError = { error ->
                events += "error:${error.message}"
            },
            logWarning = { message, throwable ->
                events += "warn:$message:${throwable.message}"
            },
        )

        assertEquals(
            listOf(
                "mark:event-1:slot-1:false",
                "sync:event-1:slot-1:false",
                "apply:6",
                "selected:slot-1:false:6:10",
            ),
            events,
        )
    }

    @Test
    fun mobile_hydration_loads_event_participants_matches_and_shows_details() = runTest {
        val coordinator = EventDetailHydrationCoordinator()
        val events = mutableListOf<String>()
        val event = Event(id = " event-1 ")
        val occurrence = EventOccurrenceSelection(slotId = "slot-1", occurrenceDate = "2026-07-01")
        val request = coordinator.beginMobileHydration(
            event = event,
            showDetailsOnSuccess = true,
            showLoading = true,
            reportErrors = true,
            setParticipantLoading = { loading -> events += "participant-loading:$loading" },
            setMatchesLoading = { loading -> events += "matches-loading:$loading" },
            showDetails = { events += "show-details" },
        )

        assertNotNull(request)

        coordinator.hydrateMobileEventDetail(
            request = request,
            fallbackEvent = event,
            occurrence = occurrence,
            isWeeklyParentEvent = { true },
            getEvent = { eventId ->
                events += "get:$eventId"
                Result.success(Event(id = eventId))
            },
            syncCurrentUserRegistrationCacheForEvent = { eventId ->
                events += "sync-registrations:$eventId"
                Result.success(Unit)
            },
            syncEventParticipants = { targetEvent, targetOccurrence ->
                events += "sync:${targetEvent.id}:${targetOccurrence?.slotId}"
                Result.success(
                    EventParticipantsSyncResult(
                        event = targetEvent,
                        participantCount = 5,
                        participantCapacity = 12,
                    )
                )
            },
            refreshMatches = { eventId ->
                events += "matches:$eventId"
                Result.success(emptyList())
            },
            applyParticipantSyncResult = { result ->
                events += "apply:${result.participantCount}"
            },
            applySelectedOccurrenceParticipantSummary = { targetOccurrence, required, count, capacity ->
                events += "selected:${targetOccurrence?.slotId}:$required:$count:$capacity"
            },
            refreshParticipantManagementSnapshotIfNeeded = { targetEvent ->
                events += "refresh-snapshot:${targetEvent.id}"
            },
            refreshParticipantComplianceIfNeeded = { targetEvent ->
                events += "refresh-compliance:${targetEvent.id}"
            },
            setParticipantLoading = { loading -> events += "participant-loading:$loading" },
            setMatchesLoading = { loading -> events += "matches-loading:$loading" },
            showDetails = { events += "show-details" },
            setError = { error -> events += "error:${error.message}" },
        )

        assertEquals(
            listOf(
                "participant-loading:true",
                "matches-loading:true",
                "get:event-1",
                "sync-registrations:event-1",
                "sync:event-1:slot-1",
                "apply:5",
                "selected:slot-1:false:5:12",
                "refresh-snapshot:event-1",
                "refresh-compliance:event-1",
                "participant-loading:false",
                "matches:event-1",
                "show-details",
                "participant-loading:false",
                "matches-loading:false",
            ),
            events,
        )
    }

    @Test
    fun mobile_hydration_marks_matches_loading_for_silent_initial_refresh() = runTest {
        val coordinator = EventDetailHydrationCoordinator()
        val events = mutableListOf<String>()
        val event = Event(id = " event-1 ")
        val request = coordinator.beginMobileHydration(
            event = event,
            showDetailsOnSuccess = false,
            showLoading = false,
            reportErrors = false,
            setParticipantLoading = { loading -> events += "participant-loading:$loading" },
            setMatchesLoading = { loading -> events += "matches-loading:$loading" },
            showDetails = { events += "show-details" },
        )

        assertNotNull(request)

        coordinator.hydrateMobileEventDetail(
            request = request,
            fallbackEvent = event,
            occurrence = null,
            isWeeklyParentEvent = { false },
            getEvent = { eventId ->
                events += "get:$eventId"
                Result.success(Event(id = eventId))
            },
            syncCurrentUserRegistrationCacheForEvent = { eventId ->
                events += "sync-registrations:$eventId"
                Result.success(Unit)
            },
            syncEventParticipants = { targetEvent, targetOccurrence ->
                events += "sync:${targetEvent.id}:${targetOccurrence?.slotId}"
                Result.success(
                    EventParticipantsSyncResult(
                        event = targetEvent,
                        participantCount = 5,
                        participantCapacity = 12,
                    )
                )
            },
            refreshMatches = { eventId ->
                events += "matches:$eventId"
                Result.success(emptyList())
            },
            applyParticipantSyncResult = { result ->
                events += "apply:${result.participantCount}"
            },
            applySelectedOccurrenceParticipantSummary = { targetOccurrence, required, count, capacity ->
                events += "selected:${targetOccurrence?.slotId}:$required:$count:$capacity"
            },
            refreshParticipantManagementSnapshotIfNeeded = { targetEvent ->
                events += "refresh-snapshot:${targetEvent.id}"
            },
            refreshParticipantComplianceIfNeeded = { targetEvent ->
                events += "refresh-compliance:${targetEvent.id}"
            },
            setParticipantLoading = { loading -> events += "participant-loading:$loading" },
            setMatchesLoading = { loading -> events += "matches-loading:$loading" },
            showDetails = { events += "show-details" },
            setError = { error -> events += "error:${error.message}" },
        )

        assertEquals(
            listOf(
                "matches-loading:true",
                "get:event-1",
                "sync-registrations:event-1",
                "sync:event-1:null",
                "apply:5",
                "selected:null:false:5:12",
                "refresh-snapshot:event-1",
                "refresh-compliance:event-1",
                "matches:event-1",
                "matches-loading:false",
            ),
            events,
        )
    }
}
