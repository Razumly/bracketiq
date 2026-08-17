package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class EventDetailInviteDialogUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun team_invite_selects_team_result() {
        var invitedTeamId: String? = null

        composeRule.setContent {
            MaterialTheme {
                EventTeamInviteDialog(
                    teams = listOf(team("team_1", "Shoreline Spikers")),
                    isLoading = false,
                    selectedDivisionId = null,
                    divisionOptions = emptyList(),
                    onSearch = {},
                    onDivisionSelected = {},
                    onTeamSelected = { team -> invitedTeamId = team.id },
                    onDismiss = {},
                )
            }
        }

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("shore")
        composeRule.onNodeWithText("Invite").performClick()

        assertEquals("team_1", invitedTeamId)
    }

    @Test
    fun player_search_invites_selected_existing_user() {
        var invitedUserId: String? = null

        composeRule.setContent {
            MaterialTheme {
                EventPlayerInviteDialog(
                    eventName = "Friday Open Play",
                    suggestions = listOf(user("user_1", "Jane", "Setter")),
                    existingParticipantIds = emptySet(),
                    onSearch = {},
                    onPlayerSelected = { user -> invitedUserId = user.id },
                    onInviteByEmail = { _, _, _ -> },
                    onDismiss = {},
                )
            }
        }

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("jan")
        composeRule.onNodeWithText("Invite").performClick()

        assertEquals("user_1", invitedUserId)
    }

    @Test
    fun player_email_invite_submits_name_and_email() {
        var invitedFirstName: String? = null
        var invitedLastName: String? = null
        var invitedEmail: String? = null

        composeRule.setContent {
            MaterialTheme {
                EventPlayerInviteDialog(
                    eventName = "Friday Open Play",
                    suggestions = emptyList(),
                    existingParticipantIds = emptySet(),
                    onSearch = {},
                    onPlayerSelected = {},
                    onInviteByEmail = { firstName, lastName, email ->
                        invitedFirstName = firstName
                        invitedLastName = lastName
                        invitedEmail = email
                    },
                    onDismiss = {},
                )
            }
        }

        composeRule.onNodeWithText("Email").performClick()
        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("Alex")
        composeRule.onAllNodes(hasSetTextAction())[1].performTextInput("Morgan")
        composeRule.onAllNodes(hasSetTextAction())[2].performTextInput("alex@example.com")
        composeRule.onNodeWithText("Send Invite").performClick()

        assertEquals("Alex", invitedFirstName)
        assertEquals("Morgan", invitedLastName)
        assertEquals("alex@example.com", invitedEmail)
    }

    @Test
    fun player_search_filters_existing_participants_from_suggestions() {
        var invitedUserId: String? = "unset"

        composeRule.setContent {
            MaterialTheme {
                EventPlayerInviteDialog(
                    eventName = "Friday Open Play",
                    suggestions = listOf(user("user_existing", "Pat", "Participant")),
                    existingParticipantIds = setOf("user_existing"),
                    onSearch = {},
                    onPlayerSelected = { user -> invitedUserId = user.id },
                    onInviteByEmail = { _, _, _ -> },
                    onDismiss = {},
                )
            }
        }

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("pat")
        composeRule.onNodeWithText("No players match your search.").assertIsDisplayed()

        assertEquals("unset", invitedUserId)
    }

    private fun user(id: String, firstName: String, lastName: String): UserData = UserData(
        firstName = firstName,
        lastName = lastName,
        teamIds = emptyList(),
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = "$firstName$lastName".lowercase(),
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
