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

        EventType.EVENT -> copy(
            eventType = eventType,
            noFixedEndDateTime = false,
        )
    }
    return typeNormalizedEvent.copy(
        allowPaymentPlans = false,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
        divisionDetails = typeNormalizedEvent.divisionDetails.map { detail ->
            detail.copy(
                allowPaymentPlans = false,
                installmentCount = null,
                installmentDueDates = emptyList(),
                installmentDueRelativeDays = emptyList(),
                installmentAmounts = emptyList(),
            )
        },
    ).syncEventTypeTagsForEventType()
}
