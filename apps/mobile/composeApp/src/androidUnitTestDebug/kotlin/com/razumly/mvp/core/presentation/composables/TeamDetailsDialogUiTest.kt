package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(
    sdk = [35],
    application = Application::class,
    qualifiers = "w360dp-h640dp",
)
class TeamDetailsDialogUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun long_roster_keeps_membership_actions_visible_after_scrolling() {
        val currentUser = user(id = "viewer", firstName = "Casey", lastName = "Viewer")
        val roster = (1..40).map { number ->
            user(
                id = "player-$number",
                firstName = "Roster",
                lastName = "Member $number",
            )
        }
        var registerAttempts = 0
        var dismissAttempts = 0

        composeRule.setContent {
            var isDialogVisible by mutableStateOf(true)

            MaterialTheme {
                if (isDialogVisible) {
                    TeamDetailsDialog(
                        team = TeamWithPlayers(
                            team = Team(
                                division = "Open",
                                name = "Long roster team",
                                captainId = roster.first().id,
                                playerIds = roster.map(UserData::id),
                                teamSize = 64,
                                sport = "Volleyball",
                                openRegistration = true,
                                joinPolicy = "OPEN_REGISTRATION",
                                id = "long-roster-team",
                            ),
                            captain = roster.first(),
                            players = roster,
                            pendingPlayers = emptyList(),
                        ),
                        currentUser = currentUser,
                        onDismiss = {
                            dismissAttempts += 1
                            isDialogVisible = false
                        },
                        onPlayerMessage = {},
                        onRegisterForTeam = { registerAttempts += 1 },
                    )
                }
            }
        }

        composeRule.onNodeWithText("Join Team").assertIsDisplayed()
        composeRule.onNodeWithText("Close").assertIsDisplayed()

        composeRule
            .onNodeWithTag("team-details-roster")
            .performScrollToIndex(roster.lastIndex)

        composeRule.onNodeWithText("Roster Member 40").assertIsDisplayed()
        composeRule.onNodeWithText("Join Team").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Close").assertIsDisplayed().performClick()

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("Close").fetchSemanticsNodes().isEmpty()
        }

        assertEquals(1, registerAttempts)
        assertEquals(1, dismissAttempts)
        assertTrue(composeRule.onAllNodesWithText("Close").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun member_row_opens_actions_without_toggling_separate_compliance_strip() {
        val currentUser = user(id = "viewer", firstName = "Casey", lastName = "Viewer")
        val member = user(id = "member", firstName = "Jordan", lastName = "Player")

        composeRule.setContent {
            MaterialTheme {
                TeamDetailsDialog(
                    team = TeamWithPlayers(
                        team = Team(
                            division = "Open",
                            name = "River City Blue",
                            captainId = member.id,
                            playerIds = listOf(member.id),
                            teamSize = 6,
                            sport = "Volleyball",
                            id = "river-city-blue",
                        ),
                        captain = member,
                        players = listOf(member),
                        pendingPlayers = emptyList(),
                    ),
                    currentUser = currentUser,
                    memberCompliance = EventTeamComplianceSummary(
                        teamId = "river-city-blue",
                        teamName = "River City Blue",
                        users = listOf(
                            EventComplianceUserSummary(
                                userId = member.id,
                                fullName = member.fullName,
                            )
                        ),
                    ),
                    onDismiss = {},
                    onPlayerMessage = {},
                )
            }
        }

        composeRule.onNodeWithText("Details").assertIsDisplayed()
        composeRule.onNode(hasText("Jordan Player") and hasClickAction()).performClick()

        composeRule.onNodeWithText("Message").assertIsDisplayed()
        composeRule.onNodeWithText("Details").assertIsDisplayed()
        composeRule.onAllNodesWithText("Hide").assertCountEquals(0)

        composeRule.onNodeWithText("Details").performClick()

        composeRule.onNodeWithText("Hide").assertIsDisplayed()
        composeRule.onNodeWithText("No required documents for this user.").assertIsDisplayed()
        composeRule.onNodeWithText("Message").assertIsDisplayed()
    }

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
        userName = "$firstName.$lastName".lowercase().replace(" ", ""),
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        profileImageId = null,
        privacyDisplayName = null,
        isMinor = false,
        isIdentityHidden = false,
        id = id,
    )
}
