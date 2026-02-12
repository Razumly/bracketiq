package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal fun Event.applyCreateSelectionRules(isRentalFlow: Boolean): Event {
    val normalizedType = if (isRentalFlow) EventType.EVENT else eventType
    return when (normalizedType) {
        EventType.LEAGUE, EventType.TOURNAMENT -> copy(
            eventType = normalizedType,
            teamSignup = true,
            singleDivision = true,
            end = start,
        )

        EventType.EVENT -> copy(eventType = normalizedType)
    }
}
