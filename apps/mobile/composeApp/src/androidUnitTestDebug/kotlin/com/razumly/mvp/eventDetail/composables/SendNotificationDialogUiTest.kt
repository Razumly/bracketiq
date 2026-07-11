package com.razumly.mvp.eventDetail.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import kotlinx.coroutines.CompletableDeferred
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class SendNotificationDialogUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun dialog_stays_open_and_disables_dismissal_while_notification_is_sending() {
        val sendResult = CompletableDeferred<Result<Unit>>()
        var isVisible by mutableStateOf(true)
        var didSend by mutableStateOf(false)

        composeRule.setContent {
            MaterialTheme {
                if (isVisible) {
                    SendNotificationDialog(
                        onSend = { _, _ -> sendResult.await() },
                        onSent = {
                            didSend = true
                            isVisible = false
                        },
                        onDismiss = { isVisible = false },
                    )
                }
            }
        }

        enterMessageAndSubmit()

        composeRule.onNodeWithText("Sending notification...").assertIsDisplayed()
        composeRule.onNodeWithText("Cancel").assertIsNotEnabled()
        assertTrue(isVisible)
        assertFalse(didSend)

        composeRule.runOnIdle { sendResult.complete(Result.success(Unit)) }
        composeRule.waitUntil(timeoutMillis = 5_000) { !isVisible }

        assertTrue(didSend)
        composeRule.onAllNodesWithText("Send Notification").assertCountEquals(0)
    }

    @Test
    fun dialog_keeps_input_open_and_shows_error_when_send_fails() {
        var didSend by mutableStateOf(false)

        composeRule.setContent {
            MaterialTheme {
                SendNotificationDialog(
                    onSend = { _, _ -> Result.failure(IllegalStateException("No connection")) },
                    onSent = { didSend = true },
                    onDismiss = {},
                )
            }
        }

        enterMessageAndSubmit()

        composeRule.onNodeWithText("No connection").assertIsDisplayed()
        composeRule.onAllNodesWithText("Send Notification").assertCountEquals(2)
        assertFalse(didSend)
    }

    private fun enterMessageAndSubmit() {
        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput("Schedule update")
        composeRule.onAllNodes(hasSetTextAction())[1].performTextInput("Court changed.")
        composeRule.onAllNodesWithText("Send Notification")[1].performClick()
    }
}
