package com.razumly.mvp.chat.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials

// Telegram chat edge blur uses an 80pt feather; iMessage appears slightly shorter in practice.
private val CHAT_HEADER_FEATHER_HEIGHT = 76.dp
private val CHAT_HEADER_FEATHER_OFFSET = 20.dp

@OptIn(ExperimentalMaterial3Api::class, ExperimentalHazeMaterialsApi::class)
@Composable
fun ChatHeader(
    title: String,
    subtitle: String?,
    hazeState: HazeState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    trailingContent: @Composable BoxScope.() -> Unit,
    onHeightMeasured: (Int) -> Unit = {},
) {
    Box(
        modifier = modifier
            .onSizeChanged { onHeightMeasured(it.height) }
            .hazeEffect(
                state = hazeState,
                style = HazeMaterials.ultraThin(MaterialTheme.colorScheme.surface),
            )
            .background(
                Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.0f to MaterialTheme.colorScheme.surface.copy(alpha = 0.30f),
                        0.26f to MaterialTheme.colorScheme.surface.copy(alpha = 0.22f),
                        0.58f to MaterialTheme.colorScheme.surface.copy(alpha = 0.11f),
                        1.0f to MaterialTheme.colorScheme.surface.copy(alpha = 0.03f),
                    ),
                )
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            HeaderActionButton(
                onClick = onBack,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                )
            }

            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(28.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                tonalElevation = 2.dp,
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp, vertical = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleLarge,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                    )
                    subtitle?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                        )
                    }
                }
            }

            Surface(
                modifier = Modifier.size(52.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                tonalElevation = 2.dp,
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    trailingContent()
                }
            }
        }

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(CHAT_HEADER_FEATHER_HEIGHT)
                .offset(y = CHAT_HEADER_FEATHER_OFFSET)
                .background(
                    Brush.verticalGradient(
                        colorStops = arrayOf(
                            0.0f to MaterialTheme.colorScheme.surface.copy(alpha = 0.14f),
                            0.36f to MaterialTheme.colorScheme.surface.copy(alpha = 0.09f),
                            0.74f to MaterialTheme.colorScheme.surface.copy(alpha = 0.03f),
                            1.0f to Color.Transparent,
                        ),
                    ),
                ),
        )
    }
}

@Composable
private fun HeaderActionButton(
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = Modifier.size(52.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
        tonalElevation = 2.dp,
    ) {
        IconButton(
            onClick = onClick,
            modifier = Modifier.size(52.dp),
        ) {
            content()
        }
    }
}
