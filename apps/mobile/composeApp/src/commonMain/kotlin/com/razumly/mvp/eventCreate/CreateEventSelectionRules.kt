package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MIN_BRACKET_TEAM_COUNT
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.normalizeAutomatedSchedulingForEventType
import com.razumly.mvp.core.data.dataTypes.syncEventTypeTagsForEventType
import com.razumly.mvp.core.data.dataTypes.withAutomatedScheduling

internal fun Event.applyCreateSelectionRules(): Event {
    val normalizedEvent = withAutomatedScheduling(
        normalizeAutomatedSchedulingForEventType(eventType, isAutomatedScheduling),
    )
    return when (eventType) {
        EventType.LEAGUE -> normalizedEvent.copy(
            teamSignup = true,
        )

        EventType.TOURNAMENT -> normalizedEvent.copy(
            teamSignup = true,
            maxParticipants = maxParticipants.takeIf { count -> count != 0 } ?: MIN_BRACKET_TEAM_COUNT,
        )

        EventType.WEEKLY_EVENT -> normalizedEvent.copy(
            singleDivision = false,
        )

        EventType.TRYOUT -> normalizedEvent.copy(
            teamSignup = false,
            singleDivision = false,
        )

        EventType.EVENT -> normalizedEvent
    }.syncEventTypeTagsForEventType()
}
