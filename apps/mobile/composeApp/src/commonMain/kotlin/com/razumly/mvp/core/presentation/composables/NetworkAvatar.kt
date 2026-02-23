package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.matchParentSize
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

private val avatarPalette = listOf(
    AvatarColorScheme(background = Color(0xFFFDE68A), text = Color(0xFF92400E)),
    AvatarColorScheme(background = Color(0xFFBFDBFE), text = Color(0xFF1D4ED8)),
    AvatarColorScheme(background = Color(0xFFBBF7D0), text = Color(0xFF166534)),
    AvatarColorScheme(background = Color(0xFFFED7AA), text = Color(0xFF9A3412)),
    AvatarColorScheme(background = Color(0xFFE9D5FF), text = Color(0xFF6B21A8)),
    AvatarColorScheme(background = Color(0xFFFBCFE8), text = Color(0xFF9D174D)),
    AvatarColorScheme(background = Color(0xFFBAE6FD), text = Color(0xFF0C4A6E)),
    AvatarColorScheme(background = Color(0xFFC7D2FE), text = Color(0xFF3730A3)),
)

@Composable
fun NetworkAvatar(
    displayName: String,
    imageRef: String?,
    size: Dp,
    contentDescription: String?,
    modifier: Modifier = Modifier,
) {
    val safeName = remember(displayName) {
        displayName.trim().ifBlank { "User" }
    }
    val sizePx = remember(size) { size.value.toInt().coerceAtLeast(16) }
    val initialsUrl = remember(safeName, sizePx) { buildInitialsAvatarUrl(safeName, sizePx) }
    val normalizedImageUrl = remember(imageRef, sizePx) { resolveImageRef(imageRef, sizePx) }
    var imageModel by remember(normalizedImageUrl, initialsUrl) {
        mutableStateOf(normalizedImageUrl ?: initialsUrl)
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
            displayName = safeName,
            size = size,
            modifier = Modifier.matchParentSize(),
        )

        SubcomposeAsyncImage(
            model = imageModel,
            contentDescription = contentDescription,
            modifier = Modifier
                .matchParentSize()
                .clip(CircleShape),
            contentScale = ContentScale.Crop,
            onState = { state ->
                if (state is AsyncImagePainter.State.Error && imageModel != initialsUrl) {
                    imageModel = initialsUrl
                }
            },
        ) {
            val state by painter.state.collectAsState()
            AnimatedVisibility(
                visible = state is AsyncImagePainter.State.Success,
                modifier = Modifier.matchParentSize(),
                enter = scaleIn(
                    animationSpec = tween(durationMillis = 250),
                    initialScale = 0.9f,
                ),
            ) {
                SubcomposeAsyncImageContent(modifier = Modifier.matchParentSize())
            }
        }
    }
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
            style = MaterialTheme.typography.titleMedium,
        )
    }
}

private fun buildInitialsAvatarUrl(name: String, sizePx: Int): String =
    buildString {
        append(apiBaseUrl.trimEnd('/'))
        append("/api/avatars/initials?name=")
        append(name.encodeURLQueryComponent())
        append("&size=")
        append(sizePx)
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

private fun computeInitials(name: String): String {
    val parts = name
        .split(' ')
        .map { it.trim() }
        .filter { it.isNotEmpty() }

    if (parts.isEmpty()) return "U"
    if (parts.size == 1) {
        return parts[0].take(2).uppercase()
    }
    return "${parts[0].first()}${parts[1].first()}".uppercase()
}

private fun pickColorScheme(name: String): AvatarColorScheme {
    var hash = 0
    for (character in name) {
        hash = (hash * 31 + character.code) and Int.MAX_VALUE
    }
    return avatarPalette[hash % avatarPalette.size]
}
