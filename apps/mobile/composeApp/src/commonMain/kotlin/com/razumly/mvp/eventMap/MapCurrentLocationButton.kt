package com.razumly.mvp.eventMap

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun MapCurrentLocationButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val shape = RoundedCornerShape(14.dp)

    Box(
        modifier = modifier
            .size(MAP_CURRENT_LOCATION_BUTTON_SIZE)
            .shadow(
                elevation = 8.dp,
                shape = shape,
                clip = false,
                ambientColor = Color.Black.copy(alpha = 0.16f),
                spotColor = Color.Black.copy(alpha = 0.16f),
            )
            .clip(shape)
            .background(if (enabled) Color.White else Color(0xFFF3F4F6))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.MyLocation,
            contentDescription = "Go to my location",
            tint = if (enabled) Color(0xFF1F1F1F) else Color(0xFF9AA0A6),
        )
    }
}
