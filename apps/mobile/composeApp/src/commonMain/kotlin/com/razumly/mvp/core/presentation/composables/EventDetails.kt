package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.presentation.util.RectangleCrop
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.teamSizeFormat
import com.razumly.mvp.core.presentation.util.toDivisionCase
import com.razumly.mvp.core.presentation.util.toTitleCase
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
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
    val event = eventWithRelations.event
    val host = eventWithRelations.host
    val hazeState = remember { HazeState() }
    var mapButtonOffset by remember { mutableStateOf(Offset.Zero) }
    val scrollState = rememberScrollState()
    var contentHeightPx by remember { mutableStateOf(0) }

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


    Column(Modifier.fillMaxSize().verticalScroll(scrollState)) {
        Box(Modifier.fillMaxSize()) {
            BackgroundImage(imageUrl = event.imageUrl, hazeState, contentHeightPx)

            IconButton(
                onClick = onFavoriteClick, modifier = favoritesModifier.align(Alignment.TopEnd)
            ) {
                Icon(
                    painter = rememberVectorPainter(Icons.Default.AddCircle),
                    contentDescription = "Favorite",
                )
            }

            Column(
                modifier = Modifier
                    .onGloballyPositioned {
                        contentHeightPx = it.size.height
                    }.padding(navPadding).padding(horizontal = 16.dp).fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
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
                    modifier = Modifier.align(Alignment.CenterHorizontally).onGloballyPositioned {
                        mapButtonOffset = it.boundsInWindow().center
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Black, contentColor = Color.White
                    )
                ) {
                    Icon(Icons.Default.Place, contentDescription = null)
                    Text("View on Map")
                }

                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    joinButton()
                }

                CardSection("Hosted by ${host.firstName} ${host.lastName}", event.description)
                CardSection("Price", event.price.moneyFormat())
                CardSection("Date", dateRangeText)
                CardSection("Type", "${event.fieldType} • ${event.eventType}".toTitleCase())
                CardSection("Divisions", event.divisions.joinToString().toDivisionCase())

                // Specifics
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                    modifier = Modifier.wrapContentSize()
                ) {
                    Column(
                        Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Specifics", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Max Players: ${event.maxPlayers}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            "Team Sizes: ${event.teamSizeLimit.teamSizeFormat()}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        if (event is Tournament) {
                            Text(
                                if (event.doubleElimination) "Double Elimination" else "Single Elimination",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                "Winner Set Count: ${event.winnerSetCount}",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                "Winner Points: ${event.winnerBracketPointsToVictory.joinToString()}",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            if (event.doubleElimination) {
                                Text(
                                    "Loser Set Count: ${event.loserSetCount}",
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Text(
                                    "Loser Points: ${event.loserBracketPointsToVictory.joinToString()}",
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

@Composable
fun CardSection(title: String, content: String) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
        modifier = Modifier.wrapContentSize()
    ) {
        Column(
            modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(content, style = MaterialTheme.typography.bodyMedium)
        }
    }
}


@Composable
fun BackgroundImage(imageUrl: String, hazeState: HazeState, contentHeight: Int) {
    Column(Modifier.fillMaxSize().hazeSource(hazeState)) {
        Box(Modifier.height(600.dp)) {
            AsyncImage(
                model = imageUrl,
                contentDescription = "Event Image",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
            AsyncImage(
                model = imageUrl,
                contentDescription = "Event Image",
                modifier = Modifier.fillMaxSize()
                    .clip(RectangleCrop(0.5f))
                    .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
                    .drawWithContent {
                        drawContent()
                        drawRect(
                            brush = Brush.verticalGradient(
                                0f to Color.Transparent,
                                0.3f to Color.Red
                            ), blendMode = BlendMode.DstIn
                        )
                    }
                    .blur(64.dp),
                contentScale = ContentScale.Crop,
            )
        }

        AsyncImage(
            model = imageUrl,
            contentDescription = "Flipped Hazy Background",
            modifier = Modifier.graphicsLayer { rotationX = 180f }
                .height(with(LocalDensity.current) { contentHeight.toDp() - 600.dp }).blur(64.dp),
            contentScale = ContentScale.Crop,
        )
    }
}