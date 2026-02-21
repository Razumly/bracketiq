@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

class MatchDtosTest {
    @Test
    fun toMatchOrNull_defaultsLockedToFalse_whenMissingFromPayload() {
        val dto = MatchApiDto(
            id = "match-1",
            matchId = 1,
            eventId = "event-1",
            start = "2026-02-21T10:00:00Z",
        )

        val mapped = dto.toMatchOrNull()

        assertNotNull(mapped)
        assertFalse(mapped.locked)
    }

    @Test
    fun toMatchOrNull_preservesLockedTrue_fromPayload() {
        val dto = MatchApiDto(
            id = "match-2",
            matchId = 2,
            eventId = "event-1",
            start = "2026-02-21T11:00:00Z",
            locked = true,
        )

        val mapped = dto.toMatchOrNull()

        assertNotNull(mapped)
        assertTrue(mapped.locked)
    }

    @Test
    fun toBulkMatchUpdateEntryDto_includesLockedFlag() {
        val match = MatchMVP(
            id = "match-3",
            matchId = 3,
            eventId = "event-1",
            start = Instant.parse("2026-02-21T12:00:00Z"),
            locked = true,
        )

        val dto = match.toBulkMatchUpdateEntryDto()

        assertEquals("match-3", dto.id)
        assertTrue(dto.locked == true)
    }
}

