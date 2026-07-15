package com.razumly.mvp.eventDetail

import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertEquals

class EventDetailsLayoutTest {

    @Test
    fun nested_create_screen_does_not_duplicate_the_status_bar_inset() {
        assertEquals(
            6.dp,
            resolveEventDetailsStickyHeaderTopInset(
                topInset = 0.dp,
                statusBarInset = 30.dp,
                includeStatusBarInset = false,
            ),
        )
    }

    @Test
    fun standalone_event_details_preserves_the_status_bar_inset() {
        assertEquals(
            36.dp,
            resolveEventDetailsStickyHeaderTopInset(
                topInset = 0.dp,
                statusBarInset = 30.dp,
                includeStatusBarInset = true,
            ),
        )
    }
}
