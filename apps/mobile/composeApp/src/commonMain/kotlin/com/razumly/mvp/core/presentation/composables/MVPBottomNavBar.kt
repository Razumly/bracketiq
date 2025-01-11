package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import com.razumly.mvp.home.presentation.HomeComponent.*

data class NavigationItem(
    val page: Page,
    val icon: String, // Use string identifiers instead of ImageVector
    val titleResId: String // Use string instead of resource ID
)

@Composable
expect fun MVPBottomNavBar(
    selectedPage: Any,
    onPageSelected: (Page) -> Unit,
    content: @Composable (PaddingValues) -> Unit
)

