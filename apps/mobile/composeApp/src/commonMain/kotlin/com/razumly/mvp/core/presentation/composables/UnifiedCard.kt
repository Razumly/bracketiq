package com.razumly.mvp.core.presentation.composables

import androidx.compose.animation.core.tween
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import com.razumly.mvp.core.data.dataTypes.DisplayableEntity
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.UIConstants
import com.razumly.mvp.core.util.projectId
import io.ktor.http.URLBuilder
import io.ktor.http.URLProtocol

@Composable
fun UnifiedCard(
    entity: DisplayableEntity,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trailingContent: @Composable (() -> Unit)? = null,
    isPending: Boolean = false
) {
    val initialsUrl = URLBuilder().apply {
        protocol = URLProtocol.HTTPS
        host = "cloud.appwrite.io"
        pathSegments = listOf("v1", "avatars", "initials")
        parameters.append("name", entity.displayName)
        parameters.append("width", UIConstants.PROFILE_PICTURE_HEIGHT.toString())
        parameters.append("height", UIConstants.PROFILE_PICTURE_HEIGHT.toString())
        parameters.append("project", projectId)
    }.buildString()

    val imageUrl = entity.imageUrl ?: initialsUrl

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Profile image with animation
            Box(
                modifier = Modifier
                    .size(UIConstants.PROFILE_PICTURE_HEIGHT.dp)
                    .clip(CircleShape),
                contentAlignment = Alignment.Center
            ) {
                SubcomposeAsyncImage(
                    model = imageUrl,
                    contentDescription = "${entity.displayName} Image",
                    modifier = Modifier
                        .size(UIConstants.PROFILE_PICTURE_HEIGHT.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                ) {
                    val state by painter.state.collectAsState()
                    androidx.compose.animation.AnimatedVisibility(
                        visible = state is AsyncImagePainter.State.Success || state is AsyncImagePainter.State.Error,
                        modifier = Modifier.clip(CircleShape),
                        enter = scaleIn(
                            animationSpec = tween(durationMillis = 300),
                            initialScale = 0.8f
                        )
                    ) {
                        SubcomposeAsyncImageContent(modifier = Modifier
                            .clip(CircleShape))
                    }
                }
            }

            // Content
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = entity.displayName.toTitleCase(),
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )

                // Subtitle (for pending status, last message, etc.)
                subtitle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 1
                    )
                }

                if (isPending) {
                    Text(
                        text = "Invite Sent",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Trailing content (timestamp, actions, etc.)
            trailingContent?.invoke()
        }

        // Horizontal divider
        HorizontalDivider(
            modifier = Modifier.padding(start = UIConstants.PROFILE_PICTURE_HEIGHT.dp + 32.dp),
            color = MaterialTheme.colorScheme.outlineVariant,
            thickness = 0.5.dp
        )
    }
}
