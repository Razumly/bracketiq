package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal fun Event.applyCreateSelectionRules(isRentalFlow: Boolean): Event {
    // Rental flows support all event types; keep the selected type intact.
    val normalizedType = if (isRentalFlow) eventType else eventType
    val typeNormalizedEvent = when (normalizedType) {
        EventType.LEAGUE, EventType.TOURNAMENT -> copy(
            eventType = normalizedType,
            teamSignup = true,
        )

        EventType.WEEKLY_EVENT -> copy(
            eventType = normalizedType,
        )

        EventType.EVENT -> copy(
            eventType = normalizedType,
            noFixedEndDateTime = false,
        )
    }
    return typeNormalizedEvent.copy(
        singleDivision = true,
        allowPaymentPlans = false,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentAmounts = emptyList(),
        divisionDetails = typeNormalizedEvent.divisionDetails.map { detail ->
            detail.copy(
                allowPaymentPlans = false,
                installmentCount = null,
                installmentDueDates = emptyList(),
                installmentAmounts = emptyList(),
            )
        },
    )
}
