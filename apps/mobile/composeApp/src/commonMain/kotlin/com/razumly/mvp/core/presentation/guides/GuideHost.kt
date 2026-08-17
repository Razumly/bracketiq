package com.razumly.mvp.core.presentation.guides

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

private val GUIDE_TARGET_CORNER_RADIUS = 12.dp
private val GUIDE_TARGET_PADDING = 8.dp
private val GUIDE_CARD_MARGIN = 16.dp
private val GUIDE_CARD_MAX_WIDTH = 340.dp
private val GUIDE_CARD_TARGET_GAP = 12.dp

@Composable
fun GuideHost(
    controller: GuideController,
    modifier: Modifier = Modifier,
) {
    val activeGuide = controller.activeGuide ?: return
    val activeStep = controller.activeStep ?: return
    val activeTarget = controller.activeTarget

    LaunchedEffect(activeGuide.id, activeStep.id, activeTarget) {
        if (activeTarget == null) {
            controller.cancel()
        }
    }

    if (activeTarget == null) return

    var rootBoundsInWindow by remember { mutableStateOf(Rect.Zero) }
    var rootSize by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current

    Box(
        modifier = modifier
            .fillMaxSize()
            .onGloballyPositioned { coordinates ->
                rootBoundsInWindow = coordinates.boundsInWindow()
                rootSize = coordinates.size
            },
    ) {
        if (rootSize.width <= 0 || rootSize.height <= 0) return@Box

        val targetBounds = activeTarget.bounds.translate(
            translateX = -rootBoundsInWindow.left,
            translateY = -rootBoundsInWindow.top,
        )
        val paddedTarget = with(density) {
            targetBounds.inflate(GUIDE_TARGET_PADDING.toPx()).clampTo(rootSize)
        }

        GuideScrim(
            targetBounds = paddedTarget,
            highlightShape = activeTarget.highlightShape,
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                )
        )

        val borderShape = guideBorderShape(activeTarget.highlightShape)
        Box(
            modifier = with(density) {
                Modifier
                    .offsetToRect(paddedTarget)
                    .size(
                        width = paddedTarget.width.toDp(),
                        height = paddedTarget.height.toDp(),
                    )
                    .border(
                        width = 2.dp,
                        color = MaterialTheme.colorScheme.primary,
                        shape = borderShape,
                    )
            }
        )

        GuideCard(
            step = activeStep,
            stepIndex = controller.activeStepIndex,
            stepCount = activeGuide.steps.size,
            targetBounds = paddedTarget,
            rootSize = rootSize,
            onPrevious = controller::previous,
            onNext = controller::next,
            onDismiss = controller::dismiss,
        )
    }
}

@Composable
private fun GuideScrim(
    targetBounds: Rect,
    highlightShape: GuideHighlightShape,
) {
    val scrimColor = Color.Black.copy(alpha = 0.58f)
    val density = LocalDensity.current
    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen),
    ) {
        drawRect(color = scrimColor)

        when (highlightShape) {
            GuideHighlightShape.Circle -> {
                drawOval(
                    color = Color.Transparent,
                    topLeft = Offset(targetBounds.left, targetBounds.top),
                    size = Size(targetBounds.width, targetBounds.height),
                    blendMode = BlendMode.Clear,
                )
            }

            is GuideHighlightShape.RoundedRect -> {
                val cornerRadius = with(density) { highlightShape.cornerRadius.toPx() }
                drawRoundRect(
                    color = Color.Transparent,
                    topLeft = Offset(targetBounds.left, targetBounds.top),
                    size = Size(targetBounds.width, targetBounds.height),
                    cornerRadius = CornerRadius(cornerRadius, cornerRadius),
                    blendMode = BlendMode.Clear,
                )
            }
        }
    }
}

