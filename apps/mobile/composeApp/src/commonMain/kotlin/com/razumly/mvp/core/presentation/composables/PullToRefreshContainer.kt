package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Alignment
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.movableContentOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import kotlinx.coroutines.yield
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
    val contentPullMaxDistancePx = with(LocalDensity.current) { contentPullMaxDistance.toPx() }
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

    // Hide indicator for first-load/programmatic loading. Show only for pull-to-refresh actions.
    val indicatorRefreshing = userInitiatedRefresh && isRefreshing

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
        PullToRefreshBox(
            isRefreshing = indicatorRefreshing,
            onRefresh = {
                userInitiatedRefresh = true
                onRefresh()
            },
            state = pullToRefreshState,
            indicator = {
                PullToRefreshDefaults.Indicator(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .offset(y = indicatorTopPadding),
                    isRefreshing = indicatorRefreshing,
                    state = pullToRefreshState,
                )
            },
            modifier = modifier,
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
        }
    } else {
        Box(modifier = modifier) {
            stableContent()
        }
    }
}
