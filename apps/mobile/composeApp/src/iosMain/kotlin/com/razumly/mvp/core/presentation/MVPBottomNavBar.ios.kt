package com.razumly.mvp.core.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import com.razumly.mvp.core.presentation.HomeComponent.*

@Composable
actual fun MVPBottomNavBar(
    selectedPage: Any,
    onPageSelected: (Page) -> Unit,
    content: @Composable (PaddingValues) -> Unit
) {
}