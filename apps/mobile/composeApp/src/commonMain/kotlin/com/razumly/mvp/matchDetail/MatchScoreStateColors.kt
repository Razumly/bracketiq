package com.razumly.mvp.matchDetail

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

private val MatchWinnerTextLight = Color(0xFF1B5E20)
private val MatchWinnerTextDark = Color(0xFFA5D6A7)
private val MatchWinnerContainerLight = Color(0xFFE1F1E3)
private val MatchWinnerContainerDark = Color(0xFF1E3A24)

@Composable
internal fun matchWinnerTextColor(): Color = if (MaterialTheme.colorScheme.surface.luminance() < 0.5f) {
    MatchWinnerTextDark
} else {
    MatchWinnerTextLight
}

@Composable
internal fun matchWinnerContainerColor(): Color = if (MaterialTheme.colorScheme.surface.luminance() < 0.5f) {
    MatchWinnerContainerDark
} else {
    MatchWinnerContainerLight
}

@Composable
internal fun matchWinnerContentColor(): Color = if (MaterialTheme.colorScheme.surface.luminance() < 0.5f) {
    Color(0xFFE8F5E9)
} else {
    Color(0xFF1B5E20)
}
