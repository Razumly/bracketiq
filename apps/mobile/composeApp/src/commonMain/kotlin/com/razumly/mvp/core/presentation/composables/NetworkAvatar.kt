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
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImagePainter
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.presentation.util.getImageUrl

internal data class NetworkAvatarResolvedSource(
    val fallbackText: String,
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
    var imageModel: String? by remember(normalizedImageUrl) {
        mutableStateOf(normalizedImageUrl)
    }
    var imageSucceeded by remember(normalizedImageUrl) {
        mutableStateOf(false)
    }

    LaunchedEffect(normalizedImageUrl) {
        imageModel = normalizedImageUrl
        imageSucceeded = false
    }

    val renderedImageModel = if (softwareRenderingSafe) {
        rememberSoftwareRenderedImageModel(imageModel)
    } else {
        imageModel
    }
    val avatarDescription = contentDescription

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .then(
                if (avatarDescription == null) {
                    Modifier
                } else {
                    Modifier.semantics {
                        this.contentDescription = avatarDescription
                    }
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        val fallbackFontScale = when (resolvedSource.fallbackText.length) {
            0, 1 -> 0.5f
            2 -> 0.42f
            else -> 0.34f
        }
        if (shouldShowLocalAvatarFallback(renderedImageModel != null, imageSucceeded)) {
            Text(
                text = resolvedSource.fallbackText,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = (size.value * fallbackFontScale).coerceAtLeast(8f).sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
        if (renderedImageModel != null) {
            SubcomposeAsyncImage(
                model = renderedImageModel,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
                onState = { state ->
                    when (state) {
                        is AsyncImagePainter.State.Success -> imageSucceeded = true
                        is AsyncImagePainter.State.Error -> {
                            imageSucceeded = false
                            imageModel = null
                        }
                        else -> imageSucceeded = false
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

internal fun shouldShowLocalAvatarFallback(
    hasImageModel: Boolean,
    imageSucceeded: Boolean,
): Boolean = !hasImageModel || !imageSucceeded

private fun resolveImageRef(imageRef: String?, sizePx: Int): String? {
    val raw = imageRef?.trim().orEmpty()
    if (raw.isBlank()) return null
    if (isInitialsAvatarRef(raw)) return null

    return when {
        raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true) -> raw
        raw.startsWith("/") -> "${apiBaseUrl.trimEnd('/')}$raw"
        else -> getImageUrl(fileId = raw, width = sizePx, height = sizePx)
    }
}

private fun isInitialsAvatarRef(value: String): Boolean = value
    .substringBefore('#')
    .substringBefore('?')
    .trimEnd('/')
    .endsWith("/api/avatars/initials", ignoreCase = true)

internal fun resolveNetworkAvatarSource(
    displayName: String,
    imageRef: String?,
    jerseyNumber: String?,
    sizePx: Int,
): NetworkAvatarResolvedSource {
    val safeName = displayName.trim().ifBlank { "User" }
    val safeJerseyNumber = jerseyNumber?.trim()?.takeIf(String::isNotBlank)
    val fallbackName = safeJerseyNumber ?: safeName

    return NetworkAvatarResolvedSource(
        fallbackText = localAvatarText(fallbackName),
        imageUrl = if (safeJerseyNumber != null) null else resolveImageRef(imageRef, sizePx),
    )
}

internal fun localAvatarText(name: String): String {
    val parts = name
        .trim()
        .split(Regex("\\s+"))
        .filter(String::isNotBlank)
    if (parts.isEmpty()) return "U"

    if (parts.size == 1) {
        return parts.first()
            .filter(Char::isLetterOrDigit)
            .take(3)
            .uppercase()
            .ifBlank { "U" }
    }

    return parts
        .take(3)
        .mapNotNull { part ->
            part.firstOrNull(Char::isLetterOrDigit)
        }
        .joinToString(separator = "") { it.uppercaseChar().toString() }
        .ifBlank { "U" }
}
