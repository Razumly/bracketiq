package com.razumly.mvp.teamManagement

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.TeamInviteEventTeamOption
import com.razumly.mvp.core.data.repositories.TeamInviteFreeAgentContext
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
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
    fun free_agent_tab_sends_selected_user() {
        var invitedUserId: String? = null
        var invitedEmail: String? = "unset"

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
                    onInvite = { selectedUser, email ->
                        invitedUserId = selectedUser?.id
                        invitedEmail = email
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
    }

    @Test
    fun invite_by_email_tab_sends_email() {
        var invitedUserId: String? = "unset"
        var invitedEmail: String? = null

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
                    onInvite = { selectedUser, email ->
                        invitedUserId = selectedUser?.id
                        invitedEmail = email
                    },
                )
            }
        }

        composeRule.onNodeWithText("Invite by Email").performClick()
        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("new.player@example.com")
        composeRule.onNodeWithText("Send Player Invite").performClick()

        assertNull(invitedUserId)
        assertEquals("new.player@example.com", invitedEmail)
    }

    @Test
    fun full_player_capacity_disables_player_invite_submission() {
        var inviteSubmitted = false
        val capacityMessage = "This team already has 2 of 2 player slots filled."

        composeRule.setContent {
            MaterialTheme {
                TeamInviteDialog(
                    teamName = "Test team",
                    inviteTarget = TeamInviteTarget.PLAYER,
                    freeAgents = listOf(user("user-free-agent", "Jane", "Free")),
                    friends = emptyList(),
                    suggestions = emptyList(),
                    inviteFreeAgentContext = inviteContext(),
                    canInvitePlayer = false,
                    playerCapacityMessage = capacityMessage,
                    onSearch = {},
                    onDismiss = {},
                    onInvite = { _, _ -> inviteSubmitted = true },
                )
            }
        }

        composeRule.onNodeWithText(capacityMessage).assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Invite Jane Free").performClick()
        composeRule.onNodeWithText("Send Player Invite").assertIsNotEnabled()

        assertEquals(false, inviteSubmitted)
    }

    @Test
    fun existing_team_read_only_view_uses_team_name_title_inline_jersey_and_expandable_details() {
        val rosterPlayer = user("player_1", "Alex", "Setter")
        val currentUser = user("viewer_1", "Casey", "Viewer")
        val manager = user("manager_1", "Morgan", "Manager")
        val team = team("team_1", "Read Only Rockets").copy(
            division = "CoEd C 18+",
            playerIds = listOf(rosterPlayer.id),
            playerRegistrations = listOf(
                TeamPlayerRegistration(
                    id = "registration_1",
                    teamId = "team_1",
                    userId = rosterPlayer.id,
                    jerseyNumber = "24",
                )
            ),
        )

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    Box(
                        modifier = Modifier
                            .width(420.dp)
                            .height(900.dp)
                    ) {
                        CreateOrEditTeamScreen(
                            team = TeamWithPlayers(
                                team = team,
                                captain = null,
                                players = listOf(rosterPlayer),
                                pendingPlayers = emptyList(),
                            ),
                            sports = emptyList(),
                            friends = emptyList(),
                            freeAgents = emptyList(),
                            suggestions = emptyList(),
                            onSearch = {},
                            onFinish = {},
                            onLeaveTeam = {},
                            onDelete = {},
                            onDismiss = {},
                            deleteEnabled = false,
                            selectedEvent = null,
                            isCaptain = false,
                            currentUser = currentUser,
                            isNewTeam = false,
                            staffUsersById = mapOf(manager.id to manager),
                        )
                    }
                }
            }
        }

        composeRule.onNodeWithText("Read Only Rockets").assertIsDisplayed()
        composeRule.onAllNodesWithText("Edit Team").assertCountEquals(0)
        composeRule.onAllNodesWithText("Team Name").assertCountEquals(0)
        composeRule.onAllNodesWithText("Team Setup").assertCountEquals(0)
        composeRule.onAllNodesWithText("Team Size").assertCountEquals(0)
        composeRule.onAllNodesWithText("Coed").assertCountEquals(0)
        composeRule.onAllNodesWithText("CoEd C 18+").assertCountEquals(0)
        composeRule.onAllNodes(hasSetTextAction()).assertCountEquals(0)
        composeRule.onNodeWithText("Team Staff").assertIsDisplayed()
        composeRule.onNodeWithText("Morgan Manager").performScrollTo().assertIsDisplayed()
        composeRule.onAllNodesWithText("Manager: Morgan Manager").assertCountEquals(0)

        val playerBounds = composeRule.onNodeWithText("Alex Setter").getUnclippedBoundsInRoot()
        val jerseyBounds = composeRule.onNodeWithText("Jersey").getUnclippedBoundsInRoot()

        assertTrue(jerseyBounds.left > playerBounds.left)
        assertTrue(jerseyBounds.top < playerBounds.bottom && jerseyBounds.bottom > playerBounds.top)

        composeRule
            .onNodeWithContentDescription("Expand team details")
            .performScrollTo()
            .assertIsDisplayed()
            .performClick()
        composeRule.onNodeWithContentDescription("Collapse team details").assertIsDisplayed()
        composeRule.onNodeWithText("Team Size").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Sport").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Volleyball").performScrollTo().assertIsDisplayed()
        composeRule.onAllNodesWithText("Gender").assertCountEquals(0)
        composeRule.onAllNodesWithText("Skill Division").assertCountEquals(0)
        composeRule.onAllNodesWithText("Age Division").assertCountEquals(0)
        composeRule.onAllNodesWithText("Coed").assertCountEquals(0)
        composeRule.onAllNodesWithText("C").assertCountEquals(0)
        composeRule.onAllNodesWithText("18+").assertCountEquals(0)
        composeRule.onAllNodesWithText("CoEd C 18+").assertCountEquals(0)
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

    private fun team(id: String, name: String): Team = Team(
        division = "Open",
        name = name,
        captainId = "captain_1",
        managerId = "manager_1",
        playerIds = listOf("captain_1"),
        teamSize = 4,
        id = id,
        sport = "Volleyball",
    )
}
