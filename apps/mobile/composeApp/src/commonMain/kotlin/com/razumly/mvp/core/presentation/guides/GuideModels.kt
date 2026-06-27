package com.razumly.mvp.core.presentation.guides

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

data class AppGuide(
    val id: String,
    val steps: List<AppGuideStep>,
)

data class AppGuideStep(
    val id: String,
    val targetId: String,
    val title: String,
    val body: String,
)

object AppGuideTargets {
    const val BottomNavCenterAction = "bottom_nav.center_action"
}

sealed interface GuideHighlightShape {
    data class RoundedRect(val cornerRadius: Dp = 12.dp) : GuideHighlightShape
    data object Circle : GuideHighlightShape
}
