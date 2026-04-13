package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.razumly.mvp.core.data.dataTypes.UserData
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class SearchPlayerDialogUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun entering_search_text_shows_suggested_players() {
        composeRule.setContent {
            MaterialTheme {
                SearchPlayerDialog(
                    freeAgents = emptyList(),
                    friends = emptyList(),
                    onSearch = {},
                    onPlayerSelected = {},
                    onDismiss = {},
                    suggestions = listOf(
                        user(
                            id = "user_1",
                            firstName = "Example",
                            lastName = "User",
                            userName = "exampleuser",
                        )
                    ),
                    eventName = "",
                )
            }
        }

        composeRule.onNode(hasSetTextAction()).performClick()
        composeRule.onNode(hasSetTextAction()).performTextInput("exa")

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("Example User").fetchSemanticsNodes().isNotEmpty()
        }

        assertTrue(
            composeRule.onAllNodesWithText("Example User").fetchSemanticsNodes().isNotEmpty()
        )
    }

    @Test
    fun close_button_dismisses_dialog() {
        composeRule.setContent {
            var isDialogVisible by mutableStateOf(true)

            MaterialTheme {
                if (isDialogVisible) {
                    SearchPlayerDialog(
                        freeAgents = emptyList(),
                        friends = emptyList(),
                        onSearch = {},
                        onPlayerSelected = {},
                        onDismiss = { isDialogVisible = false },
                        suggestions = emptyList(),
                        eventName = "",
                    )
                }
            }
        }

        composeRule.onNodeWithContentDescription("Close search dialog").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("Add User").fetchSemanticsNodes().isEmpty()
        }

        assertTrue(
            composeRule.onAllNodesWithText("Add User").fetchSemanticsNodes().isEmpty()
        )
    }

    private fun user(
        id: String,
        firstName: String,
        lastName: String,
        userName: String,
    ): UserData = UserData(
        firstName = firstName,
        lastName = lastName,
        teamIds = emptyList(),
        friendIds = emptyList(),
        friendRequestIds = emptyList(),
        friendRequestSentIds = emptyList(),
        followingIds = emptyList(),
        userName = userName,
        hasStripeAccount = false,
        uploadedImages = emptyList(),
        profileImageId = null,
        privacyDisplayName = null,
        isMinor = false,
        isIdentityHidden = false,
        id = id,
    )
}
