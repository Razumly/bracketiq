package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.repositories.EventStaffAssignmentRole
import com.razumly.mvp.core.data.repositories.EventStaffInviteInput
import com.razumly.mvp.core.data.repositories.EventStaffState
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeEventRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class EventStaffPersistenceTest {
    @Test
    fun reconciliation_normalizes_complete_desired_state_into_one_repository_call() = runTest {
        val calls = mutableListOf<ReconcileCall>()
        val canonicalInvite = Invite(
            id = "invite_1",
            type = "STAFF",
            eventId = "event_1",
            email = "staff@example.com",
        )
        val repository = object : IEventRepository by CreateEvent_FakeEventRepository() {
            override suspend fun reconcileEventStaff(
                event: Event,
                pendingInvites: List<EventStaffInviteInput>,
                expectedRevision: String,
            ): Result<EventStaffState> {
                calls += ReconcileCall(event, pendingInvites, expectedRevision)
                return Result.success(
                    EventStaffState(
                        event = event.copy(assistantHostIds = listOf("resolved_staff")),
                        staffInvites = listOf(canonicalInvite),
                        revision = "revision_2",
                    ),
                )
            }
        }
        val desired = Event(
            id = "event_1",
            hostId = "host_1",
            assistantHostIds = listOf("assistant_1"),
            officialIds = listOf("official_1"),
        )

        val result = reconcileEventStaffState(
            eventRepository = repository,
            event = desired,
            pendingStaffInvites = listOf(
                PendingStaffInviteDraft(
                    firstName = "  Parker ",
                    lastName = " Pending  ",
                    email = " Staff@Example.com ",
                    roles = setOf(EventStaffRole.OFFICIAL, EventStaffRole.ASSISTANT_HOST),
                    resolvedUserId = " resolved_staff ",
                ),
            ),
            expectedRevision = " revision_1 ",
        ).getOrThrow()

        assertEquals("revision_2", result.revision)
        assertEquals(listOf(canonicalInvite), result.staffInvites)
        assertEquals(1, calls.size)
        assertEquals(desired, calls.single().event)
        assertEquals("revision_1", calls.single().expectedRevision)
        assertEquals(
            listOf(
                EventStaffInviteInput(
                    email = "staff@example.com",
                    firstName = "Parker",
                    lastName = "Pending",
                    roles = setOf(
                        EventStaffAssignmentRole.OFFICIAL,
                        EventStaffAssignmentRole.ASSISTANT_HOST,
                    ),
                    resolvedUserId = "resolved_staff",
                ),
            ),
            calls.single().pendingInvites,
        )
    }

    @Test
    fun reconciliation_fails_before_network_when_revision_is_missing() = runTest {
        var repositoryCalled = false
        val repository = object : IEventRepository by CreateEvent_FakeEventRepository() {
            override suspend fun reconcileEventStaff(
                event: Event,
                pendingInvites: List<EventStaffInviteInput>,
                expectedRevision: String,
            ): Result<EventStaffState> {
                repositoryCalled = true
                return Result.failure(AssertionError("must not be called"))
            }
        }

        val failure = assertFailsWith<IllegalArgumentException> {
            reconcileEventStaffState(
                eventRepository = repository,
                event = Event(id = "event_1"),
                pendingStaffInvites = emptyList(),
                expectedRevision = " ",
            ).getOrThrow()
        }

        assertTrue(failure.message.orEmpty().contains("Reload"))
        assertTrue(!repositoryCalled)
    }

    @Test
    fun reconciliation_rejects_an_incomplete_pending_invite_before_network() = runTest {
        var repositoryCalled = false
        val repository = object : IEventRepository by CreateEvent_FakeEventRepository() {
            override suspend fun reconcileEventStaff(
                event: Event,
                pendingInvites: List<EventStaffInviteInput>,
                expectedRevision: String,
            ): Result<EventStaffState> {
                repositoryCalled = true
                return Result.failure(AssertionError("must not be called"))
            }
        }

        val failure = assertFailsWith<IllegalStateException> {
            reconcileEventStaffState(
                eventRepository = repository,
                event = Event(id = "event_1"),
                pendingStaffInvites = listOf(
                    PendingStaffInviteDraft(
                        firstName = "",
                        lastName = "Person",
                        email = "staff@example.com",
                        roles = setOf(EventStaffRole.OFFICIAL),
                    ),
                ),
                expectedRevision = "revision_1",
            ).getOrThrow()
        }

        assertTrue(failure.message.orEmpty().contains("first name"))
        assertTrue(!repositoryCalled)
    }

    @Test
    fun reconciliation_rejects_a_malformed_pending_email_before_network() = runTest {
        var repositoryCalled = false
        val repository = object : IEventRepository by CreateEvent_FakeEventRepository() {
            override suspend fun reconcileEventStaff(
                event: Event,
                pendingInvites: List<EventStaffInviteInput>,
                expectedRevision: String,
            ): Result<EventStaffState> {
                repositoryCalled = true
                return Result.failure(AssertionError("must not be called"))
            }
        }

        val failure = assertFailsWith<IllegalStateException> {
            reconcileEventStaffState(
                eventRepository = repository,
                event = Event(id = "event_1"),
                pendingStaffInvites = listOf(
                    PendingStaffInviteDraft(
                        firstName = "Invalid",
                        lastName = "Email",
                        email = "not-an-email",
                        roles = setOf(EventStaffRole.OFFICIAL),
                    ),
                ),
                expectedRevision = "revision_1",
            ).getOrThrow()
        }

        assertTrue(failure.message.orEmpty().contains("valid staff invite email"))
        assertTrue(!repositoryCalled)
    }

    private data class ReconcileCall(
        val event: Event,
        val pendingInvites: List<EventStaffInviteInput>,
        val expectedRevision: String,
    )
}
