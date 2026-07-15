package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.syncEventTypeTagsForEventType

internal fun Event.applyCreateSelectionRules(): Event {
    val typeNormalizedEvent = when (eventType) {
        EventType.LEAGUE, EventType.TOURNAMENT -> copy(
            eventType = eventType,
            teamSignup = true,
        )

        EventType.WEEKLY_EVENT -> copy(
            eventType = eventType,
        )

        EventType.TRYOUT -> copy(
            eventType = eventType,
            teamSignup = false,
            singleDivision = false,
            noFixedEndDateTime = false,
        )

        EventType.EVENT -> copy(
            eventType = eventType,
            noFixedEndDateTime = false,
        )
    }
    return typeNormalizedEvent.syncEventTypeTagsForEventType()
}
