package com.razumly.mvp.chat.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.util.UIConstants

internal enum class ChatAvatarLayout {
    SINGLE,
    DOUBLE,
    TRIANGLE,
    GRID,
    GRID_WITH_PLUS,
}

internal data class ChatAvatarSource(
    val id: String,
    val displayName: String,
    val imageRef: String?,
)

internal data class ChatAvatarRenderModel(
    val layout: ChatAvatarLayout,
    val sources: List<ChatAvatarSource>,
)

@Composable
fun ChatListAvatar(
    chatGroup: ChatGroupWithRelations,
    currentUserId: String,
    modifier: Modifier = Modifier,
    size: Dp = UIConstants.PROFILE_PICTURE_HEIGHT.dp,
) {
    val model = resolveChatAvatarRenderModel(
        chatGroup = chatGroup,
        currentUserId = currentUserId,
    )
    val tileSize = size / 2
    val quarterSize = size / 4

    Box(modifier = modifier.size(size)) {
        when (model.layout) {
            ChatAvatarLayout.SINGLE -> {
                AvatarTile(
                    source = model.sources.first(),
                    size = size,
                )
            }

            ChatAvatarLayout.DOUBLE -> {
                AvatarTile(
                    source = model.sources[0],
                    size = tileSize,
                    modifier = Modifier.offset(x = 0.dp, y = quarterSize),
                )
                AvatarTile(
                    source = model.sources[1],
                    size = tileSize,
                    modifier = Modifier.offset(x = tileSize, y = quarterSize),
                )
            }

            ChatAvatarLayout.TRIANGLE -> {
                AvatarTile(
                    source = model.sources[0],
                    size = tileSize,
                    modifier = Modifier.offset(x = 0.dp, y = 0.dp),
                )
                AvatarTile(
                    source = model.sources[1],
                    size = tileSize,
                    modifier = Modifier.offset(x = tileSize, y = 0.dp),
                )
                AvatarTile(
                    source = model.sources[2],
                    size = tileSize,
                    modifier = Modifier.offset(x = quarterSize, y = tileSize),
                )
            }

            ChatAvatarLayout.GRID -> {
                AvatarTile(
                    source = model.sources[0],
                    size = tileSize,
                    modifier = Modifier.offset(x = 0.dp, y = 0.dp),
                )
                AvatarTile(
                    source = model.sources[1],
                    size = tileSize,
                    modifier = Modifier.offset(x = tileSize, y = 0.dp),
                )
                AvatarTile(
                    source = model.sources[2],
                    size = tileSize,
                    modifier = Modifier.offset(x = 0.dp, y = tileSize),
                )
                AvatarTile(
                    source = model.sources[3],
                    size = tileSize,
                    modifier = Modifier.offset(x = tileSize, y = tileSize),
                )
            }

            ChatAvatarLayout.GRID_WITH_PLUS -> {
                AvatarTile(
                    source = model.sources[0],
                    size = tileSize,
                    modifier = Modifier.offset(x = 0.dp, y = 0.dp),
                )
                AvatarTile(
                    source = model.sources[1],
                    size = tileSize,
                    modifier = Modifier.offset(x = tileSize, y = 0.dp),
                )
                AvatarTile(
                    source = model.sources[2],
                    size = tileSize,
                    modifier = Modifier.offset(x = 0.dp, y = tileSize),
                )
                PlusTile(
                    size = tileSize,
                    modifier = Modifier.offset(x = tileSize, y = tileSize),
                )
            }
        }
    }
}

