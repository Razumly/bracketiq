package com.razumly.mvp.chat

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ChatAvailabilityScreenUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun loading_chat_does_not_render_interactive_chat_controls() {
        composeRule.setContent {
            MaterialTheme {
                ChatAvailabilityScreen(
                    isLoading = true,
                    errorMessage = null,
                    onBack = {},
                )
            }
        }

        composeRule.onNodeWithText("Loading chat…").assertIsDisplayed()
        composeRule.onAllNodesWithText("Send").assertCountEquals(0)
        composeRule.onAllNodesWithText("Go back").assertCountEquals(0)
    }

    @Test
    fun unavailable_chat_exposes_the_error_and_a_back_action() {
        var backCalls = 0
        composeRule.setContent {
            MaterialTheme {
                ChatAvailabilityScreen(
                    isLoading = false,
                    errorMessage = "Unable to load chat.",
                    onBack = { backCalls += 1 },
                )
            }
        }

        composeRule.onNodeWithText("This chat is unavailable.").assertIsDisplayed()
        composeRule.onNodeWithText("Unable to load chat.").assertIsDisplayed()
        composeRule.onNodeWithText("Go back").performClick()

        assertEquals(1, backCalls)
    }
}
