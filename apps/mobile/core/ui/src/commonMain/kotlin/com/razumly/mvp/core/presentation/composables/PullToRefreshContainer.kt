package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.Alignment
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.movableContentOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PullToRefreshContainer(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shiftContentWithPull: Boolean = false,
    contentPullMaxDistance: Dp = PullToRefreshDefaults.IndicatorMaxDistance,
    indicatorTopPadding: Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    var userInitiatedRefresh by rememberSaveable { mutableStateOf(false) }
    val pullToRefreshState = rememberPullToRefreshState()
    val density = LocalDensity.current
    val coroutineScope = rememberCoroutineScope()
    val refreshThresholdPx = with(density) { PullToRefreshDefaults.PositionalThreshold.toPx() }
    val contentPullMaxDistancePx = with(density) { contentPullMaxDistance.toPx() }
    val contentPullOffsetPx by remember(
        shiftContentWithPull,
        pullToRefreshState,
        contentPullMaxDistancePx,
    ) {
        derivedStateOf {
            if (!shiftContentWithPull) {
                0f
            } else {
                pullToRefreshState.distanceFraction.coerceAtLeast(0f) * contentPullMaxDistancePx
            }
        }
    }
    val contentState by rememberUpdatedState(content)
    val stableContent = remember { movableContentOf { contentState() } }
    val strictPullToRefreshConnection = remember(pullToRefreshState, coroutineScope) {
        TopStartedPullToRefreshConnection(
            state = pullToRefreshState,
            coroutineScope = coroutineScope,
        )
    }

    // Hide indicator for first-load/programmatic loading. Show only for pull-to-refresh actions.
    val indicatorRefreshing = userInitiatedRefresh && isRefreshing
    strictPullToRefreshConnection.enabled = enabled
    strictPullToRefreshConnection.isRefreshing = indicatorRefreshing
    strictPullToRefreshConnection.thresholdPx = refreshThresholdPx
    strictPullToRefreshConnection.onRefresh = {
        userInitiatedRefresh = true
        onRefresh()
    }

    LaunchedEffect(indicatorRefreshing, refreshThresholdPx) {
        strictPullToRefreshConnection.updateRefreshState(indicatorRefreshing)
    }

    LaunchedEffect(userInitiatedRefresh, isRefreshing) {
        if (!userInitiatedRefresh) return@LaunchedEffect
        if (!isRefreshing) {
            // Allow one frame for refresh state to propagate from callbacks.
            yield()
            if (!isRefreshing) {
                userInitiatedRefresh = false
            }
        }
    }

    if (enabled) {
        Box(
            modifier = modifier.nestedScroll(strictPullToRefreshConnection),
        ) {
            Box(
                modifier = if (shiftContentWithPull) {
                    Modifier.offset {
                        IntOffset(
                            x = 0,
                            y = contentPullOffsetPx.roundToInt(),
                        )
                    }
                } else {
                    Modifier
                }
            ) {
                stableContent()
            }
            PullToRefreshDefaults.Indicator(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = indicatorTopPadding),
                isRefreshing = indicatorRefreshing,
                state = pullToRefreshState,
            )
        }
    } else {
        Box(modifier = modifier) {
            stableContent()
        }
    }
}