internal fun resolveChatAvatarRenderModel(
    chatGroup: ChatGroupWithRelations,
    currentUserId: String,
): ChatAvatarRenderModel {
    val sources = buildAvatarSources(chatGroup, currentUserId)
    return when {
        sources.size <= 1 -> ChatAvatarRenderModel(
            layout = ChatAvatarLayout.SINGLE,
            sources = sources.take(1),
        )

        sources.size == 2 -> ChatAvatarRenderModel(
            layout = ChatAvatarLayout.DOUBLE,
            sources = sources.take(2),
        )

        sources.size == 3 -> ChatAvatarRenderModel(
            layout = ChatAvatarLayout.TRIANGLE,
            sources = sources.take(3),
        )

        sources.size == 4 -> ChatAvatarRenderModel(
            layout = ChatAvatarLayout.GRID,
            sources = sources.take(4),
        )

        else -> ChatAvatarRenderModel(
            layout = ChatAvatarLayout.GRID_WITH_PLUS,
            sources = sources.take(3),
        )
    }
}

private fun buildAvatarSources(
    chatGroup: ChatGroupWithRelations,
    currentUserId: String,
): List<ChatAvatarSource> {
    val teamSource = teamAvatarSource(chatGroup)
    if (teamSource != null) {
        return listOf(teamSource)
    }

    val userSources = userAvatarSources(chatGroup, currentUserId)
    if (userSources.isNotEmpty()) {
        return userSources
    }

    val fallbackName = chatGroup.chatGroup.name.asMeaningfulText()
        ?: chatGroup.chatGroup.displayName.asMeaningfulText()
        ?: "Chat"
    return listOf(
        ChatAvatarSource(
            id = "chat:${chatGroup.chatGroup.id}",
            displayName = fallbackName,
            imageRef = chatGroup.chatGroup.imageUrl.asMeaningfulText(),
        )
    )
}

private fun teamAvatarSource(chatGroup: ChatGroupWithRelations): ChatAvatarSource? {
    val teamId = chatGroup.chatGroup.teamId.asMeaningfulText()
        ?: chatGroup.chatGroup.id
            .takeIf { id -> id.startsWith("team:", ignoreCase = true) }
            ?.substringAfter("team:")
            ?.asMeaningfulText()
        ?: return null
    val displayName = chatGroup.chatGroup.name.asMeaningfulText()
        ?: chatGroup.chatGroup.displayName.asMeaningfulText()
        ?: "Team"

    return ChatAvatarSource(
        id = "team:$teamId",
        displayName = displayName,
        imageRef = chatGroup.chatGroup.imageUrl.asMeaningfulText(),
    )
}

private fun userAvatarSources(
    chatGroup: ChatGroupWithRelations,
    currentUserId: String,
): List<ChatAvatarSource> {
    val usersById = chatGroup.users.associateBy { user -> user.id }
    val orderedUsers = chatGroup.chatGroup.userIds
        .mapNotNull { userId -> usersById[userId] }
        .distinctBy { user -> user.id }
    val fallbackUsers = if (orderedUsers.isNotEmpty()) {
        orderedUsers
    } else {
        chatGroup.users.distinctBy { user -> user.id }
    }
    val otherUsers = fallbackUsers.filterNot { user -> user.id == currentUserId }
    val participants = if (otherUsers.isNotEmpty()) otherUsers else fallbackUsers
    return participants.map { user -> user.toAvatarSource() }
}

private fun UserData.toAvatarSource(): ChatAvatarSource {
    val resolvedName = fullName.asMeaningfulText()
        ?: "$firstName $lastName".asMeaningfulText()
        ?: userName.asMeaningfulText()
        ?: "User"

    return ChatAvatarSource(
        id = id,
        displayName = resolvedName,
        imageRef = imageUrl.asMeaningfulText(),
    )
}

@Composable
private fun AvatarTile(
    source: ChatAvatarSource,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    NetworkAvatar(
        displayName = source.displayName,
        imageRef = source.imageRef,
        size = size,
        contentDescription = "${source.displayName} avatar",
        modifier = modifier,
    )
}

@Composable
private fun PlusTile(
    size: Dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "+",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun String?.asMeaningfulText(): String? =
    this
        ?.trim()
        ?.takeIf { value -> value.isNotEmpty() && !value.equals("null", ignoreCase = true) }
