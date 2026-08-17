@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.core.LinearEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.discoverPriceRangeLabel
import com.razumly.mvp.core.data.dataTypes.evergreenDateDisplayLabel
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.core.data.dataTypes.isDraftLikeState
import com.razumly.mvp.core.data.dataTypes.isPrivateState
import com.razumly.mvp.core.data.dataTypes.lifecycleStateLabel
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.eventTypeWithSportLabel
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getInitialsAvatarUrl
import com.razumly.mvp.core.util.resolvedTimeZone
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeProgressive
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.hazeEffect
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime

private data class EventLifecycleBadge(
    val label: String,
    val tone: String,
)

private const val EVENT_CARD_IMAGE_WIDTH_PX = 1080
private const val EVENT_CARD_IMAGE_HEIGHT_PX = 1350
private const val EVENT_CARD_ASPECT_RATIO = 1f
private const val EVENT_CARD_HAZE_RAMP_START_FRACTION = 0.12f
internal const val EVENT_CARD_TEST_TAG = "event-card"
internal const val EVENT_CARD_TYPE_PRICE_TEST_TAG = "event-card-type-price"
internal const val EVENT_CARD_DATE_REGISTRATION_TEST_TAG = "event-card-date-registration"
internal const val EVENT_CARD_MAP_TEST_TAG = "event-card-map"

private val EventCardTitleStyle = TextStyle(
    fontSize = 17.sp,
    lineHeight = 22.sp,
    fontWeight = FontWeight.SemiBold,
)

private val EventCardLocationStyle = TextStyle(
    fontSize = 15.sp,
    lineHeight = 20.sp,
)

private val EventCardMetadataStyle = TextStyle(
    fontSize = 12.sp,
    lineHeight = 16.sp,
    fontWeight = FontWeight.Medium,
)

private val EventCardBadgeStyle = TextStyle(
    fontSize = 11.sp,
    lineHeight = 14.sp,
    fontWeight = FontWeight.Bold,
)

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
    val skillLevelLabel: String?,
    val dateLabel: String,
    val priceLabel: String,
    val prizeLabel: String?,
    val lifecycleLabel: String?,
    val lifecycleTone: String?,
)

