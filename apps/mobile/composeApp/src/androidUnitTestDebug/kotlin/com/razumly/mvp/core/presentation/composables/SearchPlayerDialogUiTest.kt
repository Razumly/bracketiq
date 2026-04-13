package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.razumly.mvp.core.data.dataTypes.UserData
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

        composeRule.onNodeWithText("Example User").assertIsDisplayed()
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
