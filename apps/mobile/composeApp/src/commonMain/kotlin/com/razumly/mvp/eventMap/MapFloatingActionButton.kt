package com.razumly.mvp.eventMap

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.EaseInCubic
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

@Composable
fun MapFloatingActionButton(
    onCloseMap: () -> Unit,
    modifier: Modifier = Modifier,
    label: String = "Close Map",
    usePrimaryActionButton: Boolean = false,
    onLeadingAction: (() -> Unit)? = null,
    onClearSelection: (() -> Unit)? = null,
) {
    var mainButtonWidthPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val sideButtonOffset = with(density) { (mainButtonWidthPx.toDp() / 2) + 32.dp }

    AnimatedVisibility(
        visible = true,
        modifier = modifier,
        enter = slideInVertically(
            initialOffsetY = { it },
            animationSpec = tween(300, easing = EaseOutCubic)
        ) + fadeIn(
            animationSpec = tween(300)
        ),
        exit = slideOutVertically(
            targetOffsetY = { it },
            animationSpec = tween(200, easing = EaseInCubic)
        ) + fadeOut(
            animationSpec = tween(200)
        )
    ) {
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            Button(
                onClick = onCloseMap,
                modifier = Modifier.onGloballyPositioned { coordinates ->
                    mainButtonWidthPx = coordinates.size.width
                },
                colors = if (usePrimaryActionButton) {
                    ButtonDefaults.buttonColors()
                } else {
                    ButtonDefaults.buttonColors(
                        containerColor = Color.Black,
                        contentColor = Color.White,
                    )
                }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }

            if (onLeadingAction != null) {
                MapCurrentLocationButton(
                    onClick = onLeadingAction,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .offset(x = -sideButtonOffset)
                        .size(48.dp),
                )
            }

            if (onClearSelection != null) {
                Button(
                    onClick = onClearSelection,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .offset(x = sideButtonOffset)
                        .size(48.dp),
                    shape = RoundedCornerShape(16.dp),
                    contentPadding = PaddingValues(0.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Black,
                        contentColor = Color.White,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Clear selected location",
                    )
                }
            }
        }
    }
}
