package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventRoomStoreTest {
    @Test
    fun given_accepted_registration_lock_when_ordinary_event_projection_reloads_then_locks_survive() {
        val acceptedRegistration = Event(
            id = "event-accepted",
            eventTypeLocked = true,
            registrationUnitLocked = true,
        )
        val ordinaryProjection = acceptedRegistration.copy(
            name = "After cancellation and refund",
            eventTypeLocked = false,
            registrationUnitLocked = false,
            eventTypeHasProtectedHistory = false,
        )

        val reloaded = mergePersistedEventEditorLocks(
            incoming = ordinaryProjection,
            cached = acceptedRegistration,
        )

        assertTrue(reloaded.eventTypeLocked)
        assertTrue(reloaded.registrationUnitLocked)
        assertFalse(reloaded.eventTypeHasProtectedHistory)
    }

    @Test
    fun given_protected_match_history_when_event_snapshot_is_cached_then_history_lock_survives_later_projection() {
        val protectedEvent = Event(
            id = "event-history",
            eventTypeLocked = true,
            eventTypeHasProtectedHistory = true,
        )
        val ordinaryProjection = protectedEvent.copy(
            eventTypeLocked = false,
            eventTypeHasProtectedHistory = false,
        )

        val reloaded = mergePersistedEventEditorLocks(
            incoming = ordinaryProjection,
            cached = protectedEvent,
        )

        assertTrue(reloaded.eventTypeLocked)
        assertTrue(reloaded.eventTypeHasProtectedHistory)
        assertFalse(reloaded.registrationUnitLocked)
    }

    @Test
    fun given_protected_match_history_when_authoritative_response_clears_history_then_event_lock_clears() {
        val protectedEvent = Event(
            id = "event-history-cleared",
            eventTypeLocked = true,
            eventTypeHasProtectedHistory = true,
        )

        val reloaded = mergePersistedEventEditorLocks(
            incoming = Event(id = protectedEvent.id),
            cached = protectedEvent,
            protectedHistoryAuthoritative = true,
        )

        assertFalse(reloaded.eventTypeLocked)
        assertFalse(reloaded.eventTypeHasProtectedHistory)
    }

    @Test
    fun given_accepted_registration_when_authoritative_response_clears_history_then_registration_lock_survives() {
        val acceptedRegistration = Event(
            id = "event-accepted-history-cleared",
            eventTypeLocked = true,
            registrationUnitLocked = true,
            eventTypeHasProtectedHistory = true,
        )

        val reloaded = mergePersistedEventEditorLocks(
            incoming = Event(id = acceptedRegistration.id),
            cached = acceptedRegistration,
            protectedHistoryAuthoritative = true,
        )

        assertTrue(reloaded.eventTypeLocked)
        assertTrue(reloaded.registrationUnitLocked)
        assertFalse(reloaded.eventTypeHasProtectedHistory)
    }

    @Test
    fun given_protected_match_history_when_explicit_event_lock_is_missing_then_event_type_is_locked() {
        val reloaded = mergePersistedEventEditorLocks(
            incoming = Event(
                id = "event-history-without-explicit-lock",
                eventTypeHasProtectedHistory = true,
            ),
            cached = null,
        )

        assertTrue(reloaded.eventTypeLocked)
        assertTrue(reloaded.eventTypeHasProtectedHistory)
    }

    @Test
    fun given_non_locking_projection_when_no_cached_lock_exists_then_controls_remain_unlocked() {
        val reloaded = mergePersistedEventEditorLocks(
            incoming = Event(id = "event-waitlist-or-failed-payment"),
            cached = null,
        )

        assertFalse(reloaded.eventTypeLocked)
        assertFalse(reloaded.registrationUnitLocked)
        assertFalse(reloaded.eventTypeHasProtectedHistory)
    }
}
