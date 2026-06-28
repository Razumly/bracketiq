package com.razumly.mvp.core.presentation.util

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.LocalPlatformTextFieldVisible
import kotlin.math.hypot
import kotlin.math.max

@Composable
fun CircularRevealUnderlay(
    isRevealed: Boolean,
    revealCenterInWindow: Offset,
    modifier: Modifier = Modifier,
    animationDurationMillis: Int = 700,
    backgroundContent: @Composable BoxScope.() -> Unit,
    foregroundContent: @Composable BoxScope.() -> Unit,
) {
    val backgroundContentState by rememberUpdatedState(backgroundContent)
    val foregroundContentState by rememberUpdatedState(foregroundContent)
    val revealProgress by animateFloatAsState(
        targetValue = if (isRevealed) 1f else 0f,
        animationSpec = tween(durationMillis = animationDurationMillis),
        label = "circularRevealUnderlayProgress",
    )
    val shouldShowBackground = isRevealed || revealProgress > 0.001f
    val shouldShowForeground = !isRevealed || revealProgress < 0.999f

    Box(modifier = modifier) {
        if (shouldShowBackground) {
            Box(modifier = Modifier.fillMaxSize(), content = backgroundContentState)
        }

        if (shouldShowForeground) {
            var foregroundTopLeft by remember { mutableStateOf(Offset.Zero) }
            var foregroundSize by remember { mutableStateOf(Size.Zero) }
            val density = LocalDensity.current
            val revealInsetPx = with(density) { 32.dp.toPx() }
            // Keep UIKit-backed controls hidden for the entire reveal animation window.
            // This prevents a one-frame flash when closing the map on iOS.
            val platformTextFieldVisible = !isRevealed && revealProgress <= 0.001f
            val localRevealCenter = remember(
                revealCenterInWindow,
                foregroundTopLeft,
                foregroundSize,
                revealInsetPx,
            ) {
                resolveRevealCenter(
                    revealCenterInWindow = revealCenterInWindow,
                    containerTopLeftInWindow = foregroundTopLeft,
                    containerSize = foregroundSize,
                    revealInsetPx = revealInsetPx,
                )
            }

            CompositionLocalProvider(
                LocalPlatformTextFieldVisible provides platformTextFieldVisible,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .onGloballyPositioned { coordinates ->
                            val bounds = coordinates.boundsInWindow()
                            foregroundTopLeft = bounds.topLeft
                            foregroundSize = bounds.size
                        }
                        .drawRevealHole(
                            progress = revealProgress,
                            revealCenter = localRevealCenter,
                        ),
                    content = foregroundContentState,
                )
            }
        }
    }
}

private fun Modifier.drawRevealHole(
    progress: Float,
    revealCenter: Offset,
): Modifier {
    if (progress <= 0f) {
        return this
    }

    return this
        .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
        .drawWithContent {
            drawContent()
            drawCircle(
                color = Color.Transparent,
                radius = maxRevealRadius(revealCenter = revealCenter, progress = progress),
                center = revealCenter,
                blendMode = BlendMode.Clear,
            )
        }
}

private fun DrawScope.maxRevealRadius(revealCenter: Offset, progress: Float): Float {
    return with(revealCenter) {
        max(
            hypot(x, y),
            max(
                hypot(size.width - x, y),
                max(
                    hypot(x, size.height - y),
                    hypot(size.width - x, size.height - y),
                ),
            ),
        ) * progress
    }
}

private fun resolveRevealCenter(
    revealCenterInWindow: Offset,
    containerTopLeftInWindow: Offset,
    containerSize: Size,
    revealInsetPx: Float,
): Offset {
    if (containerSize.width <= 0f || containerSize.height <= 0f) {
        return if (revealCenterInWindow == Offset.Zero) Offset.Zero else revealCenterInWindow
    }

    val rawLocalX = revealCenterInWindow.x - containerTopLeftInWindow.x
    val rawLocalY = revealCenterInWindow.y - containerTopLeftInWindow.y
    val revealPointOutsideContainer = rawLocalX < 0f ||
        rawLocalX > containerSize.width ||
        rawLocalY < 0f ||
        rawLocalY > containerSize.height

    if (revealCenterInWindow == Offset.Zero || revealPointOutsideContainer) {
        return Offset(containerSize.width / 2f, containerSize.height / 2f)
    }

    val safeInset = minOf(
        revealInsetPx,
        containerSize.width / 2f,
        containerSize.height / 2f,
    )
    return Offset(
        x = rawLocalX.coerceIn(safeInset, containerSize.width - safeInset),
        y = rawLocalY.coerceIn(safeInset, containerSize.height - safeInset),
    )
}
