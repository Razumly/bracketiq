package com.razumly.mvp.core.presentation.guides

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.unit.IntSize
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GuideHostPlacementTest {

    @Test
    fun measured_card_height_is_used_when_placing_card_above_target() {
        val rootSize = IntSize(width = 360, height = 600)
        val cardSize = IntSize(width = 300, height = 300)

        val offset = calculateGuideCardOffset(
            targetBounds = Rect(left = 24f, top = 520f, right = 336f, bottom = 560f),
            rootSize = rootSize,
            cardSize = cardSize,
            marginPx = 16f,
            minCardTopPx = 32f,
            targetGapPx = 12f,
            fallbackCardWidthPx = 328f,
        )

        assertEquals(208, offset.y)
        assertTrue(offset.y + cardSize.height <= rootSize.height - 16)
    }

    @Test
    fun tall_measured_card_is_clamped_inside_safe_vertical_bounds() {
        val rootSize = IntSize(width = 360, height = 600)
        val cardSize = IntSize(width = 328, height = 540)

        val offset = calculateGuideCardOffset(
            targetBounds = Rect(left = 16f, top = 30f, right = 344f, bottom = 60f),
            rootSize = rootSize,
            cardSize = cardSize,
            marginPx = 16f,
            minCardTopPx = 32f,
            targetGapPx = 12f,
            fallbackCardWidthPx = 328f,
        )

        assertEquals(32, offset.y)
        assertTrue(offset.y + cardSize.height <= rootSize.height - 16)
    }
}
