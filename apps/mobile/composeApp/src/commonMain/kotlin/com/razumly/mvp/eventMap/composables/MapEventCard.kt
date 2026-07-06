package com.razumly.mvp.eventMap.composables

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.displayPriceRangeLabel
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.rememberSoftwareRenderedImageModel
import com.razumly.mvp.core.presentation.util.eventTypeWithSportLabel
import com.razumly.mvp.core.presentation.util.getImageUrl

@Composable
fun MapEventCard(
    event: Event,
    imagePainter: Painter? = null,
    loadImageInternally: Boolean = true,
    fallbackImageId: String? = null,
    modifier: Modifier = Modifier
) {
    // Always use info window style - no triangle pointer needed
    Card(
        modifier = modifier
            .width(280.dp)
            .wrapContentHeight(),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        EventCardContent(
            event = event,
            imagePainter = imagePainter,
            loadImageInternally = loadImageInternally,
            fallbackImageId = fallbackImageId,
        )
    }
}

@Composable
fun MapEventCardCarousel(
    events: List<Event>,
    selectedIndex: Int,
    onSelectedIndexChange: (Int) -> Unit,
    onEventSelected: (Event) -> Unit,
    fallbackImageIdForEvent: (Event) -> String?,
    modifier: Modifier = Modifier,
) {
    if (events.isEmpty()) return

    val boundedIndex = selectedIndex.coerceIn(0, events.lastIndex)
    val event = events[boundedIndex]

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MapEventCard(
            event = event,
            fallbackImageId = fallbackImageIdForEvent(event),
            modifier = Modifier.clickable { onEventSelected(event) },
        )

        if (events.size > 1) {
            Row(
                modifier = Modifier
                    .width(280.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.95f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = {
                        val nextIndex = if (boundedIndex == 0) events.lastIndex else boundedIndex - 1
                        onSelectedIndexChange(nextIndex)
                    },
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                        contentDescription = "Previous event",
                    )
                }

                Text(
                    text = "${boundedIndex + 1} / ${events.size}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )

                IconButton(
                    onClick = {
                        val nextIndex = if (boundedIndex == events.lastIndex) 0 else boundedIndex + 1
                        onSelectedIndexChange(nextIndex)
                    },
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = "Next event",
                    )
                }
            }
        }
    }
}

