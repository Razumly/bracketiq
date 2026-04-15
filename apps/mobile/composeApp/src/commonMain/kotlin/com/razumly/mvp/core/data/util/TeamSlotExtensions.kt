package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.isExplicitPlaceholder
import com.razumly.mvp.core.data.dataTypes.enums.EventType

fun Team.isPlaceholderSlot(eventType: EventType): Boolean = when (eventType) {
    EventType.LEAGUE, EventType.TOURNAMENT -> isExplicitPlaceholder() || parentTeamId.isNullOrBlank()
    EventType.EVENT, EventType.WEEKLY_EVENT -> captainId.isBlank()
}

fun Team.isPlaceholderSlot(): Boolean = isExplicitPlaceholder() || captainId.isBlank()
