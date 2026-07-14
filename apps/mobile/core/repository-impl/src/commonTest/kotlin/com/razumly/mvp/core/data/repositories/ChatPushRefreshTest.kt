package com.razumly.mvp.core.data.repositories

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ChatPushRefreshTest {
    @Test
    fun a_chat_push_refreshes_messages_and_the_targeted_summary() = runTest {
        val refreshedMessages = mutableListOf<String>()
        val refreshedSummaries = mutableListOf<String>()

        refreshChatCachesFromPush(
            topicId = "chat_1",
            refreshMessages = { chatId ->
                refreshedMessages += chatId
                Result.success(emptyList<Any>())
            },
            refreshSummary = { chatId ->
                refreshedSummaries += chatId
                Result.success(Unit)
            },
        )

        assertEquals(listOf("chat_1"), refreshedMessages)
        assertEquals(listOf("chat_1"), refreshedSummaries)
    }

    @Test
    fun a_message_refresh_failure_does_not_suppress_the_summary_refresh() = runTest {
        val refreshedSummaries = mutableListOf<String>()
        val failures = mutableListOf<String>()

        refreshChatCachesFromPush(
            topicId = "chat_1",
            refreshMessages = {
                Result.failure<Unit>(IllegalStateException("messages unavailable"))
            },
            refreshSummary = { chatId ->
                refreshedSummaries += chatId
                Result.success(Unit)
            },
            onFailure = { cacheName, _, _ -> failures += cacheName },
        )

        assertEquals(listOf("chat_1"), refreshedSummaries)
        assertEquals(listOf("messages"), failures)
    }

    @Test
    fun non_chat_topics_do_not_refresh_chat_caches() = runTest {
        var refreshCount = 0

        listOf("user_1", "team_1", "event_1", "tournament_1", "match_1", " ").forEach { topic ->
            refreshChatCachesFromPush(
                topicId = topic,
                refreshMessages = {
                    refreshCount += 1
                    Result.success(Unit)
                },
                refreshSummary = {
                    refreshCount += 1
                    Result.success(Unit)
                },
            )
        }

        assertEquals(0, refreshCount)
        assertTrue("chat_1".toChatGroupTopicIdOrNull() == "chat_1")
    }
}
