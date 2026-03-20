package com.razumly.mvp.chat.composables

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChatScrollPolicyTest {
    @Test
    fun nearBottomIncomingMessage_autoScrolls() {
        assertTrue(
            shouldAutoScrollToLatest(
                isNearBottom = true,
                latestMessageUserId = "other",
                currentUserId = "me",
                previousMessageCount = 5,
            )
        )
    }

    @Test
    fun farFromBottomIncomingMessage_doesNotAutoScroll() {
        assertFalse(
            shouldAutoScrollToLatest(
                isNearBottom = false,
                latestMessageUserId = "other",
                currentUserId = "me",
                previousMessageCount = 5,
            )
        )
    }

    @Test
    fun currentUserMessage_autoScrolls() {
        assertTrue(
            shouldAutoScrollToLatest(
                isNearBottom = false,
                latestMessageUserId = "me",
                currentUserId = "me",
                previousMessageCount = 5,
            )
        )
    }
}
