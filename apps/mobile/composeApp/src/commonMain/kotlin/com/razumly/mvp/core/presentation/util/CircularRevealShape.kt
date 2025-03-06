package com.razumly.mvp.core.presentation.util

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import kotlin.math.hypot
import kotlin.math.max

class CircularRevealShape(
    private val progress: Float,
    private val revealCenter: Offset
) : Shape {
    override fun createOutline(
        size: androidx.compose.ui.geometry.Size,
        layoutDirection: LayoutDirection,
        density: Density
    ): Outline {
        // Compute the maximum distance from revealCenter to the corners of the composable.
        val maxDistance = with(revealCenter) {
            max(
                hypot(x, y),
                max(
                    hypot(size.width - x, y),
                    max(
                        hypot(x, size.height - y),
                        hypot(size.width - x, size.height - y)
                    )
                )
            )
        }
        // Multiply maximum distance by the animated progress to get the current radius.
        val currentRadius = maxDistance * progress

        // Create a circular path centered on revealCenter.
        val path = Path().apply {
            addOval(
                Rect(revealCenter - Offset(currentRadius, currentRadius),
                    revealCenter + Offset(currentRadius, currentRadius)
                )
            )
        }
        return Outline.Generic(path)
    }
}