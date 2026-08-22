package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MIN_BRACKET_TEAM_COUNT
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.normalizeAutomatedSchedulingForEventType
import com.razumly.mvp.core.data.dataTypes.syncEventTypeTagsForEventType

internal fun Event.applyCreateSelectionRules(): Event {
    val typeNormalizedEvent = when (eventType) {
        EventType.LEAGUE -> copy(
            eventType = eventType,
            automatedScheduling = normalizeAutomatedSchedulingForEventType(eventType, automatedScheduling),
            teamSignup = true,
        )

        EventType.TOURNAMENT -> copy(
            eventType = eventType,
            automatedScheduling = normalizeAutomatedSchedulingForEventType(eventType, automatedScheduling),
            teamSignup = true,
            maxParticipants = maxParticipants.takeIf { count -> count != 0 } ?: MIN_BRACKET_TEAM_COUNT,
        )

        EventType.WEEKLY_EVENT -> copy(
            eventType = eventType,
            automatedScheduling = normalizeAutomatedSchedulingForEventType(eventType, automatedScheduling),
            singleDivision = false,
            noFixedEndDateTime = false,
        )

        EventType.TRYOUT -> copy(
            eventType = eventType,
            automatedScheduling = normalizeAutomatedSchedulingForEventType(eventType, automatedScheduling),
            teamSignup = false,
            singleDivision = false,
            noFixedEndDateTime = false,
        )

        EventType.EVENT -> copy(
            eventType = eventType,
            automatedScheduling = normalizeAutomatedSchedulingForEventType(eventType, automatedScheduling),
            noFixedEndDateTime = false,
        )
    }
    return typeNormalizedEvent.syncEventTypeTagsForEventType()
}
