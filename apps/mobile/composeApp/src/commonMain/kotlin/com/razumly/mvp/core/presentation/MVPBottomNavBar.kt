package com.razumly.mvp.core.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable

data class NavigationItem(
    val tab: Tab,
    val icon: String, // Use string identifiers instead of ImageVector
    val titleResId: String // Use string instead of resource ID
)

@Composable
expect fun MVPBottomNavBar(
    selectedTab: Any,
    onTabSelected: (Tab) -> Unit,
    content: @Composable (PaddingValues) -> Unit
)

