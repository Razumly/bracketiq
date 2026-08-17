package com.razumly.mvp.profile

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class EventTemplatesEmptyStateUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun empty_state_explains_template_creation_and_links_to_event_creation() {
        var createCalls = 0
        composeRule.setContent {
            MaterialTheme {
                EventTemplatesEmptyState(onCreateEvent = { createCalls += 1 })
            }
        }

        composeRule.onNodeWithText("No event templates yet").assertIsDisplayed()
        composeRule.onNodeWithText(
            "Templates are made from an existing personal event. Create or open an event, then choose Create Template from its actions.",
        ).assertIsDisplayed()
        composeRule.onNodeWithText("Create an event").performClick()

        assertEquals(1, createCalls)
    }
}
