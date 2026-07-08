package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import coil3.compose.AsyncImagePainter
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getInitialsAvatarUrl

internal data class NetworkAvatarResolvedSource(
    val fallbackName: String,
    val imageUrl: String?,
)

@Composable
fun NetworkAvatar(
    displayName: String,
    imageRef: String?,
    size: Dp,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    jerseyNumber: String? = null,
    softwareRenderingSafe: Boolean = false,
) {
    val sizePx = remember(size) { size.value.toInt().coerceAtLeast(16) }
    val resolvedSource = remember(displayName, imageRef, jerseyNumber, sizePx) {
        resolveNetworkAvatarSource(
            displayName = displayName,
            imageRef = imageRef,
            jerseyNumber = jerseyNumber,
            sizePx = sizePx,
        )
    }
    val normalizedImageUrl = resolvedSource.imageUrl
    val initialsImageUrl = remember(resolvedSource.fallbackName, sizePx) {
        getInitialsAvatarUrl(name = resolvedSource.fallbackName, size = sizePx)
    }
    var imageModel: String? by remember(normalizedImageUrl, initialsImageUrl) {
        mutableStateOf(normalizedImageUrl ?: initialsImageUrl)
    }

    LaunchedEffect(normalizedImageUrl, initialsImageUrl) {
        imageModel = normalizedImageUrl ?: initialsImageUrl
    }

    val renderedImageModel = if (softwareRenderingSafe) {
        rememberSoftwareRenderedImageModel(imageModel)
    } else {
        imageModel
    }

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (renderedImageModel != null) {
            SubcomposeAsyncImage(
                model = renderedImageModel,
                contentDescription = contentDescription,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
                onState = { state ->
                    if (state is AsyncImagePainter.State.Error) {
                        imageModel = if (imageModel != initialsImageUrl) initialsImageUrl else null
                    }
                },
            ) {
                val state by painter.state.collectAsState()
                AnimatedVisibility(
                    visible = state is AsyncImagePainter.State.Success,
                    modifier = Modifier.fillMaxSize(),
                    enter = scaleIn(
                        animationSpec = tween(durationMillis = 250),
                        initialScale = 0.9f,
                    ),
                ) {
                    SubcomposeAsyncImageContent(modifier = Modifier.fillMaxSize())
                }
            }
        }
    }
}

private fun resolveImageRef(imageRef: String?, sizePx: Int): String? {
    val raw = imageRef?.trim().orEmpty()
    if (raw.isBlank()) return null

    return when {
        raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true) -> raw
        raw.startsWith("/") -> "${apiBaseUrl.trimEnd('/')}$raw"
        else -> getImageUrl(fileId = raw, width = sizePx, height = sizePx)
    }
}

internal fun resolveNetworkAvatarSource(
    displayName: String,
    imageRef: String?,
    jerseyNumber: String?,
    sizePx: Int,
): NetworkAvatarResolvedSource {
    val safeName = displayName.trim().ifBlank { "User" }
    val safeJerseyNumber = jerseyNumber?.trim()?.takeIf(String::isNotBlank)

    return NetworkAvatarResolvedSource(
        fallbackName = safeJerseyNumber ?: safeName,
        imageUrl = if (safeJerseyNumber != null) null else resolveImageRef(imageRef, sizePx),
    )
}
