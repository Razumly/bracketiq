@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.util.LocalLoadingHandler
import kotlin.time.ExperimentalTime

@Composable
fun SelectEventImage(
    modifier: Modifier = Modifier,
    onSelectedImage: (Event.() -> Event) -> Unit,
    onDeleteImage: (String) -> Unit,
    imageUrls: List<String>,
    onUploadSelected: () -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    val columnCount = 3
    var selected by remember { mutableStateOf<String?>(null) }
    var showUploadError by remember { mutableStateOf<String?>(null) }

    val loadingHandler = LocalLoadingHandler.current
    var isUploading by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        loadingHandler.loadingState.collect { state ->
            isUploading = state.isLoading
        }
    }

    Column(modifier = modifier.wrapContentSize()) {
        if (showUploadError != null) {
            Card(
                modifier = Modifier.fillMaxWidth().padding(8.dp), colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = showUploadError!!,
                    modifier = Modifier.padding(12.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(columnCount),
            modifier = Modifier.wrapContentSize(),
            contentPadding = PaddingValues(4.dp)
        ) {
            // Display existing images
            items(imageUrls) { url ->
                SelectableImageItem(
                    imageUrl = url, isSelected = selected == url, onSelect = {
                        selected = url
                        onSelectedImage {
                            copy(
                                imageUrl = url
                            )
                        }
                    })
            }

            // Add upload button as the last item
            item {
                UploadImageButton(
                    isUploading = isUploading, onUpload = onUploadSelected
                )
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(4.dp), horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            Button(
                onClick = onCancel, colors = ButtonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    disabledContainerColor = MaterialTheme.colorScheme.onSurface,
                    disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                )
            ) {
                Text("Cancel")
            }
            Button(
                onClick = { onDeleteImage(selected!!) }, colors = ButtonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    disabledContainerColor = MaterialTheme.colorScheme.onSurface,
                    disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                ), enabled = selected?.isNotBlank() == true
            ) {
                Text("Delete")
            }
            Button(
                enabled = selected?.isNotBlank() == true, onClick = onConfirm
            ) {
                Text("Confirm")
            }
        }
    }
}

@Composable
private fun SelectableImageItem(
    imageUrl: String, isSelected: Boolean, onSelect: () -> Unit
) {
    val painter = rememberAsyncImagePainter(model = imageUrl)
    val painterState = painter.state

    Box(modifier = Modifier.padding(4.dp).aspectRatio(1f).clip(CardDefaults.shape).let { base ->
        if (isSelected) {
            base.border(
                width = 3.dp, color = MaterialTheme.colorScheme.primary, shape = CardDefaults.shape
            )
        } else base
    }.clickable { onSelect() }) {
        if (painterState.value is AsyncImagePainter.State.Loading) {
            Box(
                modifier = Modifier.fillMaxSize()
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center).size(24.dp)
                )
            }
        }

        Image(
            painter = painter,
            contentDescription = "Event Image",
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
    }
}

@Composable
private fun UploadImageButton(
    isUploading: Boolean, onUpload: () -> Unit
) {
    Card(
        modifier = Modifier.padding(4.dp).aspectRatio(1f)
            .clickable(enabled = !isUploading) { onUpload() }, colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center
        ) {
            if (isUploading) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    Text(
                        text = "Uploading...", style = MaterialTheme.typography.bodySmall
                    )
                }
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.CloudUpload,
                        contentDescription = "Upload Image",
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = "Upload\nPhoto",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}
