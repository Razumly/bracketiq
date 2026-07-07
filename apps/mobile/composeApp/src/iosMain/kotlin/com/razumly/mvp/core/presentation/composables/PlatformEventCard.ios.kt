package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.UIKitViewController
import com.razumly.mvp.LocalNativeViewFactory

private val NativeEventCardBaseHeight = 430.dp

@Composable
internal actual fun PlatformEventCard(
    data: NativeEventCardData,
    navPadding: PaddingValues,
    showLoadingPlaceholder: Boolean,
    onMapClick: (Offset) -> Unit,
) {
    val factory = LocalNativeViewFactory.current
    val bottomPadding = navPadding.calculateBottomPadding()

    UIKitViewController(
        modifier = Modifier
            .fillMaxWidth()
            .height(NativeEventCardBaseHeight + bottomPadding),
        factory = {
            factory.createNativeEventCard(
                data = data,
                bottomPadding = bottomPadding.value,
                onMapClick = { x, y -> onMapClick(Offset(x, y)) },
            )
        },
        update = { viewController ->
            factory.updateNativeEventCard(
                viewController = viewController,
                data = data,
                bottomPadding = bottomPadding.value,
                onMapClick = { x, y -> onMapClick(Offset(x, y)) },
            )
        },
    )
}
