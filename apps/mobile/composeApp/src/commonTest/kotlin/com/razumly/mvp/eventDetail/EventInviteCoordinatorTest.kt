package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.runTest
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
    fun search_users_clears_short_query_and_reports_search_failures() = runTest {
        val coordinator = EventInviteCoordinator()
        val user = user("user-1")

        val successError = coordinator.searchUsers(" cam ") { query ->
            assertEquals("cam", query)
            Result.success(listOf(user))
        }

        assertEquals(listOf(user), coordinator.suggestedUsers.value)
        assertEquals(null, successError)

        coordinator.searchUsers(" ") { error("Search should not run for blank query.") }

        assertEquals(emptyList(), coordinator.suggestedUsers.value)

        val failure = coordinator.searchUsers("cam") {
            Result.failure(IllegalStateException("Search unavailable"))
        }

        assertEquals("Search unavailable", failure?.message)
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
    fun search_invite_teams_uses_event_context_and_clears_invalid_searches() = runTest {
        val coordinator = EventInviteCoordinator()
        val team = team("team-1", name = "Team One")

        val error = coordinator.searchInviteTeams(
            query = " ro ",
            event = Event(id = "event-1", teamSignup = true),
            organizationId = "org-1",
            sportName = "Soccer",
            excludeTeamIds = setOf("existing-team"),
        ) { query, eventId, organizationId, sportName, excludeTeamIds ->
            assertEquals("ro", query)
            assertEquals("event-1", eventId)
            assertEquals("org-1", organizationId)
            assertEquals("Soccer", sportName)
            assertEquals(setOf("existing-team"), excludeTeamIds)
            Result.success(listOf(team))
        }

        assertEquals(null, error)
        assertFalse(coordinator.inviteTeamsLoading.value)
        assertEquals(listOf(team), coordinator.inviteTeamSuggestions.value)

        coordinator.searchInviteTeams(
            query = "r",
            event = Event(id = "event-1", teamSignup = true),
            organizationId = null,
            sportName = null,
            excludeTeamIds = emptySet(),
        ) { _, _, _, _, _ -> error("Search should not run for short query.") }

        assertEquals(emptyList(), coordinator.inviteTeamSuggestions.value)

        val failure = coordinator.searchInviteTeams(
            query = "ro",
            event = Event(id = "event-1", teamSignup = true),
            organizationId = null,
            sportName = null,
            excludeTeamIds = emptySet(),
        ) { _, _, _, _, _ -> Result.failure(IllegalStateException("Team search failed")) }

        assertEquals("Team search failed", failure?.message)
        assertFalse(coordinator.inviteTeamsLoading.value)
    }

    @Test
    fun invite_team_to_event_adds_team_refreshes_event_and_removes_suggestion() = runTest {
        val coordinator = EventInviteCoordinator()
        val loadingHandler = RecordingLoadingHandler()
        val team = team("team-1", name = "Rovers")
        coordinator.finishInviteTeamSearch(listOf(team))
        val refreshed = mutableListOf<String>()

        val message = coordinator.inviteTeamToEvent(
            team = team,
            event = Event(id = "event-1", teamSignup = true),
            existingTeamIds = emptySet(),
            selectedDivisionId = "division-a",
            occurrence = null,
            loadingHandler = loadingHandler,
            addTeam = { event, addedTeam, preferredDivisionId, occurrence ->
                assertEquals("event-1", event.id)
                assertEquals("team-1", addedTeam.id)
                assertEquals("division-a", preferredDivisionId)
                assertEquals(null, occurrence)
                Result.success(Unit)
            },
            refreshAfterMutation = { eventId, warningMessage ->
                refreshed += "$eventId:$warningMessage"
            },
        )

        assertEquals("Rovers added to the event.", message.message)
        assertEquals(emptyList(), coordinator.inviteTeamSuggestions.value)
        assertEquals(
            listOf("event-1:Failed to refresh event after adding team participant."),
            refreshed,
        )
        assertEquals(listOf("show:Adding team...", "hide"), loadingHandler.events)
    }

    @Test
    fun invite_player_to_event_adds_player_refreshes_event_and_removes_suggestion() = runTest {
        val coordinator = EventInviteCoordinator()
        val loadingHandler = RecordingLoadingHandler()
        val player = user("user-1", fullName = "Cam Kay")
        coordinator.replaceSuggestedUsers(listOf(player))
        val refreshed = mutableListOf<String>()

        val message = coordinator.invitePlayerToEvent(
            user = player,
            event = Event(id = "event-1", teamSignup = false),
            existingUserIds = emptySet(),
            selectedDivisionId = "division-a",
            occurrence = null,
            loadingHandler = loadingHandler,
            addPlayer = { event, addedPlayer, preferredDivisionId, occurrence ->
                assertEquals("event-1", event.id)
                assertEquals("user-1", addedPlayer.id)
                assertEquals("division-a", preferredDivisionId)
                assertEquals(null, occurrence)
                Result.success(Unit)
            },
            refreshAfterMutation = { eventId, warningMessage ->
                refreshed += "$eventId:$warningMessage"
            },
        )

        assertEquals("Cam Kay added to the event.", message.message)
        assertEquals(emptyList(), coordinator.suggestedUsers.value)
        assertEquals(
            listOf("event-1:Failed to refresh event after adding player participant."),
            refreshed,
        )
        assertEquals(listOf("show:Adding player...", "hide"), loadingHandler.events)
    }

    @Test
    fun invite_player_by_email_validates_input_and_sends_normalized_invite() = runTest {
        val coordinator = EventInviteCoordinator()
        val loadingHandler = RecordingLoadingHandler()

        assertEquals(
            "Enter first name, last name, and a valid email.",
            coordinator.invitePlayerToEventByEmail(
                firstName = " ",
                lastName = "Kay",
                email = "bad",
                event = Event(teamSignup = false),
                loadingHandler = loadingHandler,
                createInvite = { _, _, _, _ -> error("Invite should not send for invalid input.") },
            ).message,
        )

        assertEquals(
            "This event accepts teams, not individual players.",
            coordinator.invitePlayerToEventByEmail(
                firstName = "Cam",
                lastName = "Kay",
                email = "CAM@Example.COM",
                event = Event(teamSignup = true),
                loadingHandler = loadingHandler,
                createInvite = { _, _, _, _ -> error("Invite should not send for team events.") },
            ).message,
        )

        val message = coordinator.invitePlayerToEventByEmail(
            firstName = " Cam ",
            lastName = " Kay ",
            email = " CAM@Example.COM ",
            event = Event(id = "event-1", teamSignup = false),
            loadingHandler = loadingHandler,
            createInvite = { event, email, firstName, lastName ->
                assertEquals("event-1", event.id)
                assertEquals("cam@example.com", email)
                assertEquals("Cam", firstName)
                assertEquals("Kay", lastName)
                Result.success(emptyList<Invite>())
            },
        )

        assertEquals("Event invite sent to cam@example.com.", message.message)
        assertEquals(listOf("show:Sending invite...", "hide"), loadingHandler.events)
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

    private fun user(id: String, fullName: String = ""): UserData {
        val nameParts = fullName.split(" ", limit = 2)
        return UserData().copy(
            id = id,
            firstName = nameParts.getOrElse(0) { "" },
            lastName = nameParts.getOrElse(1) { "" },
        )
    }

    private fun team(id: String, name: String = ""): Team =
        Team(captainId = "captain-1").copy(id = id, name = name)

    private class RecordingLoadingHandler : LoadingHandler {
        private val _loadingState = MutableStateFlow(LoadingState())
        override val loadingState: StateFlow<LoadingState> = _loadingState.asStateFlow()
        val events = mutableListOf<String>()

        override fun showLoading(message: String, progress: Float?) {
            events += "show:$message"
            _loadingState.value = LoadingState(isLoading = true, message = message, progress = progress)
        }

        override fun hideLoading() {
            events += "hide"
            _loadingState.value = LoadingState()
        }

        override fun updateProgress(progress: Float) {
            _loadingState.value = _loadingState.value.copy(progress = progress)
        }
    }
}
