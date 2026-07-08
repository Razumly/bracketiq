@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import com.razumly.mvp.core.data.dataTypes.displayPriceRangeLabel
import com.razumly.mvp.core.data.dataTypes.evergreenDateDisplayLabel
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.core.data.dataTypes.isDraftLikeState
import com.razumly.mvp.core.data.dataTypes.isPrivateState
import com.razumly.mvp.core.data.dataTypes.lifecycleStateLabel
import com.razumly.mvp.core.data.util.divisionDisplayLabels
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.eventTypeWithSportLabel
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.util.resolvedTimeZone
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeProgressive
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime

private data class EventLifecycleBadge(
    val label: String,
    val tone: String,
)

private const val EVENT_CARD_IMAGE_WIDTH_PX = 1080
private const val EVENT_CARD_IMAGE_HEIGHT_PX = 1350

data class NativeEventCardData(
    val id: String,
    val imageUrl: String?,
    val title: String,
    val location: String,
    val eventTypeLabel: String,
    val registrationLabel: String,
    val divisionLabel: String,
    val dateLabel: String,
    val priceLabel: String,
    val prizeLabel: String?,
    val lifecycleLabel: String?,
    val lifecycleTone: String?,
)

@OptIn(
    ExperimentalHazeMaterialsApi::class, ExperimentalHazeApi::class
)
@Composable
fun EventCard(
    event: Event,
    navPadding: PaddingValues = PaddingValues(),
    showLoadingPlaceholder: Boolean = false,
    fallbackImageId: String? = null,
    onClick: (() -> Unit)? = null,
    onMapClick: (Offset) -> Unit,
) {
    val imageModel = remember(event.imageId, fallbackImageId) {
        event.imageId.trim()
            .ifBlank { fallbackImageId?.trim().orEmpty() }
            .takeIf { it.isNotBlank() }
            ?.let { imageId ->
                getImageUrl(
                    fileId = imageId,
                    width = EVENT_CARD_IMAGE_WIDTH_PX,
                    height = EVENT_CARD_IMAGE_HEIGHT_PX,
                    trim = true,
                )
            }
    }
    var isImageReady by remember(imageModel) { mutableStateOf(imageModel == null) }
    val hazeState = rememberHazeState()
    var mapButtonOffset by remember { mutableStateOf(Offset.Zero) }

    val eventTimeZone = remember(event.timeZone) { event.resolvedTimeZone() }
    val scheduledDateRangeText = remember(event.start, event.end, eventTimeZone) {
        val startDate = event.start.toLocalDateTime(eventTimeZone).date
        val endDate = event.end.toLocalDateTime(eventTimeZone).date

        val startStr = startDate.format(dateFormat)

        if (startDate != endDate) {
            val endStr = endDate.format(dateFormat)
            "$startStr - $endStr"
        } else {
            startStr
        }
    }
    val dateRangeText = remember(
        event.scheduleText,
        event.dateDisplayMode,
        event.dateDisplayText,
        scheduledDateRangeText,
    ) {
        event.evergreenDateDisplayLabel() ?: scheduledDateRangeText
    }
    val prizeText = remember(event.prize) {
        event.prize.trim().takeIf { it.isNotEmpty() }
    }
    val divisionSummaryText = remember(event.divisions, event.divisionDetails, event.eventType, event.includePlayoffs) {
        val divisionLabels = event
            .divisionDisplayLabels()
            .map { label -> label.removeStandaloneSkillWord() }
            .filter { label -> label.isNotBlank() }
        when {
            divisionLabels.size > 1 -> "Divisions: Multiple"
            divisionLabels.size == 1 -> "Division: ${divisionLabels.first()}"
            else -> "Division: TBD"
        }
    }
    val lifecycleBadge = remember(event.state) {
        when {
            event.isPrivateState() -> EventLifecycleBadge(
                label = event.lifecycleStateLabel(),
                tone = "private",
            )
            event.isDraftLikeState() -> EventLifecycleBadge(
                label = event.lifecycleStateLabel(),
                tone = "draft",
            )
            else -> null
        }
    }
    val cardData = NativeEventCardData(
        id = event.id,
        imageUrl = imageModel,
        title = event.name,
        location = event.location,
        eventTypeLabel = event.eventTypeWithSportLabel(),
        registrationLabel = when {
            event.isAffiliateEvent() -> "External registration"
            event.teamSignup -> "Team registration"
            else -> "Individual registration"
        },
        divisionLabel = divisionSummaryText,
        dateLabel = dateRangeText,
        priceLabel = event.displayPriceRangeLabel(),
        prizeLabel = prizeText?.let { value -> "Prize: $value" },
        lifecycleLabel = lifecycleBadge?.label,
        lifecycleTone = lifecycleBadge?.tone,
    )

    PlatformEventCard(
        data = cardData,
        navPadding = navPadding,
        showLoadingPlaceholder = showLoadingPlaceholder,
        onClick = onClick,
        onMapClick = onMapClick,
    )
}

