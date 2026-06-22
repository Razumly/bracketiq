package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventInviteCoordinatorTest {

    @Test
    fun suggested_users_can_be_replaced_removed_and_cleared() {
        val coordinator = EventInviteCoordinator()
        val userOne = user(" user-1 ")
        val userTwo = user("user-2")

        coordinator.replaceSuggestedUsers(listOf(userOne, userTwo))

        assertEquals(listOf(userOne, userTwo), coordinator.suggestedUsers.value)

        coordinator.removeSuggestedUser(" user-1 ")

        assertEquals(listOf(userTwo), coordinator.suggestedUsers.value)

        coordinator.clearSuggestedUsers()

        assertEquals(emptyList(), coordinator.suggestedUsers.value)
    }

    @Test
    fun invite_team_search_state_tracks_loading_success_failure_and_removal() {
        val coordinator = EventInviteCoordinator()
        val teamOne = team(" team-1 ")
        val teamTwo = team("team-2")

        coordinator.startInviteTeamSearch()

        assertTrue(coordinator.inviteTeamsLoading.value)

        coordinator.finishInviteTeamSearch(listOf(teamOne, teamTwo))

        assertFalse(coordinator.inviteTeamsLoading.value)
        assertEquals(listOf(teamOne, teamTwo), coordinator.inviteTeamSuggestions.value)

        coordinator.removeInviteTeamSuggestion(" team-1 ")

        assertEquals(listOf(teamTwo), coordinator.inviteTeamSuggestions.value)

        coordinator.startInviteTeamSearch()
        coordinator.failInviteTeamSearch()

        assertFalse(coordinator.inviteTeamsLoading.value)
        assertEquals(emptyList(), coordinator.inviteTeamSuggestions.value)

        coordinator.finishInviteTeamSearch(listOf(teamOne))
        coordinator.clearInviteTeamSearch()

        assertFalse(coordinator.inviteTeamsLoading.value)
        assertEquals(emptyList(), coordinator.inviteTeamSuggestions.value)
    }

    @Test
    fun pending_staff_invites_are_normalized_merged_and_removed_by_role() {
        val coordinator = EventInviteCoordinator()

        val officialDraft = coordinator.pendingStaffInviteDraft(
            firstName = " Cam ",
            lastName = " Kay ",
            email = " STAFF@Example.COM ",
            roles = setOf(EventStaffRole.OFFICIAL),
        ).getOrThrow()
        coordinator.addPendingStaffInviteDraft(officialDraft)

        assertEquals(
            listOf(
                PendingStaffInviteDraft(
                    firstName = "Cam",
                    lastName = "Kay",
                    email = "staff@example.com",
                    roles = setOf(EventStaffRole.OFFICIAL),
                )
            ),
            coordinator.pendingStaffInvites.value,
        )

        val assistantDraft = coordinator.pendingStaffInviteDraft(
            firstName = "",
            lastName = "Updated",
            email = "staff@example.com",
            roles = setOf(EventStaffRole.ASSISTANT_HOST),
        ).getOrThrow()
        coordinator.addPendingStaffInviteDraft(assistantDraft)

        assertEquals(
            PendingStaffInviteDraft(
                firstName = "Cam",
                lastName = "Updated",
                email = "staff@example.com",
                roles = setOf(EventStaffRole.OFFICIAL, EventStaffRole.ASSISTANT_HOST),
            ),
            coordinator.pendingStaffInvites.value.single(),
        )
        assertTrue(
            coordinator.pendingStaffInviteDraft(
                firstName = "Cam",
                lastName = "Kay",
                email = "staff@example.com",
                roles = setOf(EventStaffRole.OFFICIAL),
            ).isFailure,
        )

        coordinator.removePendingStaffInvite(" staff@example.com ", EventStaffRole.OFFICIAL)

        assertEquals(
            setOf(EventStaffRole.ASSISTANT_HOST),
            coordinator.pendingStaffInvites.value.single().roles,
        )

        coordinator.removePendingStaffInvite("staff@example.com", null)

        assertEquals(emptyList(), coordinator.pendingStaffInvites.value)
    }

    @Test
    fun pending_staff_invite_draft_requires_email_and_role() {
        val coordinator = EventInviteCoordinator()

        assertTrue(
            coordinator.pendingStaffInviteDraft(
                firstName = "Cam",
                lastName = "Kay",
                email = " ",
                roles = setOf(EventStaffRole.OFFICIAL),
            ).isFailure,
        )
        assertTrue(
            coordinator.pendingStaffInviteDraft(
                firstName = "Cam",
                lastName = "Kay",
                email = "staff@example.com",
                roles = emptySet(),
            ).isFailure,
        )
    }

    private fun user(id: String): UserData =
        UserData().copy(id = id)

    private fun team(id: String): Team =
        Team(captainId = "captain-1").copy(id = id)
}
