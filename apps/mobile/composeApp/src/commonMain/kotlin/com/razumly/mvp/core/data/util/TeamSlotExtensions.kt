package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.enums.EventType

fun Team.isPlaceholderSlot(eventType: EventType): Boolean = when (eventType) {
    EventType.LEAGUE, EventType.TOURNAMENT -> parentTeamId.isNullOrBlank()
    EventType.EVENT -> captainId.isBlank()
}

fun Team.isPlaceholderSlot(): Boolean = captainId.isBlank()
