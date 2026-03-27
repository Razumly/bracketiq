package com.razumly.mvp.chat.data

import kotlin.time.Instant

data class ChatGroupSummary(
    val unreadCount: Int = 0,
    val lastMessageBody: String? = null,
    val lastMessageSentTime: Instant? = null,
)
