package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class EventDetailLifecycleBindingsTest {
    @Test
    fun registration_scope_cancels_stale_load_and_clears_when_identity_is_missing() = runTest {
        val selectedEvent = MutableStateFlow(Event(id = "event-1"))
        val currentUser = MutableStateFlow(UserData().copy(id = "user-1"))
        val selectedOccurrence = MutableStateFlow<SelectedWeeklyOccurrenceState?>(null)
        val events = mutableListOf<String>()
        val bindings = EventDetailLifecycleBindings(backgroundScope)

        bindings.bindRegistrationScope(
            selectedEvent = selectedEvent,
            currentUser = currentUser,
            selectedWeeklyOccurrence = selectedOccurrence,
            onMissingScope = { events += "missing" },
            onScopeChanged = { eventId ->
                events += "start:$eventId"
                if (eventId == "event-1") {
                    try {
                        awaitCancellation()
                    } finally {
                        events += "cancel:$eventId"
                    }
                } else {
                    events += "finish:$eventId"
                }
            },
        )
        runCurrent()

        selectedEvent.value = Event(id = "event-2")
        runCurrent()

        assertEquals(
            listOf("start:event-1", "cancel:event-1", "start:event-2", "finish:event-2"),
            events,
        )

        currentUser.value = UserData()
        runCurrent()

        assertEquals("missing", events.last())
    }

    @Test
    fun check_in_binding_ignores_unrelated_relation_changes_but_tracks_permission_scope() = runTest {
        val selectedEvent = MutableStateFlow(Event(id = "event-1", name = "Original"))
        val relations = MutableStateFlow(eventRelations(selectedEvent.value))
        val currentUser = MutableStateFlow(UserData().copy(id = "user-1"))
        val managedTeamId = MutableStateFlow<String?>(null)
        var refreshCount = 0
        val bindings = EventDetailLifecycleBindings(backgroundScope)

        bindings.bindEventTeamCheckIns(
            selectedEvent = selectedEvent,
            eventWithRelations = relations,
            currentUser = currentUser,
            currentUserManagedEventTeamId = managedTeamId,
            onScopeChanged = { refreshCount += 1 },
        )
        runCurrent()
        assertEquals(1, refreshCount)

        selectedEvent.value = selectedEvent.value.copy(name = "Renamed")
        relations.value = eventRelations(selectedEvent.value)
        runCurrent()
        assertEquals(1, refreshCount)

        relations.value = eventRelations(
            event = selectedEvent.value,
            organization = organization("org-1"),
        )
        runCurrent()
        assertEquals(2, refreshCount)

        managedTeamId.value = "event-team-1"
        runCurrent()
        assertEquals(3, refreshCount)
    }

    @Test
    fun managed_participant_binding_cancels_stale_bootstrap() = runTest {
        val firstTarget = participantTarget("event-1")
        val secondTarget = participantTarget("event-2")
        val targets = MutableStateFlow<ParticipantManagementRoomTarget?>(firstTarget)
        val events = mutableListOf<String>()
        val bindings = EventDetailLifecycleBindings(backgroundScope)

        bindings.bindManagedParticipantBootstrap(targets) { target ->
            val eventId = target?.eventId.orEmpty()
            events += "start:$eventId"
            if (target == firstTarget) {
                try {
                    awaitCancellation()
                } finally {
                    events += "cancel:$eventId"
                }
            } else {
                events += "finish:$eventId"
            }
        }
        runCurrent()

        targets.value = secondTarget
        runCurrent()

        assertEquals(
            listOf("start:event-1", "cancel:event-1", "start:event-2", "finish:event-2"),
            events,
        )
    }

    @Test
    fun match_realtime_binding_tracks_edit_pause_and_always_cleans_up() = runTest {
        val selectedEventId = MutableStateFlow("event-1")
        val isEditing = MutableStateFlow(false)
        val isEditingMatches = MutableStateFlow(false)
        val events = mutableListOf<String>()
        val bindings = EventDetailLifecycleBindings(backgroundScope)

        val job = bindings.bindMatchRealtime(
            selectedEventId = selectedEventId,
            isEditing = isEditing,
            isEditingMatches = isEditingMatches,
            resetIgnoredMatch = { events += "reset-ignore" },
            subscribe = { eventId -> events += "subscribe:$eventId" },
            setEditingPaused = { paused -> events += "pause:$paused" },
            unsubscribe = { events += "unsubscribe" },
        )
        runCurrent()

        assertEquals(
            listOf("reset-ignore", "subscribe:event-1", "pause:false"),
            events,
        )

        isEditing.value = true
        runCurrent()
        assertEquals(listOf("subscribe:event-1", "pause:true"), events.takeLast(2))

        selectedEventId.value = ""
        runCurrent()
        assertEquals(listOf("pause:false", "unsubscribe"), events.takeLast(2))

        selectedEventId.value = "event-2"
        runCurrent()
        assertEquals(listOf("subscribe:event-2", "pause:true"), events.takeLast(2))

        job.cancel()
        runCurrent()
        assertEquals(listOf("pause:false", "unsubscribe"), events.takeLast(2))
    }

    @Test
    fun withdraw_binding_deduplicates_non_key_changes_and_normalized_ids() = runTest {
        val selectedEvent = MutableStateFlow(
            Event(
                id = "event-1",
                name = "Original",
                userIds = listOf("player-1"),
            )
        )
        val selectedOccurrence = MutableStateFlow<SelectedWeeklyOccurrenceState?>(null)
        val refreshedEvents = mutableListOf<Event>()
        val bindings = EventDetailLifecycleBindings(backgroundScope)

        bindings.bindWithdrawTargets(
            selectedEvent = selectedEvent,
            selectedWeeklyOccurrence = selectedOccurrence,
            refreshWithdrawTargets = { event -> refreshedEvents += event },
        )
        runCurrent()
        assertEquals(1, refreshedEvents.size)

        selectedEvent.value = selectedEvent.value.copy(name = "Renamed")
        runCurrent()
        assertEquals(1, refreshedEvents.size)

        selectedEvent.value = selectedEvent.value.copy(userIds = listOf(" player-1 ", "player-1"))
        runCurrent()
        assertEquals(1, refreshedEvents.size)

        selectedEvent.value = selectedEvent.value.copy(userIds = listOf("player-1", "player-2"))
        runCurrent()
        assertEquals(2, refreshedEvents.size)

        selectedOccurrence.value = weeklySelection("slot-1", "2026-07-20")
        runCurrent()
        assertEquals(3, refreshedEvents.size)
    }

    @Test
    fun read_only_draft_binding_projects_fields_and_edit_state() = runTest {
        val relations = MutableStateFlow(eventRelations(Event(id = "event-1")))
        val eventFields = MutableStateFlow(
            listOf(FieldWithMatches(field = Field(id = "field-1"), matches = emptyList()))
        )
        val isEditing = MutableStateFlow(false)
        var state: EventDetailReadOnlyDraftBindingState? = null
        val bindings = EventDetailLifecycleBindings(backgroundScope)

        bindings.bindReadOnlyDraft(
            eventWithRelations = relations,
            eventFields = eventFields,
            isEditing = isEditing,
            onStateChanged = { updated -> state = updated },
        )
        runCurrent()

        val initialState = requireNotNull(state)
        assertEquals("event-1", initialState.relations.event.id)
        assertEquals(listOf("field-1"), initialState.fields.map(Field::id))
        assertFalse(initialState.editing)

        eventFields.value = listOf(
            FieldWithMatches(field = Field(id = "field-2"), matches = emptyList()),
        )
        isEditing.value = true
        runCurrent()

        val updatedState = requireNotNull(state)
        assertEquals(listOf("field-2"), updatedState.fields.map(Field::id))
        assertTrue(updatedState.editing)
    }

    private companion object {
        fun participantTarget(eventId: String): ParticipantManagementRoomTarget =
            ParticipantManagementRoomTarget(
                eventId = eventId,
                slotId = null,
                occurrenceDate = null,
                teamSignup = true,
            )

        fun weeklySelection(slotId: String, occurrenceDate: String): SelectedWeeklyOccurrenceState =
            SelectedWeeklyOccurrenceState(
                slotId = slotId,
                occurrenceDate = occurrenceDate,
                label = occurrenceDate,
                sessionStart = Instant.parse("${occurrenceDate}T18:00:00Z"),
                sessionEnd = Instant.parse("${occurrenceDate}T19:00:00Z"),
            )

        fun eventRelations(
            event: Event,
            organization: Organization? = null,
        ): EventWithFullRelations = EventWithFullRelations(
            event = event,
            players = emptyList(),
            matches = emptyList(),
            teams = emptyList(),
            organization = organization,
        )

        fun organization(id: String): Organization = Organization(
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
