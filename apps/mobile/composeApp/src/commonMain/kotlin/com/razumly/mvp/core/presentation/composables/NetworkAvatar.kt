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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImagePainter
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.presentation.util.getImageUrl
import io.ktor.http.encodeURLQueryComponent

private data class AvatarColorScheme(val background: Color, val text: Color)

internal data class NetworkAvatarResolvedSource(
    val fallbackName: String,
    val imageUrl: String?,
)

private val avatarPalette = listOf(
    AvatarColorScheme(background = Color(0xFFDCEAF7), text = Color(0xFF19497A)),
    AvatarColorScheme(background = Color(0xFFE7EDF3), text = Color(0xFF1E2633)),
    AvatarColorScheme(background = Color(0xFFEFE7D1), text = Color(0xFF5B4B1F)),
    AvatarColorScheme(background = Color(0xFFE2EAEC), text = Color(0xFF5E6B78)),
)

@Composable
fun NetworkAvatar(
    displayName: String,
    imageRef: String?,
    size: Dp,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    jerseyNumber: String? = null,
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
    val initialsUrl = remember(resolvedSource.fallbackName, sizePx) {
        buildInitialsAvatarUrl(resolvedSource.fallbackName, sizePx)
    }
    val normalizedImageUrl = resolvedSource.imageUrl
    var imageModel by remember(normalizedImageUrl, initialsUrl) {
        mutableStateOf<String?>(normalizedImageUrl ?: initialsUrl)
    }

    LaunchedEffect(normalizedImageUrl, initialsUrl) {
        imageModel = normalizedImageUrl ?: initialsUrl
    }

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        LocalInitialsAvatar(
            displayName = resolvedSource.fallbackName,
            size = size,
            modifier = Modifier.fillMaxSize(),
        )

        if (!imageModel.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = imageModel,
                contentDescription = contentDescription,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
                onState = { state ->
                    if (state is AsyncImagePainter.State.Error) {
                        imageModel = if (imageModel != initialsUrl) initialsUrl else null
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

private fun buildInitialsAvatarUrl(name: String, sizePx: Int): String =
    buildString {
        append(apiBaseUrl.trimEnd('/'))
        append("/api/avatars/initials?name=")
        append(name.encodeURLQueryComponent())
        append("&size=")
        append(sizePx)
        append("&format=png")
    }

@Composable
private fun LocalInitialsAvatar(
    displayName: String,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val initials = remember(displayName) { computeInitials(displayName) }
    val colors = remember(displayName) { pickColorScheme(displayName) }

    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(colors.background),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            color = colors.text,
            fontWeight = FontWeight.Bold,
            fontSize = (size.value * 0.42f).sp,
            style = MaterialTheme.typography.titleMedium.copy(
                lineHeight = (size.value * 0.42f).sp,
            ),
        )
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

private fun computeInitials(name: String): String {
    val parts = name
        .split(Regex("\\s+"))
        .map { it.trim() }
        .filter { it.isNotEmpty() }

    if (parts.isEmpty()) return "U"
    if (parts.size == 1) {
        return parts[0].take(3).uppercase()
    }
    return parts.take(3)
        .mapNotNull { it.firstOrNull()?.toString() }
        .joinToString(separator = "")
        .uppercase()
}

private fun pickColorScheme(name: String): AvatarColorScheme {
    var hash = 0
    for (character in name) {
        hash = (hash * 31 + character.code) and Int.MAX_VALUE
    }
    return avatarPalette[hash % avatarPalette.size]
}
