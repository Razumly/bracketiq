package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Canonical-only payloads in this fixture also pass from the exact v1.6.13 tag.
 * Keep them free of Appwrite `$` aliases so the compatibility floor stays
 * executable while the server retires its universal legacy response wrapper.
 */
class CanonicalOnlyContractFloorTest {
    @Test
    fun canonicalOnlyEventKeepsNullableOpenEndAtTheWireBoundary() {
        val dto = jsonMVP.decodeFromString<EventApiDto>(
            """
                {
                  "id": "event-canonical",
                  "name": "Open-ended event",
                  "hostId": "host-1",
                  "start": "2026-07-14T12:00:00Z",
                  "end": null,
                  "noFixedEndDateTime": true
                }
            """.trimIndent(),
        )

        assertEquals("event-canonical", dto.id)
        assertNull(dto.legacyId)
        val event = assertNotNull(dto.toEventOrNull())
        assertEquals(event.start, event.end)
        assertEquals(true, event.noFixedEndDateTime)
    }

    @Test
    fun canonicalOnlyCoreResourcesResolveTheirIds() {
        val team = jsonMVP.decodeFromString<TeamApiDto>(
            """{"id":"team-canonical","name":"Aces"}""",
        ).toTeamOrNull()
        val match = jsonMVP.decodeFromString<MatchApiDto>(
            """{"id":"match-canonical","matchId":7,"eventId":"event-canonical"}""",
        ).toMatchOrNull()
        val user = jsonMVP.decodeFromString<UserProfileDto>(
            """{"id":"user-canonical","createdAt":"2026-07-14T12:00:00Z","updatedAt":"2026-07-14T12:01:00Z"}""",
        ).toUserDataOrNull()

        assertEquals("team-canonical", assertNotNull(team).id)
        assertEquals("match-canonical", assertNotNull(match).id)
        assertEquals("user-canonical", assertNotNull(user).id)
    }
}
