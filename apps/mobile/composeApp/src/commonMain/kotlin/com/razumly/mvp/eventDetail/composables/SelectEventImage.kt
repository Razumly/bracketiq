package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.MVPPlace

@Composable
fun SelectEventImage(
    modifier: Modifier = Modifier,
    selectedPlace: MVPPlace,
    onSelectedImage: (EventImp.() -> EventImp) -> Unit
) {
    val imageUrls = selectedPlace.imageUrls
    val columnCount = 3
    val selected = remember { mutableStateOf<String?>(null) }


    LazyVerticalGrid(
        columns = GridCells.Fixed(columnCount),
        modifier = modifier.wrapContentSize(),
        contentPadding = PaddingValues(4.dp)
    ) {
        items(imageUrls) { url ->
            val painter = rememberAsyncImagePainter(model = url)
            val painterState = painter.state
            Box(modifier = Modifier.padding(4.dp).aspectRatio(1f).let { base ->
                    if (selected.value == url) {
                        base.border(
                            width = 2.dp,
                            color = MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(4.dp)
                        )
                    } else base
                }.clickable {
                    selected.value = url
                    onSelectedImage { copy(imageUrl = url) }
                }) {
                if (painterState.value is AsyncImagePainter.State.Loading) {
                    Box(
                        modifier = Modifier.fillMaxSize()
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
                    )
                }
                Image(
                    painter = painter,
                    contentDescription = "Event Image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }
        }
    }
}