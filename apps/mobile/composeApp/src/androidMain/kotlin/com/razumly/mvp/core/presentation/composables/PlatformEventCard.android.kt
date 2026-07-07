package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset

@Composable
internal actual fun PlatformEventCard(
    data: NativeEventCardData,
    navPadding: PaddingValues,
    showLoadingPlaceholder: Boolean,
    onMapClick: (Offset) -> Unit,
) {
    ComposeEventCard(
        data = data,
        navPadding = navPadding,
        showLoadingPlaceholder = showLoadingPlaceholder,
        onMapClick = onMapClick,
    )
}
