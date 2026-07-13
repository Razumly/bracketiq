package com.razumly.mvp.chat.composables

internal fun shouldAutoScrollToLatest(
    isNearBottom: Boolean,
    latestMessageUserId: String?,
    currentUserId: String,
    previousMessageCount: Int,
): Boolean {
    return previousMessageCount == 0 ||
        isNearBottom ||
        latestMessageUserId == currentUserId
}

internal fun isChatListNearBottom(
    lastVisibleItemIndex: Int,
    messageCount: Int,
): Boolean = messageCount == 0 || lastVisibleItemIndex >= messageCount - 2

internal data class ChatScrollUpdate(
    val shouldAutoScroll: Boolean,
    val unseenMessageCount: Int,
)

internal fun resolveChatScrollUpdate(
    previousMessageCount: Int,
    currentMessageCount: Int,
    isNearBottom: Boolean,
    latestMessageUserId: String?,
    currentUserId: String,
    currentUnseenMessageCount: Int,
): ChatScrollUpdate {
    if (currentMessageCount <= previousMessageCount) {
        return ChatScrollUpdate(
            shouldAutoScroll = false,
            unseenMessageCount = currentUnseenMessageCount,
        )
    }
    val shouldAutoScroll = shouldAutoScrollToLatest(
        isNearBottom = isNearBottom,
        latestMessageUserId = latestMessageUserId,
        currentUserId = currentUserId,
        previousMessageCount = previousMessageCount,
    )
    return ChatScrollUpdate(
        shouldAutoScroll = shouldAutoScroll,
        unseenMessageCount = if (shouldAutoScroll) {
            0
        } else {
            currentUnseenMessageCount + (currentMessageCount - previousMessageCount)
        },
    )
}
