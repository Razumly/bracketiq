package com.razumly.mvp.teamManagement

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
class TeamManagementErrorFeedbackUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun visible_component_error_can_be_dismissed() {
        val message = "Could not delete this team. Please try again."

        composeRule.setContent {
            var errorMessage by remember { mutableStateOf<String?>(message) }
            MaterialTheme {
                TeamManagementErrorFeedback(
                    errorMessage = errorMessage,
                    onDismiss = { errorMessage = null },
                )
            }
        }

        composeRule.onNodeWithText(message).assertIsDisplayed()
        composeRule.onNodeWithText("Dismiss").performClick()
        composeRule.onAllNodesWithText(message).assertCountEquals(0)
    }
}
