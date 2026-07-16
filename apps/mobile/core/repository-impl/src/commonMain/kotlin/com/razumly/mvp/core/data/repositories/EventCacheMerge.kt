package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers

private fun List<DivisionDetail>.preservesConfiguredDivisionDetailsFrom(cached: Event): Boolean {
    if (cached.divisionDetails.isEmpty()) return true
    return cached.divisions.normalizeDivisionIdentifiers().all { cachedDivisionId ->
        val cachedDetail = cached.divisionDetails.firstOrNull { detail ->
            detail.id.normalizeDivisionIdentifier() == cachedDivisionId
        }
        val currentDetail = firstOrNull { detail ->
            detail.id.normalizeDivisionIdentifier() == cachedDivisionId
        }
        cachedDetail == null ||
            (
                currentDetail != null &&
                    (cachedDetail.maxParticipants == null || currentDetail.maxParticipants != null)
                )
    }
}

internal fun Event.withCachedDivisionStateForPartialSnapshot(cached: Event?): Event {
    val cachedDivisions = cached?.divisions?.normalizeDivisionIdentifiers().orEmpty()
    if (cached == null || cachedDivisions.isEmpty()) return this

    val currentDivisions = divisions.normalizeDivisionIdentifiers()
    val hasAllCachedDivisions = cachedDivisions.all { cachedDivisionId ->
        cachedDivisionId in currentDivisions
    }
    val preserveDivisions = !hasAllCachedDivisions
    val preserveDivisionDetails = preserveDivisions ||
        !divisionDetails.preservesConfiguredDivisionDetailsFrom(cached)

    if (!preserveDivisions && !preserveDivisionDetails) return this

    return copy(
        divisions = if (preserveDivisions) cached.divisions else divisions,
        divisionDetails = if (preserveDivisionDetails) cached.divisionDetails else divisionDetails,
    )
}

internal suspend fun DatabaseService.cachePartialEventsPreservingDivisionState(
    events: List<Event>,
): List<Event> {
    if (events.isEmpty()) return emptyList()
    val cachedById = getEventDao
        .getEventsByIds(events.map(Event::id))
        .associateBy(Event::id)
    val mergedEvents = events.map { event ->
        event.withCachedDivisionStateForPartialSnapshot(cachedById[event.id])
    }
    getEventDao.upsertEvents(mergedEvents)
    return mergedEvents
}
