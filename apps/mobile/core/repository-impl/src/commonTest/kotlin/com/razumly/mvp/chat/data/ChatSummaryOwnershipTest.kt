package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.dataTypes.ChatGroupSummary
import kotlin.test.Test
import kotlin.test.assertEquals

class ChatSummaryOwnershipTest {
    private val initialSummary = ChatGroupSummary(unreadCount = 2, lastMessageBody = "Initial")
    private val updatedSummary = ChatGroupSummary(unreadCount = 3, lastMessageBody = "Updated")

    @Test
    fun summaries_are_hidden_immediately_when_the_current_user_changes() {
        val snapshot = OwnedChatSummaries(
            userId = "user_a",
            summaries = mapOf("chat_1" to initialSummary),
        )

        assertEquals(snapshot.summaries, visibleChatSummaries(snapshot, "user_a"))
        assertEquals(emptyMap(), visibleChatSummaries(snapshot, "user_b"))
        assertEquals(emptyMap(), visibleChatSummaries(snapshot, null))
    }

    @Test
    fun a_late_full_refresh_cannot_publish_another_users_summaries() {
        val currentSnapshot = OwnedChatSummaries(
            userId = "user_b",
            summaries = mapOf("chat_b" to updatedSummary),
        )

        val result = replaceChatSummariesIfCurrent(
            snapshot = currentSnapshot,
            requestUserId = "user_a",
            currentUserId = "user_b",
            summaries = mapOf("chat_a" to initialSummary),
        )

        assertEquals(currentSnapshot, result)
    }

    @Test
    fun a_late_targeted_refresh_cannot_merge_into_the_new_users_snapshot() {
        val currentSnapshot = OwnedChatSummaries(
            userId = "user_b",
            summaries = mapOf("chat_b" to updatedSummary),
        )

        val result = mergeChatSummaryIfCurrent(
            snapshot = currentSnapshot,
            requestUserId = "user_a",
            currentUserId = "user_b",
            chatGroupId = "chat_a",
            summary = initialSummary,
        )

        assertEquals(currentSnapshot, result)
    }

    @Test
    fun a_current_targeted_refresh_merges_with_the_current_users_summaries() {
        val snapshot = OwnedChatSummaries(
            userId = "user_a",
            summaries = mapOf("chat_1" to initialSummary),
        )

        val result = mergeChatSummaryIfCurrent(
            snapshot = snapshot,
            requestUserId = "user_a",
            currentUserId = "user_a",
            chatGroupId = "chat_2",
            summary = updatedSummary,
        )

        assertEquals(
            mapOf("chat_1" to initialSummary, "chat_2" to updatedSummary),
            result.summaries,
        )
        assertEquals(false, result.isComplete)
    }

    @Test
    fun a_partial_targeted_cache_falls_back_to_room_unread_counts_for_other_chats() {
        val partialSnapshot = OwnedChatSummaries(
            userId = "user_a",
            summaries = mapOf("chat_1" to updatedSummary),
            isComplete = false,
        )

        val total = resolveTotalUnreadCount(
            snapshot = partialSnapshot,
            currentUserId = "user_a",
            localUnreadByChatId = mapOf(
                "chat_1" to 1,
                "chat_2" to 4,
            ),
        )

        assertEquals(7, total)
    }

    @Test
    fun a_targeted_summary_for_a_chat_not_yet_in_room_is_still_counted() {
        val partialSnapshot = OwnedChatSummaries(
            userId = "user_a",
            summaries = mapOf("new_chat" to updatedSummary),
            isComplete = false,
        )

        val total = resolveTotalUnreadCount(
            snapshot = partialSnapshot,
            currentUserId = "user_a",
            localUnreadByChatId = mapOf("cached_chat" to 2),
        )

        assertEquals(5, total)
    }

    @Test
    fun a_complete_server_snapshot_is_authoritative_over_room_counts() {
        val completeSnapshot = replaceChatSummariesIfCurrent(
            snapshot = OwnedChatSummaries(),
            requestUserId = "user_a",
            currentUserId = "user_a",
            summaries = mapOf("chat_1" to updatedSummary),
        )

        val total = resolveTotalUnreadCount(
            snapshot = completeSnapshot,
            currentUserId = "user_a",
            localUnreadByChatId = mapOf("chat_1" to 1, "stale_chat" to 9),
        )

        assertEquals(true, completeSnapshot.isComplete)
        assertEquals(3, total)
    }
}
