package com.razumly.mvp.eventDetail.composables

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import kotlin.test.assertEquals
import kotlin.time.Instant
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class WeeklyScheduleViewUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun weekly_event_entries_are_rendered_in_schedule_view() {
        val occurrence = Event(
            id = "weekly-occurrence-1",
            name = "Tue 4/14/26, 9:00 AM-1:00 PM",
            hostId = "host-1",
            location = "CoEd Open",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2030-04-16T16:00:00Z"),
            end = Instant.parse("2030-04-16T20:00:00Z"),
        )

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    ScheduleView(
                        items = listOf(ScheduleItem.EventEntry(occurrence)),
                        fields = emptyList(),
                        showFab = {},
                        onMatchClick = {},
                        eventCardContent = { event, _, _, _ ->
                            Text(text = "schedule-${event.id}")
                        },
                    )
                }
            }
        }

        composeRule.onNodeWithText("1 event", substring = true).assertIsDisplayed()
        composeRule.onAllNodesWithText("No scheduled entries yet.").assertCountEquals(0)
    }

    @Test
    fun clicking_weekly_event_entry_calls_on_event_click() {
        val occurrence = Event(
            id = "weekly-occurrence-2",
            name = "Wed 4/15/26, 9:00 AM-1:00 PM",
            hostId = "host-1",
            location = "CoEd Open",
            coordinates = listOf(-80.0, 25.0),
            start = Instant.parse("2030-04-17T16:00:00Z"),
            end = Instant.parse("2030-04-17T20:00:00Z"),
        )
        var clickedId: String? = null

        composeRule.setContent {
            CompositionLocalProvider(LocalNavBarPadding provides PaddingValues()) {
                MaterialTheme {
                    ScheduleView(
                        items = listOf(ScheduleItem.EventEntry(occurrence)),
                        fields = emptyList(),
                        showFab = {},
                        onMatchClick = {},
                        onEventClick = { event -> clickedId = event.id },
                        eventCardContent = { event, _, _, onClick ->
                            Text(
                                text = "schedule-${event.id}",
                                modifier = androidx.compose.ui.Modifier.clickable(onClick = onClick),
                            )
                        },
                    )
                }
            }
        }

        repeat(3) {
            composeRule.onRoot().performTouchInput { swipeUp() }
        }
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule
                .onAllNodesWithText("schedule-weekly-occurrence-2")
                .fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("schedule-weekly-occurrence-2").performClick()

        assertEquals("weekly-occurrence-2", clickedId)
    }
}
