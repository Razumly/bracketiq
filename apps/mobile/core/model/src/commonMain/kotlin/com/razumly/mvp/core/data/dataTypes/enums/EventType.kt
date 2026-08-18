package com.razumly.mvp.core.data.dataTypes.enums

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