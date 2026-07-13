package com.razumly.mvp.eventSearch

import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertEquals

class DiscoverFilterHeightTest {
    @Test
    fun givenConstrainedViewport_whenResolvingFilterHeight_thenUsesAvailableHeight() {
        assertEquals(212.dp, resolveDiscoverFilterMaxHeight(212.dp))
    }

    @Test
    fun givenLargeViewport_whenResolvingFilterHeight_thenCapsAtDesignMaximum() {
        assertEquals(DISCOVER_FILTER_MAX_HEIGHT, resolveDiscoverFilterMaxHeight(900.dp))
    }

    @Test
    fun givenNoAvailableViewportSpace_whenResolvingFilterHeight_thenReturnsZero() {
        assertEquals(0.dp, resolveDiscoverFilterMaxHeight((-24).dp))
    }
}
