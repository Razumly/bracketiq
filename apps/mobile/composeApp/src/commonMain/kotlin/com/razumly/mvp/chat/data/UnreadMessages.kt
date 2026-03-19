package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.dataTypes.ChatGroupWithRelations
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import kotlin.jvm.JvmName

fun MessageMVP.isUnreadFor(userId: String): Boolean =
    this.userId != userId && this.readByIds.none { readUserId -> readUserId == userId }

@JvmName("countUnreadMessagesInMessages")
fun countUnreadMessages(messages: List<MessageMVP>, userId: String): Int =
    messages.count { message -> message.isUnreadFor(userId) }

@JvmName("countUnreadMessagesInChatGroups")
fun countUnreadMessages(chatGroups: List<ChatGroupWithRelations>, userId: String): Int =
    chatGroups.sumOf { group -> countUnreadMessages(group.messages, userId) }
