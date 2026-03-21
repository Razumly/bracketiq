package com.razumly.mvp.chat.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.chat.data.countUnreadMessages
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.presentation.composables.UnifiedCard
import com.razumly.mvp.core.presentation.util.formatMessageTime
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
@Composable
fun ChatListItem(
    modifier: Modifier = Modifier,
    chatGroup: ChatGroupWithRelations,
    currentUserId: String,
) {
    val avatarModel = resolveChatAvatarRenderModel(
        chatGroup = chatGroup,
        currentUserId = currentUserId,
    )
    val participantNames = chatGroup.users
        .mapNotNull { user -> user.fullName.asMeaningfulText() }
        .distinct()
        .joinToString(", ")
        .asMeaningfulText()
    val displayName = chatGroup.chatGroup.name.asMeaningfulText()
        ?: chatGroup.chatGroup.displayName.asMeaningfulText()
        ?: participantNames
        ?: "Unknown chat"
    val imageUrl = avatarModel.sources.firstOrNull()?.imageRef
    val subtitle = chatGroup.messages.lastOrNull()?.body.asMeaningfulText()
    val unreadCount = countUnreadMessages(chatGroup.messages, currentUserId)
    val unreadBadgeText = if (unreadCount > 99) "99+" else unreadCount.toString()
    val displayChat = chatGroup.chatGroup.copy()
        .setDisplayName(displayName)
        .setImageUrl(imageUrl)

    UnifiedCard(
        entity = displayChat,
        subtitle = subtitle,
        leadingContent = {
            ChatListAvatar(
                chatGroup = chatGroup,
                currentUserId = currentUserId,
            )
        },
        trailingContent = {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                chatGroup.messages.lastOrNull()?.let { message ->
                    Text(
                        text = formatMessageTime(message.sentTime),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (unreadCount > 0) {
                    Badge(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ) {
                        Text(unreadBadgeText)
                    }
                }
            }
        },
        modifier = modifier
    )
}

private fun String?.asMeaningfulText(): String? =
    this
        ?.trim()
        ?.takeIf { value -> value.isNotEmpty() && !value.equals("null", ignoreCase = true) }
