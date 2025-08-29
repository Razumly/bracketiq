package com.razumly.mvp.chat.composables

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.presentation.composables.UnifiedCard
import com.razumly.mvp.core.presentation.util.formatMessageTime
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
@Composable
fun ChatListItem(
    modifier: Modifier = Modifier,
    chatGroup: ChatGroupWithRelations,
) {
    UnifiedCard(
        entity = chatGroup.chatGroup,
        subtitle = chatGroup.messages.lastOrNull()?.body,
        trailingContent = {
            chatGroup.messages.lastOrNull()?.let { message ->
                Text(
                    text = formatMessageTime(message.sentTime),
                    style = MaterialTheme.typography.bodySmall
                )
            }
        },
        modifier = modifier
    )
}
