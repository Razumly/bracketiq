package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.eventCreate.CreateEvent_FakeUserRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EventStaffPersistenceTest {

    @Test
    fun previouslyAssignedUsers_withoutExistingInvites_areNotReinvited() = runTest {
        val userRepository = CreateEvent_FakeUserRepository()
        val event = Event(
            id = "event_1",
            hostId = "host_1",
            officialIds = listOf("official_1"),
            assistantHostIds = listOf("assistant_1"),
        )

        val result = reconcileEventStaffInvites(
            userRepository = userRepository,
            event = event,
            pendingStaffInvites = emptyList(),
            existingStaffInvites = emptyList(),
            previouslyAssignedUserIds = setOf("official_1", "assistant_1"),
            createdByUserId = "host_1",
        )

        result.getOrThrow()
        assertEquals(1, userRepository.createInviteCalls.size)
        assertEquals(emptyList(), userRepository.createInviteCalls.single())
    }

    @Test
    fun newlyAssignedUser_withoutExistingInvite_createsInvite() = runTest {
        val userRepository = CreateEvent_FakeUserRepository()
        val event = Event(
            id = "event_1",
            hostId = "host_1",
            officialIds = listOf("official_1", "official_2"),
        )

        val result = reconcileEventStaffInvites(
            userRepository = userRepository,
            event = event,
            pendingStaffInvites = emptyList(),
            existingStaffInvites = emptyList(),
            previouslyAssignedUserIds = setOf("official_1"),
            createdByUserId = "host_1",
        )

        result.getOrThrow()
        assertEquals(1, userRepository.createInviteCalls.size)
        assertEquals(listOf("official_2"), userRepository.createInviteCalls.single().mapNotNull { it.userId })
    }

    @Test
    fun existingPendingInvite_withSameRoles_isNotResent() = runTest {
        val userRepository = CreateEvent_FakeUserRepository()
        val event = Event(
            id = "event_1",
            hostId = "host_1",
            officialIds = listOf("official_1"),
        )
        val existingInvite = Invite(
            id = "invite_1",
            type = "STAFF",
            eventId = "event_1",
            userId = "official_1",
            email = "official1@example.com",
            status = "PENDING",
            staffTypes = listOf("OFFICIAL"),
        )

        val result = reconcileEventStaffInvites(
            userRepository = userRepository,
            event = event,
            pendingStaffInvites = emptyList(),
            existingStaffInvites = listOf(existingInvite),
            previouslyAssignedUserIds = setOf("official_1"),
            createdByUserId = "host_1",
        )

        result.getOrThrow()
        assertEquals(1, userRepository.createInviteCalls.size)
        assertEquals(emptyList(), userRepository.createInviteCalls.single())
    }

    @Test
    fun existingPendingInvite_withChangedRoles_isUpdated() = runTest {
        val userRepository = CreateEvent_FakeUserRepository()
        val event = Event(
            id = "event_1",
            hostId = "host_1",
            officialIds = listOf("official_1"),
            assistantHostIds = listOf("official_1"),
        )
        val existingInvite = Invite(
            id = "invite_1",
            type = "STAFF",
            eventId = "event_1",
            userId = "official_1",
            email = "official1@example.com",
            status = "PENDING",
            staffTypes = listOf("OFFICIAL"),
        )

        val result = reconcileEventStaffInvites(
            userRepository = userRepository,
            event = event,
            pendingStaffInvites = emptyList(),
            existingStaffInvites = listOf(existingInvite),
            previouslyAssignedUserIds = setOf("official_1"),
            createdByUserId = "host_1",
        )

        result.getOrThrow()
        assertEquals(1, userRepository.createInviteCalls.size)
        val request = userRepository.createInviteCalls.single().single()
        assertEquals("official_1", request.userId)
        assertEquals(listOf("HOST", "OFFICIAL"), request.staffTypes.sorted())
    }

    @Test
    fun unassignedExistingPendingInvite_isPreservedOnUnrelatedSave() = runTest {
        val userRepository = CreateEvent_FakeUserRepository()
        val event = Event(
            id = "event_1",
            hostId = "host_1",
            officialIds = listOf("official_1"),
        )
        val existingInvite = Invite(
            id = "invite_pending_1",
            type = "STAFF",
            eventId = "event_1",
            userId = "official_2",
            email = "official2@example.com",
            status = "PENDING",
            staffTypes = listOf("OFFICIAL"),
        )

        val result = reconcileEventStaffInvites(
            userRepository = userRepository,
            event = event,
            pendingStaffInvites = emptyList(),
            existingStaffInvites = listOf(existingInvite),
            previouslyAssignedUserIds = setOf("official_1"),
            createdByUserId = "host_1",
        ).getOrThrow()

        assertTrue(userRepository.deleteInviteCalls.isEmpty())
        assertEquals(listOf(existingInvite), result.staffInvites)
    }

    @Test
    fun removedPreviouslyAssignedInvite_isDeleted() = runTest {
        val userRepository = CreateEvent_FakeUserRepository()
        val event = Event(
            id = "event_1",
            hostId = "host_1",
            officialIds = emptyList(),
        )
        val existingInvite = Invite(
            id = "invite_removed_1",
            type = "STAFF",
            eventId = "event_1",
            userId = "official_1",
            email = "official1@example.com",
            status = "PENDING",
            staffTypes = listOf("OFFICIAL"),
        )

        reconcileEventStaffInvites(
            userRepository = userRepository,
            event = event,
            pendingStaffInvites = emptyList(),
            existingStaffInvites = listOf(existingInvite),
            previouslyAssignedUserIds = setOf("official_1"),
            createdByUserId = "host_1",
        ).getOrThrow()

        assertEquals(listOf("invite_removed_1"), userRepository.deleteInviteCalls)
    }
}
