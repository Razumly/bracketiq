package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventSearchOccurrence
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

@OptIn(kotlin.time.ExperimentalTime::class)
class EventCacheMergeTest {
    @Test
    fun given_cached_restricted_official_when_lossy_catalog_projection_merges_then_assignment_survives() {
        val positions = listOf(
            EventOfficialPosition(
                id = "position-referee",
                name = "Referee",
                count = 1,
                order = 0,
            ),
            EventOfficialPosition(
                id = "position-scorekeeper",
                name = "Scorekeeper",
                count = 1,
                order = 1,
            ),
        )
        val cachedOfficial = EventOfficial(
            id = "stored-event-official-1",
            userId = "official-1",
            positionIds = listOf("position-referee"),
            fieldIds = listOf("field-1"),
            isActive = false,
        )
        val cached = Event(
            id = "event-1",
            officialPositions = positions,
            fieldIds = listOf("field-1", "field-2"),
            officialIds = listOf("official-1"),
            eventOfficials = listOf(cachedOfficial),
        )
        val incoming = Event(
            id = cached.id,
            officialPositions = positions,
            fieldIds = cached.fieldIds,
            officialIds = listOf("official-1"),
            eventOfficials = listOf(
                EventOfficial(
                    id = buildEventOfficialRecordId(cached.id, "official-1"),
                    userId = "official-1",
                    positionIds = positions.map(EventOfficialPosition::id),
                    fieldIds = emptyList(),
                    isActive = true,
                ),
            ),
        )
        val nextOccurrence = EventSearchOccurrence(
            slotId = "slot-1",
            occurrenceDate = "2026-09-01",
            start = Instant.parse("2026-09-01T10:00:00Z"),
            end = Instant.parse("2026-09-01T11:00:00Z"),
            timeZone = "UTC",
        )
        incoming.nextOccurrence = nextOccurrence

        val merged = incoming.withCachedOfficialStateForPartialSnapshot(cached)

        assertEquals(listOf(cachedOfficial.copy(isActive = true)), merged.eventOfficials)
        assertEquals(listOf("official-1"), merged.officialIds)
        assertEquals(nextOccurrence, merged.nextOccurrence)
    }

    @Test
    fun given_authoritative_detailed_officials_when_partial_event_merges_then_incoming_assignment_replaces_cached() {
        val cached = Event(
            id = "event-2",
            officialPositions = listOf(
                EventOfficialPosition("position-referee", "Referee", order = 0),
                EventOfficialPosition("position-scorekeeper", "Scorekeeper", order = 1),
            ),
            fieldIds = listOf("field-1", "field-2"),
            officialIds = listOf("official-1"),
            eventOfficials = listOf(
                EventOfficial(
                    id = "stored-event-official-2",
                    userId = "official-1",
                    positionIds = listOf("position-referee"),
                    fieldIds = listOf("field-1"),
                    isActive = true,
                ),
            ),
        )
        val incomingOfficial = EventOfficial(
            id = buildEventOfficialRecordId(cached.id, "official-1"),
            userId = "official-1",
            positionIds = listOf("position-scorekeeper"),
            fieldIds = listOf("field-2"),
            isActive = false,
        )
        val incoming = Event(
            id = cached.id,
            officialPositions = cached.officialPositions,
            fieldIds = cached.fieldIds,
            officialIds = listOf("official-1"),
            eventOfficials = listOf(incomingOfficial),
        )

        val merged = incoming.withCachedOfficialStateForPartialSnapshot(cached)

        assertEquals(listOf(incomingOfficial), merged.eventOfficials)
        assertEquals(listOf("official-1"), merged.officialIds)
    }
}
