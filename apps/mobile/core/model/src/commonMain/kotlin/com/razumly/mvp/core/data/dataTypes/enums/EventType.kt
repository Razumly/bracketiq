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

fun EventType.minimumParticipantCount(): Int = when (this) {
    EventType.TOURNAMENT -> MIN_BRACKET_TEAM_COUNT
    else -> 2
}