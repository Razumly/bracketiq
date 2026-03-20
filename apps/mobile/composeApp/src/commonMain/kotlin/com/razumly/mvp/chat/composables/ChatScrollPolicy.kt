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
