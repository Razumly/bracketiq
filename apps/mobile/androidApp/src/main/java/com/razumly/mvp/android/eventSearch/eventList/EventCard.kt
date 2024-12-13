package com.razumly.mvp.android.eventSearch.eventList

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.rememberNavController
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.eventSearch.presentation.EventSearchViewModel
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

@Composable
fun EventCard(
    event: EventAbs,
    onFavoriteClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val viewModel = koinViewModel<EventSearchViewModel>()
    val coroutineScope = rememberCoroutineScope()

    Card(
        modifier = modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth()
            .clickable(onClick = {
                coroutineScope.launch {
                    viewModel.selectEvent(event)
                }
            })
            .background(Color.Transparent),
        elevation = CardDefaults.cardElevation(4.dp)

    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
            ) {
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(event.imageUrl)
                        .build(),
                    contentDescription = "Court Image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )

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
                modifier = Modifier
                    .padding(16.dp)
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
                    text = event.start.toString(),
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = event.price.toString(),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}