@Composable
fun MapPOICard(
    name: String,
    callToAction: String? = null,
    description: String? = null,
    imageRef: String? = null,
    modifier: Modifier = Modifier
) {
    val hasRichContent = !description.isNullOrBlank() || !imageRef.isNullOrBlank()
    Box(modifier = modifier.width(if (hasRichContent) 260.dp else 200.dp)) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .wrapContentHeight(),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(8.dp)
        ) {
            if (hasRichContent) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, top = 12.dp, end = 12.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    NetworkAvatar(
                        displayName = name,
                        imageRef = imageRef,
                        size = 40.dp,
                        contentDescription = "$name logo",
                        softwareRenderingSafe = true,
                    )
                    Text(
                        text = name,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                description?.takeIf { it.isNotBlank() }?.let { summary ->
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = if (callToAction.isNullOrBlank()) 12.dp else 4.dp),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            } else {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            start = 12.dp,
                            top = 8.dp,
                            end = 12.dp,
                            bottom = if (callToAction.isNullOrBlank()) 8.dp else 2.dp
                        ),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
            }
            if (!callToAction.isNullOrBlank()) {
                Text(
                    text = callToAction,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
fun MapPlaceCard(
    place: MVPPlace,
    callToAction: String? = null,
    modifier: Modifier = Modifier,
) {
    MapPOICard(
        name = place.name,
        callToAction = callToAction,
        description = place.summary,
        imageRef = place.imageRef,
        modifier = modifier,
    )
}

@Composable
fun MapInitialsMarker(
    name: String,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
    contentColor: Color = Color.White,
) {
    Box(
        modifier = modifier
            .size(48.dp)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(backgroundColor)
            .border(3.dp, Color.White, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = remember(name) { mapMarkerInitials(name) },
            color = contentColor,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
fun MapEventMarker(
    event: Event,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
    imagePainter: Painter? = null,
) {
    if (imagePainter == null) {
        MapInitialsMarker(
            name = event.name,
            backgroundColor = backgroundColor,
            modifier = modifier,
        )
        return
    }

    Box(
        modifier = modifier
            .size(50.dp)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(Color.White)
            .border(3.dp, backgroundColor, CircleShape)
            .padding(3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {}
        Image(
            painter = imagePainter,
            contentDescription = "${event.name} marker",
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape),
            contentScale = ContentScale.Crop,
        )
    }
}

@Composable
fun MapEventClusterMarker(
    count: Int,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(54.dp)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(backgroundColor)
            .border(4.dp, Color.White, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = count.coerceAtLeast(2).toString(),
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
fun MapPlaceMarker(
    place: MVPPlace,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
    imagePainter: Painter? = null,
) {
    if (imagePainter == null) {
        MapInitialsMarker(
            name = place.name,
            backgroundColor = backgroundColor,
            modifier = modifier,
        )
        return
    }

    Box(
        modifier = modifier
            .size(50.dp)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(Color.White)
            .border(3.dp, backgroundColor, CircleShape)
            .padding(3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(backgroundColor),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = remember(place.name) { mapMarkerInitials(place.name) },
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
        }
        Image(
            painter = imagePainter,
            contentDescription = "${place.name} marker",
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape),
            contentScale = ContentScale.Crop,
        )
    }
}

@Composable
fun AnimatedMarkerContent(
    isExpanded: Boolean,
    markerContent: @Composable () -> Unit,
    expandedContent: @Composable () -> Unit,
    modifier: Modifier = Modifier
) {
    val animatedScale by animateFloatAsState(
        targetValue = if (isExpanded) 1.1f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        )
    )

    AnimatedContent(
        targetState = isExpanded,
        transitionSpec = {
            scaleIn(
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessLow
                )
            ) togetherWith scaleOut(
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessLow
                )
            )
        }
    ) { expanded ->
        Box(
            modifier = modifier.graphicsLayer {
                scaleX = animatedScale
                scaleY = animatedScale
            }
        ) {
            if (expanded) {
                expandedContent()
            } else {
                markerContent()
            }
        }
    }
}

@Composable
fun MaterialMarker(
    text: String,
    backgroundColor: Color = MaterialTheme.colorScheme.surface,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(40.dp)
            .shadow(4.dp, CircleShape)
            .clip(CircleShape)
            .background(backgroundColor),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun EventCardContent(
    event: Event,
    imagePainter: Painter?,
    loadImageInternally: Boolean,
    fallbackImageId: String?,
) {
    val imageUrl = remember(event.imageId, fallbackImageId, loadImageInternally) {
        if (loadImageInternally) {
            val imageId = event.imageId
                .trim()
                .takeIf { it.isNotBlank() }
                ?: fallbackImageId
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
            imageId?.let { getImageUrl(fileId = it, width = 1120, trim = true) }
        } else {
            null
        }
    }
    val imageModel = rememberSoftwareRenderedImageModel(imageUrl)

    Column(
        modifier = Modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (imagePainter != null) {
            Image(
                painter = imagePainter,
                contentDescription = "${event.name} image",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .background(Color.Black),
                contentScale = ContentScale.Crop,
            )
        } else if (imageModel != null) {
            AsyncImage(
                model = imageModel,
                contentDescription = "${event.name} image",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .background(Color.Black),
                contentScale = ContentScale.Crop,
            )
        }
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
        // Event Name
        Text(
            text = event.name,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )

        Text(
            text = event.eventTypeWithSportLabel(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.fillMaxWidth(),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        Text(
            text = event.location,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        event.description
            .trim()
            .takeIf { it.isNotBlank() && !it.equals(event.location.trim(), ignoreCase = true) }
            ?.let { description ->
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = if (event.teamSignup) "Team registration" else "Individual registration",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.fillMaxWidth()
        )

        // Price
        Text(
            text = event.displayPriceRangeLabel(),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        )
        }
    }
}

private fun mapMarkerInitials(name: String): String {
    val parts = name
        .trim()
        .split(Regex("\\s+"))
        .filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    if (parts.size == 1) return parts.first().take(3).uppercase()
    return parts.take(3)
        .mapNotNull { it.firstOrNull()?.uppercaseChar()?.toString() }
        .joinToString(separator = "")
}
