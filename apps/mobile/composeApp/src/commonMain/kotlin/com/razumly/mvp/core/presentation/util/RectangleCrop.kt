package com.razumly.mvp.core.presentation.util

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection

class RectangleCrop(
    private val heightPercent: Float // from 0f to 1f
) : Shape {
    override fun createOutline(
        size: androidx.compose.ui.geometry.Size,
        layoutDirection: LayoutDirection,
        density: Density
    ): Outline {
        // Calculate the height of the crop
        val croppedHeight = size.height * heightPercent
        val rect = Rect(
            left = 0f,
            top = size.height - croppedHeight,
            right = size.width,
            bottom = size.height
        )
        return Outline.Rectangle(rect)
    }
}