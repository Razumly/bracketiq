package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.presentation.util.cleanup
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeProgressive
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime

@OptIn(ExperimentalHazeMaterialsApi::class, ExperimentalHazeApi::class)
@Composable
fun EventDetails(
    eventWithRelations: EventAbsWithRelations,
    onFavoriteClick: () -> Unit,
    favoritesModifier: Modifier,
    navPadding: PaddingValues = PaddingValues(),
    onMapClick: (Offset) -> Unit,
    joinButton: @Composable () -> Unit
) {
    val imageStateText by remember { mutableStateOf("initial") }
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    val hazeState = remember { HazeState() }
    var mapButtonOffset by remember { mutableStateOf(Offset.Zero) }

    val dateRangeText = remember(event.start, event.end) {
        val startDate = event.start.toLocalDateTime(TimeZone.currentSystemDefault()).date
        val endDate = event.end.toLocalDateTime(TimeZone.currentSystemDefault()).date

        val startStr = startDate.format(dateFormat)

        if (startDate != endDate) {
            val endStr = endDate.format(dateFormat)
            "$startStr - $endStr"
        } else {
            startStr
        }
    }


    Box(Modifier.fillMaxSize()) {

        BackgroundImage(event.imageUrl, hazeState)

        if (imageStateText != "success") {
            Text(imageStateText)
        }
        IconButton(
            onClick = onFavoriteClick, modifier = favoritesModifier.align(Alignment.TopEnd)
        ) {
            Icon(
                painter = rememberVectorPainter(Icons.Default.AddCircle),
                contentDescription = "Favorite",
            )
        }

        val scrollState = rememberScrollState()

        Column(
            modifier = Modifier
                .hazeEffect(
                    hazeState,
                    HazeMaterials.ultraThin(MaterialTheme.colorScheme.onBackground)
                ) {
                    inputScale = HazeInputScale.Fixed(0.8f)
                    progressive = HazeProgressive.verticalGradient(
                        easing = FastOutSlowInEasing,
                        startIntensity = 0f,
                        endIntensity = 1f,
                        startY = 200f
                    )
                }
                .padding(navPadding)
                .padding(horizontal = 16.dp)
                .fillMaxSize()
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Spacer(Modifier.height(232.dp))

            // Title and Rating
            Text(
                text = event.name,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.background
            )

            Text(
                text = event.location,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.background
            )

            // View on Map Button
            Button(
                onClick = { onMapClick(mapButtonOffset) },
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .onGloballyPositioned {
                        mapButtonOffset = it.boundsInWindow().center
                    },
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.Black,
                    contentColor = Color.White
                )
            ) {
                Icon(Icons.Default.Place, contentDescription = null)
                Text("View on Map")
            }

            // Host info
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Hosted by ${host.firstName} ${host.lastName}".toTitleCase(), style = MaterialTheme.typography.titleMedium)
                    Text(event.description, style = MaterialTheme.typography.bodySmall)
                }
            }

            // Price and Date
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = dateRangeText,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "$${cleanup("${event.price}")}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            // Type and Division
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "${event.fieldType} • ${event.eventType}".toTitleCase(),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "Divisions: ${event.divisions.joinToString()}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }

            // Join Button (if applicable)
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                joinButton()
            }

            Spacer(modifier = Modifier.height(64.dp))
        }
    }
}

@Composable
fun BackgroundImage(imageUrl: String, hazeState: HazeState) {
    Column(Modifier.fillMaxSize()) {
        AsyncImage(
            model = imageUrl,
            contentDescription = "Event Image",
            modifier = Modifier
                .fillMaxWidth()
                .graphicsLayer { rotationX = 0f }
                .hazeSource(hazeState),
            contentScale = ContentScale.Crop,
        )

        AsyncImage(
            model = imageUrl,
            contentDescription = "Flipped Hazy Background",
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { rotationX = 180f }
                .hazeSource(hazeState),
            contentScale = ContentScale.Crop,
        )
    }
}