@Composable
internal expect fun PlatformEventCard(
    data: NativeEventCardData,
    navPadding: PaddingValues,
    showLoadingPlaceholder: Boolean,
    onClick: (() -> Unit)?,
    onMapClick: (Offset) -> Unit,
)

@OptIn(
    ExperimentalHazeMaterialsApi::class, ExperimentalHazeApi::class
)
@Composable
internal fun ComposeEventCard(
    data: NativeEventCardData,
    navPadding: PaddingValues = PaddingValues(),
    showLoadingPlaceholder: Boolean = false,
    onClick: (() -> Unit)? = null,
    onMapClick: (Offset) -> Unit,
) {
    var isImageReady by remember(data.imageUrl) { mutableStateOf(data.imageUrl == null) }
    val hazeState = rememberHazeState()
    var mapButtonOffset by remember { mutableStateOf(Offset.Zero) }

    Box(
        Modifier
            .fillMaxWidth()
            .clipToBounds()
            .background(Color.Black)
            .then(
                if (onClick != null) {
                    Modifier.clickable(onClick = onClick)
                } else {
                    Modifier
                }
            )
    ) {
        AsyncImage(
            model = data.imageUrl,
            contentDescription = "Event Image",
            modifier = Modifier
                .matchParentSize()
                .hazeSource(hazeState, key = data.id),
            contentScale = ContentScale.Crop,
            onState = { state ->
                isImageReady = when (state) {
                    is AsyncImagePainter.State.Loading -> false
                    is AsyncImagePainter.State.Success -> true
                    is AsyncImagePainter.State.Error -> true
                    is AsyncImagePainter.State.Empty -> data.imageUrl == null
                }
            })
        if (showLoadingPlaceholder && !isImageReady) {
            EventCardPlaceholder(
                navPadding = navPadding,
                modifier = Modifier.fillMaxWidth()
            )
        } else {
            val contentModifier = Modifier.hazeEffect(
                hazeState, HazeMaterials.ultraThin(MaterialTheme.colorScheme.onBackground)
            ) {
                inputScale = HazeInputScale.Fixed(0.5f)
                progressive = HazeProgressive.verticalGradient(
                    easing = FastOutSlowInEasing,
                    startIntensity = 0f,
                    endIntensity = 1f,
                    startY = 200f
                )
            }

            Column(
                modifier = contentModifier
                    .padding(navPadding)
                    .padding(horizontal = 16.dp)
                    .fillMaxWidth(),
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
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
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
                        text = data.title,
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
                        text = data.location,
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
                    Text(
                        text = data.eventTypeLabel,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.background,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    data.prizeLabel?.let { value ->
                        Text(
                            text = value,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.background,
                            modifier = Modifier.weight(1f),
                            textAlign = TextAlign.End,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Text(
                    text = data.registrationLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.background,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = data.divisionLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.background,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                HorizontalDivider(thickness = 2.dp)

                Row(
                    modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = data.dateLabel,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.background,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = data.priceLabel,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.background,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            data.lifecycleLabel?.let { label ->
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 12.dp)
                        .background(
                            color = eventLifecycleColor(data.lifecycleTone),
                            shape = RoundedCornerShape(999.dp),
                        )
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

private fun eventLifecycleColor(tone: String?): Color =
    when (tone) {
        "private" -> Color(0xFF1565C0)
        "draft" -> Color(0xFFD32F2F)
        else -> Color(0xFF1565C0)
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
