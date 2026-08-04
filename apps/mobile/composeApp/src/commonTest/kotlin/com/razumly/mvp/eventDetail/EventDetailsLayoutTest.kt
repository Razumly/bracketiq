package com.razumly.mvp.eventDetail

import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertEquals

class EventDetailsLayoutTest {

    @Test
    fun nested_create_screen_does_not_duplicate_the_status_bar_inset() {
        assertEquals(
            0.dp,
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
            30.dp,
            resolveEventDetailsStickyHeaderTopInset(
                topInset = 0.dp,
                statusBarInset = 30.dp,
                includeStatusBarInset = true,
            ),
        )
    }

    @Test
    fun backdrop_keeps_round_corners_while_it_overlaps_the_hero() {
        assertEquals(
            24.dp,
            resolveEventDetailsBackdropCornerSize(
                contentBackdropOffsetPx = 120f,
                roundedCornerSize = 24.dp,
            ),
        )
    }

    @Test
    fun backdrop_uses_square_corners_at_the_header_boundary() {
        assertEquals(
            0.dp,
            resolveEventDetailsBackdropCornerSize(
                contentBackdropOffsetPx = 0f,
                roundedCornerSize = 24.dp,
            ),
        )
    }
}
