package com.razumly.mvp.eventDetail.shared

import kotlin.test.Test
import kotlin.test.assertEquals

class EventSectionCardTest {

    @Test
    fun given_section_below_anchor_when_calculating_header_offset_then_header_stays_in_flow() {
        val offset = calculateStickyHeaderOffsetPx(
            sectionTopPx = 80,
            sectionHeightPx = 500,
            headerTopSpacingPx = 6,
            headerHeightPx = 64,
            stickyTopPx = 46,
        )

        assertEquals(0, offset)
    }

    @Test
    fun given_scrolled_section_with_room_when_calculating_header_offset_then_header_pins_to_anchor() {
        val offset = calculateStickyHeaderOffsetPx(
            sectionTopPx = -100,
            sectionHeightPx = 500,
            headerTopSpacingPx = 6,
            headerHeightPx = 64,
            stickyTopPx = 46,
        )

        assertEquals(140, offset)
    }

    @Test
    fun given_section_bottom_reaches_header_when_calculating_header_offset_then_header_stops_at_container_bottom() {
        val offset = calculateStickyHeaderOffsetPx(
            sectionTopPx = -430,
            sectionHeightPx = 500,
            headerTopSpacingPx = 6,
            headerHeightPx = 64,
            stickyTopPx = 46,
        )

        assertEquals(430, offset)
    }
}
