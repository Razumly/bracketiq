package com.razumly.mvp.core.presentation

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AppConfigSerializationTest {
    private val json = Json { encodeDefaults = true }

    @Test
    fun restored_destinations_persist_only_stable_navigation_ids() {
        val eventDetail = AppConfig.EventDetail(
            eventId = "event_1",
            initialTab = EventDetailInitialTab.SCHEDULE,
        )
        val matchDetail = AppConfig.MatchDetail(
            matchId = "match_1",
            eventId = "event_1",
        )
        val chat = AppConfig.Chat(
            messageUserId = "user_1",
            chatId = "chat_1",
        )
        val teams = AppConfig.Teams(
            freeAgentIds = listOf("user_2"),
            eventId = "event_1",
            selectedFreeAgentId = "user_2",
        )

        assertIdOnlyRoundTrip(eventDetail) { encoded ->
            assertTrue(encoded.contains("\"eventId\":\"event_1\""))
            assertFalse(encoded.contains("\"event\":"))
        }
        assertIdOnlyRoundTrip(matchDetail) { encoded ->
            assertTrue(encoded.contains("\"matchId\":\"match_1\""))
            assertTrue(encoded.contains("\"eventId\":\"event_1\""))
            assertFalse(encoded.contains("\"match\":"))
            assertFalse(encoded.contains("\"event\":"))
        }
        assertIdOnlyRoundTrip(chat) { encoded ->
            assertTrue(encoded.contains("\"messageUserId\":\"user_1\""))
            assertTrue(encoded.contains("\"chatId\":\"chat_1\""))
            assertFalse(encoded.contains("\"user\":"))
            assertFalse(encoded.contains("\"chat\":"))
        }
        assertIdOnlyRoundTrip(teams) { encoded ->
            assertTrue(encoded.contains("\"freeAgentIds\":[\"user_2\"]"))
            assertTrue(encoded.contains("\"eventId\":\"event_1\""))
            assertFalse(encoded.contains("\"event\":"))
        }
    }

    private fun assertIdOnlyRoundTrip(
        configuration: AppConfig,
        assertEncoding: (String) -> Unit,
    ) {
        val encoded = json.encodeToString(AppConfig.serializer(), configuration)

        assertEquals(
            configuration,
            json.decodeFromString(AppConfig.serializer(), encoded),
        )
        assertEncoding(encoded)
    }
}
