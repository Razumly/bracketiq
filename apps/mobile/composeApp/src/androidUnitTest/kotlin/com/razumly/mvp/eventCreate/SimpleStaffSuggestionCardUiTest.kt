package com.razumly.mvp.eventCreate

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class SimpleStaffSuggestionCardUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun matching_person_renders_with_direct_staff_role_actions() {
        var assistantSelected = false
        var officialSelected = false
        val user = UserData().copy(
            id = "staff-1",
            firstName = "Phillip",
            lastName = "Ignatovitch",
            userName = "phillip_i",
        )

        composeRule.setContent {
            MaterialTheme {
                SimpleStaffSuggestionCard(
                    user = user,
                    allowAssistantHost = true,
                    assistantHostSelected = false,
                    onAssistantHostChange = { assistantSelected = it },
                    allowOfficial = true,
                    officialSelected = false,
                    onOfficialChange = { officialSelected = it },
                )
            }
        }

        composeRule.onNodeWithText("Phillip Ignatovitch").assertIsDisplayed()
        composeRule.onNodeWithText("@phillip_i").assertIsDisplayed()
        composeRule.onNodeWithText("Assistant host").performClick()
        composeRule.onNodeWithText("Official").performClick()

        composeRule.runOnIdle {
            assertTrue(assistantSelected)
            assertTrue(officialSelected)
        }
    }
}
