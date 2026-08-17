package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
internal fun hasEventStarted(
    event: Event,
    now: Instant = Clock.System.now(),
): Boolean = now >= event.start

@OptIn(ExperimentalTime::class)
internal fun hasSelectedEventOrOccurrenceStarted(
    event: Event,
    selectedWeeklyOccurrenceStarted: Boolean,
    now: Instant = Clock.System.now(),
): Boolean {
    if (!isWeeklyParentEvent(event)) {
        return hasEventStarted(event, now)
    }
    return hasSelectedWeeklyOccurrenceStarted(
        isWeeklyParent = true,
        selectedWeeklyOccurrenceStarted = selectedWeeklyOccurrenceStarted,
    )
}

internal fun hasSelectedWeeklyOccurrenceStarted(
    isWeeklyParent: Boolean,
    selectedWeeklyOccurrenceStarted: Boolean,
): Boolean = isWeeklyParent && selectedWeeklyOccurrenceStarted

@OptIn(ExperimentalTime::class)
internal fun isJoinBlockedByStart(
    event: Event,
    selectedWeeklyOccurrenceStarted: Boolean,
    now: Instant = Clock.System.now(),
): Boolean {
    if (isWeeklyParentEvent(event)) {
        return hasSelectedWeeklyOccurrenceStarted(
            isWeeklyParent = true,
            selectedWeeklyOccurrenceStarted = selectedWeeklyOccurrenceStarted,
        )
    }
    if (!hasEventStarted(event, now)) return false
    return event.eventType != EventType.WEEKLY_EVENT
}

internal fun isWeeklyParentEvent(event: Event): Boolean =
    event.eventType == EventType.WEEKLY_EVENT &&
        event.timeSlotIds.any { slotId -> slotId.isNotBlank() }

internal fun participantManagementRoomTarget(
    event: Event,
    occurrence: EventOccurrenceSelection?,
): ParticipantManagementRoomTarget? {
    val eventId = event.id.trim().takeIf(String::isNotBlank) ?: return null
    if (isWeeklyParentEvent(event) && occurrence == null) {
        return null
    }
    return ParticipantManagementRoomTarget(
        eventId = eventId,
        slotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank),
        occurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
        teamSignup = event.teamSignup,
    )
}
