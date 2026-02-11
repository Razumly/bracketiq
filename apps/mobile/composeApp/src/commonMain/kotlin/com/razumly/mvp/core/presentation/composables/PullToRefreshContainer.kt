package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import kotlinx.coroutines.yield

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PullToRefreshContainer(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable () -> Unit,
) {
    var userInitiatedRefresh by rememberSaveable { mutableStateOf(false) }

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
            modifier = modifier,
        ) {
            content()
        }
    } else {
        Box(modifier = modifier) {
            content()
        }
    }
}
