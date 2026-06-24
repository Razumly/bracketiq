package com.razumly.mvp.core.presentation.guides

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
