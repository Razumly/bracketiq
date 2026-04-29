package com.razumly.mvp.teamManagement

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.TeamInviteEventTeamOption
import com.razumly.mvp.core.data.repositories.TeamInviteFreeAgentContext
import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class TeamInviteDialogUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun free_agent_tab_prechecks_source_event_teams_and_sends_selected_ids() {
        var invitedUserId: String? = null
        var invitedEmail: String? = "unset"
        var invitedEventTeamIds: List<String> = emptyList()

        composeRule.setContent {
            MaterialTheme {
                TeamInviteDialog(
                    teamName = "Test team",
                    inviteTarget = TeamInviteTarget.PLAYER,
                    freeAgents = listOf(user("user-free-agent", "Jane", "Free")),
                    friends = emptyList(),
                    suggestions = emptyList(),
                    inviteFreeAgentContext = inviteContext(),
                    onSearch = {},
                    onDismiss = {},
                    onInvite = { selectedUser, email, eventTeamIds ->
                        invitedUserId = selectedUser?.id
                        invitedEmail = email
                        invitedEventTeamIds = eventTeamIds
                    },
                )
            }
        }

        composeRule.onNodeWithText("Free Agents").assertIsDisplayed()
        composeRule.onNodeWithText("Invite User").assertIsDisplayed()
        composeRule.onNodeWithText("Invite by Email").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Invite Jane Free").performClick()
        composeRule.onNodeWithText("Send Player Invite").performClick()

        assertEquals("user-free-agent", invitedUserId)
        assertNull(invitedEmail)
        assertEquals(listOf("event-team-1"), invitedEventTeamIds)
    }

    @Test
    fun invite_by_email_tab_sends_email_and_checked_event_team_ids() {
        var invitedUserId: String? = "unset"
        var invitedEmail: String? = null
        var invitedEventTeamIds: List<String> = emptyList()

        composeRule.setContent {
            MaterialTheme {
                TeamInviteDialog(
                    teamName = "Test team",
                    inviteTarget = TeamInviteTarget.PLAYER,
                    freeAgents = listOf(user("user-free-agent", "Jane", "Free")),
                    friends = emptyList(),
                    suggestions = emptyList(),
                    inviteFreeAgentContext = inviteContext(),
                    onSearch = {},
                    onDismiss = {},
                    onInvite = { selectedUser, email, eventTeamIds ->
                        invitedUserId = selectedUser?.id
                        invitedEmail = email
                        invitedEventTeamIds = eventTeamIds
                    },
                )
            }
        }

        composeRule.onNodeWithText("Invite by Email").performClick()
        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("new.player@example.com")
        composeRule.onNodeWithContentDescription("Toggle Summer League Test team").performClick()
        composeRule.onNodeWithText("Send Player Invite").performClick()

        assertNull(invitedUserId)
        assertEquals("new.player@example.com", invitedEmail)
        assertEquals(listOf("event-team-1"), invitedEventTeamIds)
    }

    private fun inviteContext(): TeamInviteFreeAgentContext =
        TeamInviteFreeAgentContext(
            users = listOf(user("user-free-agent", "Jane", "Free")),
            eventIds = listOf("event-1"),
            freeAgentIds = listOf("user-free-agent"),
            eventTeams = listOf(
                TeamInviteEventTeamOption(
                    eventId = "event-1",
                    eventTeamId = "event-team-1",
                    eventName = "Summer League",
                    eventStart = "2030-05-01T12:00:00.000Z",
                    eventEnd = "2030-05-01T14:00:00.000Z",
                    teamName = "Test team",
                ),
                TeamInviteEventTeamOption(
                    eventId = "event-2",
                    eventTeamId = "event-team-2",
                    eventName = "Open Cup",
                    eventStart = "2030-06-01T12:00:00.000Z",
                    eventEnd = "2030-06-01T14:00:00.000Z",
                    teamName = "Test team",
                ),
            ),
            freeAgentEventsByUserId = mapOf("user-free-agent" to listOf("event-1")),
            freeAgentEventTeamIdsByUserId = mapOf("user-free-agent" to listOf("event-team-1")),
        )

    private fun user(
        id: String,
        firstName: String,
        lastName: String,
    ): UserData = UserData(
        firstName = firstName,
        lastName = lastName,
        teamIds = emptyList(),
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = "$firstName.$lastName".lowercase(),
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        profileImageId = null,
        privacyDisplayName = null,
        isMinor = false,
        isIdentityHidden = false,
        id = id,
    )
}
