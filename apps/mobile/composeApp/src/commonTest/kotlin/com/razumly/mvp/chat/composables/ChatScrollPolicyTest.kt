package com.razumly.mvp.chat.composables

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertEquals
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

    @Test
    fun farFromBottomIncomingMessages_accumulate_an_unseen_count_without_scrolling() {
        val firstUpdate = resolveChatScrollUpdate(
            previousMessageCount = 5,
            currentMessageCount = 7,
            isNearBottom = false,
            latestMessageUserId = "other",
            currentUserId = "me",
            currentUnseenMessageCount = 0,
        )
        val secondUpdate = resolveChatScrollUpdate(
            previousMessageCount = 7,
            currentMessageCount = 8,
            isNearBottom = false,
            latestMessageUserId = "other",
            currentUserId = "me",
            currentUnseenMessageCount = firstUpdate.unseenMessageCount,
        )

        assertFalse(firstUpdate.shouldAutoScroll)
        assertEquals(2, firstUpdate.unseenMessageCount)
        assertFalse(secondUpdate.shouldAutoScroll)
        assertEquals(3, secondUpdate.unseenMessageCount)
    }

    @Test
    fun currentUserMessage_clears_existing_unseen_count() {
        val update = resolveChatScrollUpdate(
            previousMessageCount = 5,
            currentMessageCount = 6,
            isNearBottom = false,
            latestMessageUserId = "me",
            currentUserId = "me",
            currentUnseenMessageCount = 3,
        )

        assertTrue(update.shouldAutoScroll)
        assertEquals(0, update.unseenMessageCount)
    }
}
