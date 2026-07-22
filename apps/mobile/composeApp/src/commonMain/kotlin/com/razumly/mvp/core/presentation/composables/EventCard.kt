@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.composables

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
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
import com.razumly.mvp.core.presentation.util.getInitialsAvatarUrl
import com.razumly.mvp.core.util.resolvedTimeZone
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeInputScale
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

internal data class EventCardImageSource(
    val imageUrl: String,
    val fallbackImageUrl: String,
    val usesLogoFallback: Boolean,
)

internal fun resolveEventCardImageSource(
    eventName: String,
    eventImageId: String?,
    organizationLogoId: String?,
): EventCardImageSource {
    val normalizedEventImageId = eventImageId?.trim()?.takeIf(String::isNotBlank)
    val normalizedOrganizationLogoId = organizationLogoId?.trim()?.takeIf(String::isNotBlank)
    val initialsImageUrl = getInitialsAvatarUrl(
        name = eventName.trim().ifBlank { "Event" },
        size = EVENT_CARD_IMAGE_WIDTH_PX,
    )

    return when {
        normalizedEventImageId != null -> EventCardImageSource(
            imageUrl = getImageUrl(
                fileId = normalizedEventImageId,
                width = EVENT_CARD_IMAGE_WIDTH_PX,
                height = EVENT_CARD_IMAGE_HEIGHT_PX,
                trim = true,
            ),
            fallbackImageUrl = initialsImageUrl,
            usesLogoFallback = false,
        )

        normalizedOrganizationLogoId != null -> EventCardImageSource(
            imageUrl = getImageUrl(
                fileId = normalizedOrganizationLogoId,
                width = EVENT_CARD_IMAGE_WIDTH_PX,
                height = EVENT_CARD_IMAGE_HEIGHT_PX,
            ),
            fallbackImageUrl = initialsImageUrl,
            usesLogoFallback = true,
        )

        else -> EventCardImageSource(
            imageUrl = initialsImageUrl,
            fallbackImageUrl = initialsImageUrl,
            usesLogoFallback = false,
        )
    }
}

data class NativeEventCardData(
    val id: String,
    val imageUrl: String?,
    val fallbackImageUrl: String = imageUrl.orEmpty(),
    val usesLogoFallback: Boolean,
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
    val imageSource = remember(event.name, event.imageId, fallbackImageId) {
        resolveEventCardImageSource(
            eventName = event.name,
            eventImageId = event.imageId,
            organizationLogoId = fallbackImageId,
        )
    }
    val usesLogoFallback = imageSource.usesLogoFallback
    val imageModel = imageSource.imageUrl
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
        fallbackImageUrl = imageSource.fallbackImageUrl,
        usesLogoFallback = usesLogoFallback,
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
    key(data.id, data.imageUrl, data.fallbackImageUrl) {
        var activeImageUrl by remember(data.imageUrl, data.fallbackImageUrl) {
            mutableStateOf(data.imageUrl ?: data.fallbackImageUrl)
        }
        var isImageReady by remember(data.imageUrl, data.fallbackImageUrl) { mutableStateOf(false) }
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
                model = activeImageUrl,
                contentDescription = "Event Image",
                modifier = Modifier
                    .matchParentSize()
                    .hazeSource(hazeState, key = activeImageUrl),
                contentScale = ContentScale.Crop,
                onState = { state ->
                    when (state) {
                        is AsyncImagePainter.State.Loading -> isImageReady = false
                        is AsyncImagePainter.State.Success -> isImageReady = true
                        is AsyncImagePainter.State.Error -> {
                            if (activeImageUrl != data.fallbackImageUrl) {
                                activeImageUrl = data.fallbackImageUrl
                                isImageReady = false
                            } else {
                                isImageReady = true
                            }
                        }
                        is AsyncImagePainter.State.Empty -> isImageReady = false
                    }
                })
            if (showLoadingPlaceholder && !isImageReady) {
                EventCardPlaceholder(
                    navPadding = navPadding,
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                val detailsModifier = Modifier.hazeEffect(
                    hazeState, HazeMaterials.ultraThin(MaterialTheme.colorScheme.onBackground)
                ) {
                    inputScale = HazeInputScale.Fixed(0.5f)
                }

                Column(
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(170.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .matchParentSize()
                                .background(
                                    Brush.verticalGradient(
                                        colorStops = arrayOf(
                                            0.40f to Color.Transparent,
                                            1f to Color.Black.copy(alpha = 0.68f),
                                        ),
                                    ),
                                ),
                        )

                        Row(
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = data.eventTypeLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color.White,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = data.priceLabel,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    maxLines = 1,
                                )
                            }

                            IconButton(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(
                                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.86f),
                                        shape = CircleShape,
                                    )
                                    .onGloballyPositioned { layoutCoordinates ->
                                        mapButtonOffset = layoutCoordinates.boundsInWindow().center
                                    },
                                onClick = { onMapClick(mapButtonOffset) },
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Place,
                                    contentDescription = "View on Map",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }

                    Column(
                        modifier = detailsModifier
                            .fillMaxWidth()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color.Black.copy(alpha = 0.34f),
                                        Color.Black.copy(alpha = 0.52f),
                                    ),
                                ),
                            )
                            .padding(navPadding)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = data.title,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.weight(1f),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            data.lifecycleLabel?.let { label ->
                                Box(
                                    modifier = Modifier
                                        .padding(start = 8.dp)
                                        .background(
                                            color = eventLifecycleColor(data.lifecycleTone),
                                            shape = RoundedCornerShape(999.dp),
                                        )
                                        .padding(horizontal = 8.dp, vertical = 3.dp),
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color.White,
                                    )
                                }
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                modifier = Modifier.size(16.dp),
                                painter = rememberVectorPainter(Icons.Default.LocationOn),
                                contentDescription = "Location",
                                tint = Color.White.copy(alpha = 0.82f),
                            )
                            Text(
                                text = data.location,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.82f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = data.dateLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.82f),
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = data.registrationLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.82f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                textAlign = TextAlign.End,
                            )
                        }
                    }
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
        Spacer(modifier = Modifier.height(170.dp))
        PlaceholderLine(
            widthFraction = 0.56f,
            height = 22.dp,
            color = placeholderColor,
            shape = RoundedCornerShape(18.dp)
        )
        PlaceholderLine(widthFraction = 0.72f, height = 16.dp, color = placeholderColor)
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
