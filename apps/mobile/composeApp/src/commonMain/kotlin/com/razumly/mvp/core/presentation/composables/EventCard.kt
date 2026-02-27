@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.util.toDivisionDisplayLabels
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.eventSearch.composables.StylizedText
import com.razumly.mvp.eventSearch.util.TextPatterns
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeProgressive
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime

@OptIn(
    ExperimentalHazeMaterialsApi::class, ExperimentalHazeApi::class
)
@Composable
fun EventCard(
    event: Event,
    navPadding: PaddingValues = PaddingValues(),
    showLoadingPlaceholder: Boolean = false,
    onMapClick: (Offset) -> Unit,
) {
    val imageModel = remember(event.imageId) {
        event.imageId.trim()
            .takeIf { it.isNotBlank() }
            ?.let { imageId -> getImageUrl(imageId) }
    }
    var isImageReady by remember(imageModel) { mutableStateOf(imageModel == null) }
    val patterns = TextPatterns(event.name)
    val hazeState = rememberHazeState()
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
    val prizeText = remember(event.prize) {
        event.prize.trim().takeIf { it.isNotEmpty() }
    }
    val divisionSummaryText = remember(event.divisions, event.divisionDetails) {
        val divisionLabels = event.divisions
            .toDivisionDisplayLabels(event.divisionDetails)
            .map { label -> label.removeStandaloneSkillWord() }
            .filter { label -> label.isNotBlank() }
        when {
            divisionLabels.size > 1 -> "Divisions: Multiple"
            divisionLabels.size == 1 -> "Division: ${divisionLabels.first()}"
            else -> "Division: TBD"
        }
    }


    Box(Modifier.fillMaxWidth().clipToBounds()) {
        AsyncImage(model = imageModel,
            contentDescription = "Event Image",
            modifier = Modifier
                .matchParentSize()
                .hazeSource(hazeState, key = event.id),
            contentScale = ContentScale.Crop,
            onState = { state ->
                isImageReady = when (state) {
                    is AsyncImagePainter.State.Loading -> false
                    is AsyncImagePainter.State.Success -> true
                    is AsyncImagePainter.State.Error -> true
                    is AsyncImagePainter.State.Empty -> imageModel == null
                }
            })
        if (showLoadingPlaceholder && !isImageReady) {
            EventCardPlaceholder(
                navPadding = navPadding,
                modifier = Modifier.fillMaxWidth()
            )
        } else {
            Column(
                modifier = Modifier.hazeEffect(
                    hazeState, HazeMaterials.ultraThin(MaterialTheme.colorScheme.onBackground)
                ) {
                    inputScale = HazeInputScale.Fixed(0.5f)
                    progressive = HazeProgressive.verticalGradient(
                        easing = FastOutSlowInEasing,
                        startIntensity = 0f,
                        endIntensity = 1f,
                        startY = 200f
                    )
                }.padding(navPadding).padding(horizontal = 16.dp).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(4.dp, alignment = Alignment.Bottom)
            ) {
                Spacer(modifier = Modifier.height(232.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Button(modifier = Modifier.onGloballyPositioned { layoutCoordinates ->
                        val boundsInWindow = layoutCoordinates.boundsInWindow()
                        mapButtonOffset = boundsInWindow.center
                    },
                        onClick = { onMapClick(mapButtonOffset) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Black, contentColor = Color.White
                        )
                    ) {
                        Text("View on Map")
                        Icon(Icons.Default.Place, contentDescription = "View on Map Button")
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = event.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.background,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Start,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        painter = rememberVectorPainter(Icons.Default.LocationOn),
                        contentDescription = "Location",
                        tint = MaterialTheme.colorScheme.background
                    )
                    Text(
                        text = event.location,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.background,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    StylizedText(
                        text = event.eventType.name.toTitleCase(),
                        patterns = patterns,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    prizeText?.let { value ->
                        Text(
                            text = "Prize: $value",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.background,
                            modifier = Modifier.weight(1f),
                            textAlign = TextAlign.End,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                StylizedText(
                    text = if (event.teamSignup) "Team registration" else "Individual registration",
                    patterns = patterns,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                StylizedText(
                    text = divisionSummaryText,
                    patterns = patterns,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                HorizontalDivider(thickness = 2.dp)

                Row(
                    modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = dateRangeText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.background,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = event.price.moneyFormat(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.background,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
fun EventCardPlaceholder(
    navPadding: PaddingValues = PaddingValues(),
    modifier: Modifier = Modifier,
) {
    val placeholderColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)

    Column(
        modifier = modifier
            .padding(navPadding)
            .padding(horizontal = 16.dp)
            .fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp, alignment = Alignment.Bottom)
    ) {
        Spacer(modifier = Modifier.height(232.dp))
        PlaceholderLine(
            widthFraction = 0.38f,
            height = 36.dp,
            color = placeholderColor,
            shape = RoundedCornerShape(18.dp)
        )
        PlaceholderLine(widthFraction = 0.72f, height = 22.dp, color = placeholderColor)
        PlaceholderLine(widthFraction = 0.6f, height = 18.dp, color = placeholderColor)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            PlaceholderLine(
                modifier = Modifier.weight(1f),
                widthFraction = 1f,
                height = 16.dp,
                color = placeholderColor
            )
            PlaceholderLine(
                modifier = Modifier.weight(1f),
                widthFraction = 1f,
                height = 16.dp,
                color = placeholderColor
            )
        }
        PlaceholderLine(widthFraction = 0.62f, height = 14.dp, color = placeholderColor)
        PlaceholderLine(widthFraction = 0.56f, height = 14.dp, color = placeholderColor)
        PlaceholderLine(
            widthFraction = 1f,
            height = 2.dp,
            color = placeholderColor.copy(alpha = 0.84f),
            shape = RoundedCornerShape(1.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            PlaceholderLine(widthFraction = 0.38f, height = 14.dp, color = placeholderColor)
            PlaceholderLine(widthFraction = 0.22f, height = 14.dp, color = placeholderColor)
        }
    }
}

@Composable
private fun PlaceholderLine(
    widthFraction: Float,
    height: Dp,
    color: Color,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(6.dp),
) {
    Box(
        modifier = modifier
            .fillMaxWidth(widthFraction.coerceIn(0f, 1f))
            .height(height)
            .background(color = color, shape = shape)
    )
}

private val standaloneSkillWordRegex = Regex("\\bskill\\b", RegexOption.IGNORE_CASE)
private val whitespaceRegex = Regex("\\s+")

private fun String.removeStandaloneSkillWord(): String {
    return replace(standaloneSkillWordRegex, " ")
        .replace(whitespaceRegex, " ")
        .trim()
}
