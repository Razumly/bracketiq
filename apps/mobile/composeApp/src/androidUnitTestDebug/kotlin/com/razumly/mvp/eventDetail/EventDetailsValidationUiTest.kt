package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class EventDetailsValidationUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun entering_edit_reemits_validation_for_an_already_valid_event() {
        var lastReportedValid: Boolean? = null

        composeRule.setContent {
            var editView by remember { mutableStateOf(false) }
            var parentFormIsValid by remember { mutableStateOf(false) }

            MaterialTheme {
                EventDetailsValidationReporter(
                    editView = editView,
                    effectiveIsValid = true,
                    validationErrors = emptyList(),
                    onValidationChange = { isValid, _ ->
                        lastReportedValid = isValid
                        parentFormIsValid = isValid
                    },
                )
                EventEditSetupHeader(
                    isConfirmEnabled = editView && parentFormIsValid,
                    onConfirm = {},
                    onCancel = {},
                )
                Button(
                    onClick = {
                        lastReportedValid = null
                        parentFormIsValid = false
                        editView = true
                    },
                ) {
                    Text("Enter edit")
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000) { lastReportedValid == true }
        composeRule.onNodeWithText("Enter edit").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) { lastReportedValid == true }

        composeRule.onNodeWithText("Confirm").assertIsEnabled()
    }
}