private class TopStartedPullToRefreshConnection(
    private val state: PullToRefreshState,
    private val coroutineScope: CoroutineScope,
) : NestedScrollConnection {
    var enabled: Boolean = true
    var isRefreshing: Boolean = false
    var thresholdPx: Float = 1f
    var onRefresh: () -> Unit = {}

    private var distancePulled = 0f
    private var verticalOffset = 0f
    private var userDragActive = false
    private var refreshAllowedThisDrag = false
    private var sawNonRefreshScrollThisDrag = false

    private val safeThresholdPx: Float
        get() = thresholdPx.coerceAtLeast(1f)

    private val adjustedDistancePulled: Float
        get() = distancePulled * PullToRefreshDragMultiplier

    private val progress: Float
        get() = adjustedDistancePulled / safeThresholdPx

    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
        if (state.isAnimating || !enabled || source != NestedScrollSource.UserInput) {
            return Offset.Zero
        }

        startUserDragIfNeeded()
        if (available.y < 0f && refreshAllowedThisDrag && distancePulled > 0f) {
            return consumeAvailableOffset(available).also { snapToOffset() }
        }

        if (distancePulled == 0f && available.y < 0f) {
            sawNonRefreshScrollThisDrag = true
        }
        return Offset.Zero
    }

    override fun onPostScroll(
        consumed: Offset,
        available: Offset,
        source: NestedScrollSource,
    ): Offset {
        if (state.isAnimating || !enabled || source != NestedScrollSource.UserInput) {
            return Offset.Zero
        }

        startUserDragIfNeeded()

        if (distancePulled == 0f && consumed.y != 0f) {
            sawNonRefreshScrollThisDrag = true
        }

        if (available.y > 0f && distancePulled == 0f && !refreshAllowedThisDrag) {
            // Only the first overscroll of a drag may arm refresh. Reaching top mid-drag stays as
            // normal overscroll so incidental upward scrolling does not trigger reload.
            refreshAllowedThisDrag = !sawNonRefreshScrollThisDrag && consumed.y == 0f
        }

        if (!refreshAllowedThisDrag) {
            return Offset.Zero
        }

        return consumeAvailableOffset(available).also { snapToOffset() }
    }

    override suspend fun onPreFling(available: Velocity): Velocity {
        val consumed = if (enabled && refreshAllowedThisDrag) {
            onRelease(available.y)
        } else {
            if (!isRefreshing && distancePulled > 0f) {
                animateToHidden()
            }
            0f
        }
        resetDragTracking()
        return Velocity(0f, consumed)
    }

    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
        if (!isRefreshing && distancePulled > 0f) {
            animateToHidden()
        }
        resetDragTracking()
        return Velocity.Zero
    }

    suspend fun updateRefreshState(refreshing: Boolean) {
        if (refreshing) {
            animateToThreshold()
        } else {
            animateToHidden()
        }
    }

    private fun startUserDragIfNeeded() {
        if (userDragActive) return
        userDragActive = true
        refreshAllowedThisDrag = false
        sawNonRefreshScrollThisDrag = false
    }

    private fun resetDragTracking() {
        userDragActive = false
        refreshAllowedThisDrag = false
        sawNonRefreshScrollThisDrag = false
    }

    private fun consumeAvailableOffset(available: Offset): Offset {
        val y = if (isRefreshing) {
            0f
        } else {
            val newOffset = (distancePulled + available.y).coerceAtLeast(0f)
            val dragConsumed = newOffset - distancePulled
            distancePulled = newOffset
            verticalOffset = calculateVerticalOffset()
            dragConsumed
        }
        return Offset(0f, y)
    }

    private fun snapToOffset() {
        val target = verticalOffset / safeThresholdPx
        coroutineScope.launch {
            if (!state.isAnimating) {
                state.snapTo(target)
            }
        }
    }

    private suspend fun onRelease(velocity: Float): Float {
        if (isRefreshing) return 0f

        if (adjustedDistancePulled > safeThresholdPx) {
            onRefresh()
        }

        val consumed = when {
            distancePulled == 0f -> 0f
            velocity < 0f -> 0f
            else -> velocity
        }

        animateToHidden()
        return consumed
    }

    private fun calculateVerticalOffset(): Float =
        when {
            adjustedDistancePulled <= safeThresholdPx -> adjustedDistancePulled
            else -> {
                val overshootPercent = abs(progress) - 1.0f
                val linearTension = overshootPercent.coerceIn(0f, 2f)
                val tensionPercent = linearTension - linearTension.pow(2) / 4
                val extraOffset = safeThresholdPx * tensionPercent
                safeThresholdPx + extraOffset
            }
        }

    private suspend fun animateToThreshold() {
        try {
            state.animateToThreshold()
        } finally {
            distancePulled = safeThresholdPx
            verticalOffset = safeThresholdPx
        }
    }

    private suspend fun animateToHidden() {
        try {
            state.animateToHidden()
        } finally {
            distancePulled = 0f
            verticalOffset = 0f
        }
    }
}

private const val PullToRefreshDragMultiplier = 0.5f
