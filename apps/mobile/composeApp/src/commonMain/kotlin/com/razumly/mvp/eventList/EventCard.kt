package com.razumly.mvp.eventList

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.EventAbs
import kotlinx.coroutines.flow.MutableStateFlow
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

    val dateRangeText = remember(event.start, event.end) {
        val dateFormat = LocalDate.Format {
            dayOfMonth()
            char(' ')
            monthName(MonthNames.ENGLISH_ABBREVIATED)
        }

        val startDate = event.start.toLocalDateTime(TimeZone.currentSystemDefault()).date
        val endDate = event.end?.toLocalDateTime(TimeZone.currentSystemDefault())?.date

        val startStr = startDate.format(dateFormat)

        if (endDate != null && startDate != endDate) {
            val endStr = endDate.format(dateFormat)
            "$startStr - $endStr"
        } else {
            startStr
        }
    }

    Card(
        modifier = modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth()
            .background(Color.Transparent),
        elevation = CardDefaults.cardElevation(4.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
            ) {
                AsyncImage(
                    model = event.imageUrl,
                    contentDescription = "Court Image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    onState = { state ->
                        when (state) {
                            is AsyncImagePainter.State.Loading -> {
                                imageStateText = "Loading"
                            }
                            is AsyncImagePainter.State.Error -> {
                                val error = state.result.throwable
                                imageStateText = "Error loading image: $error"
                            }
                            is AsyncImagePainter.State.Success -> {
                                imageStateText = "success"
                            }
                            is AsyncImagePainter.State.Empty -> {
                                imageStateText = "Image is Empty"
                            }
                        }
                    }
                )
                if (imageStateText != "success") {
                    Text(imageStateText, color = Color.White)
                }
                IconButton(
                    onClick = onFavoriteClick,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                ) {
                    Icon(
                        painter = rememberVectorPainter(Icons.Default.Favorite),
                        contentDescription = "Favorite",
                        tint = Color.White
                    )
                }
            }

            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = event.location,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        text = event.rating.toString(),
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                // Could be city + state
                Text(
                    text = event.location,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = event.type,
                    style = MaterialTheme.typography.bodyMedium
                )
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