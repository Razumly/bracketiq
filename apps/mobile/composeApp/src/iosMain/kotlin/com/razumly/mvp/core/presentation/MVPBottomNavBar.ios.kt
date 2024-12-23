package com.razumly.mvp.core.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import com.razumly.mvp.core.presentation.Tab

@Composable
actual fun MVPBottomNavBar(
    selectedTab: Any,
    onTabSelected: (Tab) -> Unit,
    content: @Composable (PaddingValues) -> Unit
) {
}