@OptIn(ExperimentalHazeApi::class)
@Composable
fun EventCard(
    event: Event,
    navPadding: PaddingValues = PaddingValues(),
    showLoadingPlaceholder: Boolean = false,
    fallbackImageId: String? = null,
    imageUrlOverride: String? = null,
    showPublishedLifecycleBadge: Boolean = false,
    onClick: (() -> Unit)? = null,
    onMapClick: (Offset) -> Unit,
) {
    val imageSource = remember(event.name, event.imageId, fallbackImageId, imageUrlOverride) {
        val resolvedSource = resolveEventCardImageSource(
            eventName = event.name,
            eventImageId = event.imageId,
            organizationLogoId = fallbackImageId,
        )
        imageUrlOverride
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { url -> resolvedSource.copy(imageUrl = url) }
            ?: resolvedSource
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
    val cardMetadata = remember(
        event.divisions,
        event.divisionDetails,
        event.eventType,
        event.includePlayoffs,
    ) {
        buildNativeEventCardMetadata(event)
    }
    val lifecycleBadge = remember(event.state, showPublishedLifecycleBadge) {
        when {
            event.isPrivateState() -> EventLifecycleBadge(
                label = event.lifecycleStateLabel(),
                tone = "private",
            )
            event.isDraftLikeState() -> EventLifecycleBadge(
                label = event.lifecycleStateLabel(),
                tone = "draft",
            )
            showPublishedLifecycleBadge && event.lifecycleStateLabel() == "Published" -> EventLifecycleBadge(
                label = event.lifecycleStateLabel(),
                tone = "published",
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
        divisionLabel = cardMetadata.divisionLabel,
        skillLevelLabel = cardMetadata.skillLevelLabel,
        dateLabel = dateRangeText,
        priceLabel = event.discoverPriceRangeLabel(),
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

@OptIn(ExperimentalHazeApi::class)
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
        var mapButtonOffset by remember { mutableStateOf(Offset.Zero) }

        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .aspectRatio(EVENT_CARD_ASPECT_RATIO)
                .testTag(EVENT_CARD_TEST_TAG)
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
                    .matchParentSize(),
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
                val progressiveHazeStartY = with(LocalDensity.current) {
                    maxWidth.toPx() * EVENT_CARD_HAZE_RAMP_START_FRACTION
                }
                val darkeningGradient = Brush.verticalGradient(
                    colorStops = arrayOf(
                        0f to Color.Transparent,
                        0.50f to Color.Transparent,
                        0.58f to Color.Black.copy(alpha = 0.12f),
                        0.66f to Color.Black.copy(alpha = 0.35f),
                        0.76f to Color.Black.copy(alpha = 0.51f),
                        0.88f to Color.Black.copy(alpha = 0.63f),
                        1f to Color.Black.copy(alpha = 0.75f),
                    ),
                )

                AsyncImage(
                    model = activeImageUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .matchParentSize()
                        .hazeEffect(
                            style = HazeStyle(
                                tint = null,
                                blurRadius = 26.dp,
                                noiseFactor = 0.04f,
                            ),
                        ) {
                            inputScale = HazeInputScale.Fixed(0.5f)
                            progressive = HazeProgressive.verticalGradient(
                                easing = LinearEasing,
                                startY = progressiveHazeStartY,
                                startIntensity = 0.12f,
                                endIntensity = 1f,
                            )
                        },
                    contentScale = ContentScale.Crop,
                )

                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(darkeningGradient),
                )

                Column(
                    modifier = Modifier.fillMaxSize(),
                ) {
                    Spacer(modifier = Modifier.weight(1f))

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(navPadding)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = data.title,
                                style = EventCardTitleStyle,
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
                                        style = EventCardBadgeStyle,
                                        color = Color.White,
                                    )
                                }
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
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
                                    style = EventCardLocationStyle,
                                    color = Color.White.copy(alpha = 0.82f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }

                            Row(
                                modifier = Modifier
                                    .testTag(EVENT_CARD_MAP_TEST_TAG)
                                    .onGloballyPositioned { layoutCoordinates ->
                                        mapButtonOffset = layoutCoordinates.boundsInWindow().center
                                    }
                                    .background(
                                        color = Color.White.copy(alpha = 0.14f),
                                        shape = RoundedCornerShape(999.dp),
                                    )
                                    .clickable { onMapClick(mapButtonOffset) }
                                    .padding(horizontal = 8.dp, vertical = 5.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Map,
                                    contentDescription = "View on Map",
                                    modifier = Modifier.size(14.dp),
                                    tint = Color.White,
                                )
                                Text(
                                    text = "Map",
                                    style = EventCardMetadataStyle,
                                    color = Color.White,
                                )
                            }
                        }

                        Text(
                            text = listOfNotNull(
                                data.divisionLabel.takeIf(String::isNotBlank),
                                data.skillLevelLabel?.takeIf(String::isNotBlank),
                            ).joinToString(separator = "  ·  "),
                            style = EventCardMetadataStyle,
                            color = Color.White.copy(alpha = 0.9f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag(EVENT_CARD_DATE_REGISTRATION_TEST_TAG),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                Icon(
                                    imageVector = Icons.Default.DateRange,
                                    contentDescription = "Date",
                                    modifier = Modifier
                                        .padding(top = 1.dp)
                                        .size(14.dp),
                                    tint = Color.White.copy(alpha = 0.82f),
                                )
                                Text(
                                    text = data.dateLabel,
                                    style = EventCardMetadataStyle,
                                    color = Color.White.copy(alpha = 0.82f),
                                    modifier = Modifier.weight(1f),
                                    maxLines = 4,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Text(
                                text = data.registrationLabel,
                                style = EventCardMetadataStyle,
                                color = Color.White.copy(alpha = 0.82f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                textAlign = TextAlign.End,
                            )
                        }

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag(EVENT_CARD_TYPE_PRICE_TEST_TAG),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = data.eventTypeLabel,
                                style = EventCardMetadataStyle,
                                color = Color.White.copy(alpha = 0.82f),
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Box(
                                modifier = Modifier
                                    .background(
                                        color = Color(0xFF16A34A),
                                        shape = RoundedCornerShape(999.dp),
                                    )
                                    .padding(horizontal = 8.dp, vertical = 3.dp),
                            ) {
                                Text(
                                    text = data.priceLabel,
                                    style = EventCardMetadataStyle,
                                    color = Color.White,
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
}

private fun eventLifecycleColor(tone: String?): Color =
    when (tone) {
        "private" -> Color(0xFF1565C0)
        "draft" -> Color(0xFFD32F2F)
        "published" -> Color(0xFF16A34A)
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
            .fillMaxWidth()
            .aspectRatio(EVENT_CARD_ASPECT_RATIO)
            .padding(navPadding)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Spacer(modifier = Modifier.weight(1f))
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