@Composable
private fun GuideCard(
    step: AppGuideStep,
    stepIndex: Int,
    stepCount: Int,
    targetBounds: Rect,
    rootSize: IntSize,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onDismiss: () -> Unit,
) {
    val density = LocalDensity.current
    val statusBarTopPx = WindowInsets.statusBars.getTop(density).toFloat()
    var cardSize by remember(step.id) { mutableStateOf(IntSize.Zero) }
    val bodyScrollState = rememberScrollState()
    LaunchedEffect(step.id) {
        bodyScrollState.scrollTo(0)
    }
    val cardMaxWidth = with(density) {
        minOf(
            GUIDE_CARD_MAX_WIDTH.toPx(),
            (rootSize.width - (GUIDE_CARD_MARGIN.toPx() * 2)).coerceAtLeast(0f),
        ).toDp()
    }
    val cardMaxHeight = with(density) {
        val marginPx = GUIDE_CARD_MARGIN.toPx()
        (rootSize.height - statusBarTopPx - (marginPx * 2))
            .coerceAtLeast(0f)
            .toDp()
    }
    val cardOffset = remember(step.id, targetBounds, rootSize, cardSize, density, statusBarTopPx) {
        with(density) {
            val marginPx = GUIDE_CARD_MARGIN.toPx()
            val minCardTopPx = statusBarTopPx + marginPx
            val maxCardWidthPx = GUIDE_CARD_MAX_WIDTH.toPx()
            val fallbackCardWidthPx = minOf(
                maxCardWidthPx,
                rootSize.width - (marginPx * 2),
            ).coerceAtLeast(0f)
            calculateGuideCardOffset(
                targetBounds = targetBounds,
                rootSize = rootSize,
                cardSize = cardSize,
                marginPx = marginPx,
                minCardTopPx = minCardTopPx,
                targetGapPx = GUIDE_CARD_TARGET_GAP.toPx(),
                fallbackCardWidthPx = fallbackCardWidthPx,
            )
        }
    }

    Card(
        modifier = Modifier
            .offset { cardOffset }
            .widthIn(max = cardMaxWidth)
            .heightIn(max = cardMaxHeight)
            .onSizeChanged { measuredSize -> cardSize = measuredSize }
            .graphicsLayer {
                alpha = if (cardSize == IntSize.Zero) 0f else 1f
            },
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = step.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${stepIndex + 1}/$stepCount",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
            Text(
                text = step.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .weight(1f, fill = false)
                    .verticalScroll(bodyScrollState),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) {
                    Text(if (stepIndex == stepCount - 1) "Done" else "Skip")
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = onPrevious,
                        enabled = stepIndex > 0,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                            contentDescription = "Previous guide step",
                        )
                    }
                    IconButton(
                        onClick = onNext,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = if (stepIndex == stepCount - 1) {
                                "Finish guide"
                            } else {
                                "Next guide step"
                            },
                        )
                    }
                }
            }
        }
    }
}

internal fun calculateGuideCardOffset(
    targetBounds: Rect,
    rootSize: IntSize,
    cardSize: IntSize,
    marginPx: Float,
    minCardTopPx: Float,
    targetGapPx: Float,
    fallbackCardWidthPx: Float,
): IntOffset {
    val cardWidthPx = cardSize.width
        .takeIf { it > 0 }
        ?.toFloat()
        ?: fallbackCardWidthPx
    val cardHeightPx = cardSize.height.coerceAtLeast(0).toFloat()
    val maxCardTopPx = (rootSize.height - cardHeightPx - marginPx)
        .coerceAtLeast(minCardTopPx)
    val preferredYBelow = targetBounds.bottom + targetGapPx
    val preferredYAbove = targetBounds.top - cardHeightPx - targetGapPx
    val y = if (preferredYBelow + cardHeightPx <= rootSize.height - marginPx) {
        preferredYBelow
    } else {
        preferredYAbove
    }.coerceIn(minCardTopPx, maxCardTopPx)
    val maxCardLeftPx = (rootSize.width - cardWidthPx - marginPx)
        .coerceAtLeast(marginPx)
    val x = targetBounds.left.coerceIn(marginPx, maxCardLeftPx)

    return IntOffset(x.roundToInt(), y.roundToInt())
}

private fun Rect.inflate(amount: Float): Rect =
    Rect(
        left = left - amount,
        top = top - amount,
        right = right + amount,
        bottom = bottom + amount,
    )

private fun Rect.clampTo(size: IntSize): Rect =
    Rect(
        left = left.coerceIn(0f, size.width.toFloat()),
        top = top.coerceIn(0f, size.height.toFloat()),
        right = right.coerceIn(0f, size.width.toFloat()),
        bottom = bottom.coerceIn(0f, size.height.toFloat()),
    )

private fun guideBorderShape(highlightShape: GuideHighlightShape): Shape =
    when (highlightShape) {
        GuideHighlightShape.Circle -> CircleShape
        is GuideHighlightShape.RoundedRect -> RoundedCornerShape(highlightShape.cornerRadius)
    }

private fun Modifier.offsetToRect(rect: Rect): Modifier =
    this.then(
        Modifier.offset {
            IntOffset(rect.left.roundToInt(), rect.top.roundToInt())
        }
    )
