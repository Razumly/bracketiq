package com.razumly.mvp.eventDetail.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import kotlinx.coroutines.CompletableDeferred
import kotlin.test.Test
import kotlin.test.assertEquals
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
        var sentPayload: NotificationPayload? = null

        composeRule.setContent {
            MaterialTheme {
                if (isVisible) {
                    SendNotificationDialog(
                        onSend = { title, message ->
                            sentPayload = NotificationPayload(title, message)
                            sendResult.await()
                        },
                        onSent = {
                            didSend = true
                            isVisible = false
                        },
                        onDismiss = { isVisible = false },
                    )
                }
            }
        }

        enterMessageAndSubmit(
            title = "  Schedule update  ",
            message = "  Court changed.  ",
        )

        composeRule.onNodeWithText("Sending notification...").assertIsDisplayed()
        composeRule.onNodeWithText("Cancel").assertIsNotEnabled()
        assertEquals(NotificationPayload("Schedule update", "Court changed."), sentPayload)
        assertTrue(isVisible)
        assertFalse(didSend)

        composeRule.runOnIdle { sendResult.complete(Result.success(Unit)) }
        composeRule.waitUntil(timeoutMillis = 5_000) { !isVisible }

        assertTrue(didSend)
        composeRule.onAllNodesWithText("Send Notification").assertCountEquals(0)
    }

    @Test
    fun dialog_keeps_input_open_and_shows_error_when_send_fails() {
        var isVisible by mutableStateOf(true)
        var didSend by mutableStateOf(false)
        var didDismiss by mutableStateOf(false)

        composeRule.setContent {
            MaterialTheme {
                if (isVisible) {
                    SendNotificationDialog(
                        onSend = { _, _ -> Result.failure(IllegalStateException("No connection")) },
                        onSent = {
                            didSend = true
                            isVisible = false
                        },
                        onDismiss = {
                            didDismiss = true
                            isVisible = false
                        },
                    )
                }
            }
        }

        enterMessageAndSubmit(
            title = "Schedule update",
            message = "Court changed.",
        )

        composeRule.onNodeWithText("No connection").assertIsDisplayed()
        composeRule.onAllNodesWithText("Send Notification").assertCountEquals(2)
        composeRule.onAllNodes(hasSetTextAction())[0].assertTextContains("Schedule update")
        composeRule.onAllNodes(hasSetTextAction())[1].assertTextContains("Court changed.")
        assertTrue(isVisible)
        assertFalse(didSend)
        assertFalse(didDismiss)
    }

    private fun enterMessageAndSubmit(
        title: String = "Schedule update",
        message: String = "Court changed.",
    ) {
        composeRule.onAllNodes(hasSetTextAction())[0].performTextInput(title)
        composeRule.onAllNodes(hasSetTextAction())[1].performTextInput(message)
        composeRule.onAllNodesWithText("Send Notification")[1].performClick()
    }

    private data class NotificationPayload(
        val title: String,
        val message: String,
    )
}
