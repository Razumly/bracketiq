package com.razumly.mvp.eventList.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Card
import androidx.compose.material3.CardColors
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.presentation.disabledCardColor
import com.razumly.mvp.eventList.util.TextPatterns
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.format.MonthNames
import kotlinx.datetime.format.char
import kotlinx.datetime.toLocalDateTime

@Composable
fun EventCard(
    event: EventAbs,
    onFavoriteClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var imageStateText by remember { mutableStateOf("initial") }
    val patterns = TextPatterns(event.name)

    val dateRangeText = remember(event.start, event.end) {
        val dateFormat = LocalDate.Format {
            dayOfMonth()
            char(' ')
            monthName(MonthNames.ENGLISH_ABBREVIATED)
        }

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
    val cardColors = CardColors(
        containerColor = MaterialTheme.colorScheme.background,
        contentColor = MaterialTheme.colorScheme.onBackground,
        disabledContainerColor = disabledCardColor,
        disabledContentColor = disabledCardColor
    )
    Card(
        modifier = modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth(),
        elevation = CardDefaults.cardElevation(4.dp),
        colors = cardColors,
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            // Image Section with Favorite Button
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
            ) {
                AsyncImage(
                    model = event.imageUrl,
                    contentDescription = "Event Image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    onState = { state ->
                        imageStateText = when (state) {
                            is AsyncImagePainter.State.Loading -> "Loading"
                            is AsyncImagePainter.State.Error ->
                                "Error loading image: ${state.result.throwable}"
                            is AsyncImagePainter.State.Success -> "success"
                            is AsyncImagePainter.State.Empty -> "Image is Empty"
                        }
                    }
                )
                if (imageStateText != "success") {
                    Text(imageStateText)
                }
                IconButton(
                    onClick = onFavoriteClick,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                ) {
                    Icon(
                        painter = rememberVectorPainter(Icons.Default.AddCircle),
                        contentDescription = "Favorite",
                    )
                }
            }

            // Event Details Section
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = event.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = event.rating.toString(),
                        style = MaterialTheme.typography.titleMedium
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
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = event.location,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Text(
                    text = "${event.type} Tournament",
                    style = MaterialTheme.typography.bodyMedium
                )
                StylizedText(event.description, patterns)

                HorizontalDivider(thickness = 2.dp)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = dateRangeText,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "$${event.price}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}
