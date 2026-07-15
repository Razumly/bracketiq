package com.razumly.mvp.chat

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ChatFeedbackBannerUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun warning_feedback_is_visible_and_dismissible() {
        val message = "Message sent, but recipients may not receive a notification."

        composeRule.setContent {
            var feedback by remember {
                mutableStateOf<ChatFeedback?>(
                    ChatFeedback(message = message, kind = ChatFeedbackKind.WARNING),
                )
            }
            MaterialTheme {
                ChatFeedbackBanner(
                    feedback = feedback,
                    onDismiss = { feedback = null },
                )
            }
        }

        composeRule.onNodeWithText(message).assertIsDisplayed()
        composeRule.onNodeWithText("Dismiss").performClick()
        composeRule.onAllNodesWithText(message).assertCountEquals(0)
    }
}
