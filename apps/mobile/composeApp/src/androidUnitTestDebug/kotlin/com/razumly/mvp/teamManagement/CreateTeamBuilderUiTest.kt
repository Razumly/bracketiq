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
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class CreateTeamBuilderUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @OptIn(ExperimentalTime::class)
    @Test
    fun step_two_removes_free_agents_while_step_three_keeps_them_read_only() {
        val captain = user("captain", "Casey", "Captain")
        val freeAgent = user("free-agent", "Frankie", "Free")
        val accountInvite = user("account-invite", "Indy", "Invite")

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    Box(Modifier.width(420.dp).height(900.dp)) {
                        CreateTeamBuilderScreen(
                            draft = TeamWithPlayers(
                                team = Team(
                                    division = "Open",
                                    name = "",
                                    captainId = captain.id,
                                    managerId = captain.id,
                                    playerIds = listOf(captain.id),
                                    teamSize = 4,
                                    sport = "Volleyball",
                                    id = "draft-team",
                                ),
                                captain = captain,
                                players = listOf(captain),
                                pendingPlayers = emptyList(),
                            ),
                            sports = emptyList(),
                            freeAgents = listOf(freeAgent),
                            suggestions = listOf(accountInvite),
                            onSearch = {},
                            onFinish = { _, _, _ -> },
                            onDismiss = {},
                            currentUser = captain,
                            selectedEvent = Event(
                                id = "event-1",
                                name = "Summer Open",
                                start = Instant.parse("2099-07-20T18:00:00Z"),
                                teamSizeLimit = 4,
                            ),
                        )
                    }
                }
            }
        }

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("Cascade Crew")
        composeRule.onNodeWithText("Continue").performClick()

        composeRule.onNodeWithText("Add").performClick()
        composeRule.onNodeWithText("Remove").assertIsDisplayed()
        composeRule.onNodeWithText("Continue").performClick()

        composeRule.onNodeWithText("Set team leadership").assertIsDisplayed()
        composeRule.onNodeWithText("Continue").performClick()

        composeRule.onAllNodesWithText("Remove").assertCountEquals(0)
        composeRule.onNodeWithText("New person").performClick()
        composeRule.onNodeWithTag("team-builder-person-first").performTextReplacement("Indy")
        composeRule.onNodeWithTag("team-builder-person-first").assertTextContains("Indy")
        composeRule.onNodeWithTag("team-builder-person-last").performTextReplacement("Invite")
        composeRule.onNodeWithTag("team-builder-person-last").assertTextContains("Invite")
        composeRule.onNodeWithText("Save invite").performScrollTo().assertIsDisplayed().performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithText("Roster").performScrollTo()
        composeRule.onNodeWithText("Indy Invite").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Edit").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Remove Indy Invite").assertIsDisplayed()
        composeRule.onAllNodesWithText("Frankie Free").assertCountEquals(1)
    }

    @Test
    fun skips_free_agents_when_there_is_no_upcoming_event() {
        val creator = user("creator", "Morgan", "Maker")
        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    Box(Modifier.width(420.dp).height(900.dp)) {
                        CreateTeamBuilderScreen(
                            draft = TeamWithPlayers(
                                team = Team(
                                    division = "Open",
                                    name = "",
                                    captainId = creator.id,
                                    managerId = creator.id,
                                    playerIds = listOf(creator.id),
                                    teamSize = 4,
                                    sport = "Volleyball",
                                    id = "draft-no-event",
                                ),
                                captain = creator,
                                players = listOf(creator),
                                pendingPlayers = emptyList(),
                            ),
                            sports = emptyList(),
                            freeAgents = listOf(user("free-agent-2", "Free", "Agent")),
                            suggestions = emptyList(),
                            onSearch = {},
                            onFinish = { _, _, _ -> },
                            onDismiss = {},
                            currentUser = creator,
                            selectedEvent = null,
                        )
                    }
                }
            }
        }

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("Metro Five")
        composeRule.onNodeWithText("Continue").performClick()

        composeRule.onNodeWithText("STEP 2 OF 4").assertIsDisplayed()
        composeRule.onNodeWithText("Set team leadership").assertIsDisplayed()
        composeRule.onAllNodesWithText("Invite free agents from this event").assertCountEquals(0)
    }

    @Test
    @Config(sdk = [35], application = Application::class, qualifiers = "w420dp-h1800dp")
    fun searches_accounts_for_staff_and_players() {
        val creator = user("creator-search", "Morgan", "Maker")
        val searchable = user("searchable", "Avery", "Morgan")
        var completedTeam: Team? = null
        var completedStaff = emptyList<TeamBuilderStaffInvite>()
        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    Box(Modifier.width(420.dp).height(1700.dp)) {
                        CreateTeamBuilderScreen(
                            draft = TeamWithPlayers(
                                team = Team(
                                    division = "Open",
                                    name = "",
                                    captainId = creator.id,
                                    managerId = creator.id,
                                    playerIds = listOf(creator.id),
                                    teamSize = 4,
                                    sport = "Volleyball",
                                    id = "draft-search",
                                ),
                                captain = creator,
                                players = listOf(creator),
                                pendingPlayers = emptyList(),
                            ),
                            sports = emptyList(),
                            freeAgents = emptyList(),
                            suggestions = listOf(searchable),
                            onSearch = {},
                            onFinish = { team, _, staff ->
                                completedTeam = team
                                completedStaff = staff
                            },
                            onDismiss = {},
                            currentUser = creator,
                            selectedEvent = null,
                        )
                    }
                }
            }
        }

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("Harbor Strikers")
        composeRule.onNodeWithText("Continue").performClick()

        composeRule.onNodeWithTag("team-builder-staff-search").performTextReplacement("Avery")
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("team-builder-staff-add-${searchable.id}").assertIsDisplayed().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("team-builder-staff-list-1").assertExists()
        composeRule.onNodeWithText("Continue").performClick()

        composeRule.onNodeWithTag("team-builder-player-search").performTextReplacement("Avery")
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("team-builder-player-add-${searchable.id}").performScrollTo().performClick()
        composeRule.onNodeWithText("Review team").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Create team").performClick()
        composeRule.waitForIdle()

        assertTrue(completedTeam != null)
        assertEquals(searchable.id, completedStaff.single().user?.id)
        assertTrue(completedTeam?.pending?.contains(searchable.id) == true)
    }

    @Test
    fun creates_editable_staff_invite_with_optional_contact_fields() {
        val creator = user("creator-staff", "Jordan", "Lee")
        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    Box(Modifier.width(420.dp).height(900.dp)) {
                        CreateTeamBuilderScreen(
                            draft = TeamWithPlayers(
                                team = Team(
                                    division = "Open",
                                    name = "",
                                    captainId = creator.id,
                                    managerId = creator.id,
                                    playerIds = listOf(creator.id),
                                    teamSize = 4,
                                    sport = "Volleyball",
                                    id = "draft-staff",
                                ),
                                captain = creator,
                                players = listOf(creator),
                                pendingPlayers = emptyList(),
                            ),
                            sports = emptyList(),
                            freeAgents = emptyList(),
                            suggestions = emptyList(),
                            onSearch = {},
                            onFinish = { _, _, _ -> },
                            onDismiss = {},
                            currentUser = creator,
                            selectedEvent = null,
                        )
                    }
                }
            }
        }

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("Riverside FC")
        composeRule.onNodeWithText("Continue").performClick()
        composeRule.onNode(hasText("New staff member") and hasClickAction()).performScrollTo().performClick()
        composeRule.onNodeWithTag("team-builder-staff-first").performTextReplacement("Taylor")
        composeRule.onNodeWithTag("team-builder-staff-last").performTextReplacement("Stone")
        composeRule.onNodeWithTag("team-builder-staff-phone").performTextReplacement("5035550142")
        composeRule.onNodeWithText("Save invite").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag("team-builder-staff-email").performTextReplacement("taylor@sample.invalid")
        composeRule.onNodeWithText("Send email invite").performScrollTo().assertIsDisplayed().performClick()

        composeRule.onNodeWithText("Taylor Stone").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Edit").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Remove Taylor Stone").assertIsDisplayed()
    }

    private fun user(id: String, firstName: String, lastName: String): UserData = UserData(
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
        id = id,
    )
}
