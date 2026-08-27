package com.razumly.mvp.core.data.dataTypes.enums

import com.razumly.mvp.core.data.dataTypes.MIN_BRACKET_TEAM_COUNT

enum class EventType {
    TOURNAMENT,
    EVENT,
    LEAGUE,
    TRYOUT,
    WEEKLY_EVENT,
}

fun EventType.displayLabel(): String = when (this) {
    EventType.EVENT -> "One-Time Event"
    EventType.WEEKLY_EVENT -> "Weekly Event"
    EventType.TOURNAMENT -> "Tournament"
    EventType.LEAGUE -> "League"
    EventType.TRYOUT -> "Tryout"
}

fun defaultAutomatedSchedulingForEventType(eventType: EventType): Boolean = when (eventType) {
    EventType.LEAGUE,
    EventType.TOURNAMENT,
    EventType.WEEKLY_EVENT -> true
    EventType.EVENT,
    EventType.TRYOUT -> false
}

fun EventType.isScheduleConstructionAutomationType(): Boolean =
    this == EventType.LEAGUE || this == EventType.TOURNAMENT

fun normalizeAutomatedSchedulingForEventType(
    eventType: EventType,
    value: Boolean?,
): Boolean = if (defaultAutomatedSchedulingForEventType(eventType)) {
    value ?: true
} else {
    false
}

fun EventType.minimumParticipantCount(): Int = when (this) {
    EventType.TOURNAMENT -> MIN_BRACKET_TEAM_COUNT
    else -> 2
}