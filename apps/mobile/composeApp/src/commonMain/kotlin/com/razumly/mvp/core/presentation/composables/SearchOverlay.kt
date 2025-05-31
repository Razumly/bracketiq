package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex

@Composable
fun SearchOverlay(
    isVisible: Boolean,
    searchQuery: String,
    searchBoxPosition: Offset,
    searchBoxSize: IntSize,
    onDismiss: () -> Unit,
    suggestions: @Composable () -> Unit,
    initial: @Composable () -> Unit
) {
    val density = LocalDensity.current

    // Calculate overlay position based on search box
    val overlayTopOffset = with(density) {
        searchBoxPosition.y.toDp() + searchBoxSize.height.toDp() + 4.dp // 4dp gap
    }

    val overlayStartOffset = with(density) {
        searchBoxPosition.x.toDp()
    }

    val overlayWidth = with(density) {
        searchBoxSize.width.toDp()
    }
    if (isVisible) {
        // Full-screen overlay that captures touches
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Transparent)
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() }
                ) { onDismiss() }
                .zIndex(999f)
        ) {
            // Dropdown positioned at the top
            Card(
                modifier = Modifier
                    .width(overlayWidth)
                    .heightIn(max = 400.dp)
                    .offset(
                        x = overlayStartOffset,
                        y = overlayTopOffset
                    )
                    .clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() }
                    ) { /* Prevent click through */ },
                elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
            ) {
                if (searchQuery.isNotEmpty()) {
                    suggestions()
                } else {
                    initial()
                }
            }
        }
    }
}
