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
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class CreateTeamValidationUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun untouched_create_team_hides_errors_then_interaction_and_submit_reveal_them_without_saving() {
        var finishCount = 0

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    Box(
                        modifier = Modifier
                            .width(420.dp)
                            .height(900.dp),
                    ) {
                        CreateOrEditTeamScreen(
                            team = TeamWithPlayers(
                                team = Team(
                                    division = "",
                                    name = "",
                                    captainId = "captain",
                                    managerId = "captain",
                                    teamSize = 0,
                                    id = "new-team",
                                ),
                                captain = null,
                                players = emptyList(),
                                pendingPlayers = emptyList(),
                            ),
                            sports = emptyList(),
                            friends = emptyList(),
                            freeAgents = emptyList(),
                            suggestions = emptyList(),
                            onSearch = {},
                            onFinish = { finishCount += 1 },
                            onDelete = {},
                            onDismiss = {},
                            deleteEnabled = false,
                            selectedEvent = null,
                            isCaptain = true,
                            currentUser = UserData(),
                            isNewTeam = true,
                        )
                    }
                }
            }
        }

        composeRule.onAllNodesWithText("Team name is required.").assertCountEquals(0)
        composeRule.onAllNodesWithText("Enter a team size greater than 0.").assertCountEquals(0)

        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput(" ")
        composeRule.onNodeWithText("Team name is required.").assertIsDisplayed()
        composeRule.onAllNodesWithText("Enter a team size greater than 0.").assertCountEquals(0)

        composeRule.onNodeWithText("Create").performScrollTo().performClick()
        composeRule
            .onNodeWithText("Enter a team size greater than 0.")
            .performScrollTo()
            .assertIsDisplayed()
        assertEquals(0, finishCount)
    }
}
