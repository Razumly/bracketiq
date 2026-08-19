package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MIN_BRACKET_TEAM_COUNT
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_MANUAL
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_ONLINE
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.minimumParticipantCount
import com.razumly.mvp.core.data.dataTypes.withDoTeamsOfficiate
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions

fun Event.hasPaidRegistration(): Boolean = if (singleDivision) {
    priceCents > 0
} else {
    divisionDetails.any { detail -> (detail.price ?: 0) > 0 }
}

fun Event.withSimpleTeamRegistration(enabled: Boolean): Event {
    val teamRegistrationRequired = eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT
    if (enabled || teamRegistrationRequired) {
        return copy(teamSignup = true)
    }
    return withDoTeamsOfficiate(false).copy(
        teamSignup = false,
        teamCheckInMode = TeamCheckInMode.OFF,
        allowMatchRosterEdits = false,
        allowTemporaryMatchPlayers = false,
    )
}

fun Event.withSimplePaidRegistration(enabled: Boolean): Event {
    if (enabled) return this
    return copy(
        priceCents = 0,
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                price = 0,
                allowPaymentPlans = false,
                installmentCount = null,
                installmentDueDates = emptyList(),
                installmentDueRelativeDays = emptyList(),
                installmentAmounts = emptyList(),
            )
        },
        registrationPaymentMode = REGISTRATION_PAYMENT_MODE_ONLINE,
        manualPaymentLinks = emptyList(),
        manualPaymentInstructions = null,
        cancellationRefundHours = null,
        allowPaymentPlans = false,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
    )
}

fun Event.withSimpleManualRegistrationPayments(
    enabled: Boolean,
    paidRegistrationEnabled: Boolean,
): Event {
    if (!enabled || !paidRegistrationEnabled) {
        return copy(
            registrationPaymentMode = REGISTRATION_PAYMENT_MODE_ONLINE,
            manualPaymentLinks = emptyList(),
            manualPaymentInstructions = null,
        )
    }
    return copy(
        registrationPaymentMode = REGISTRATION_PAYMENT_MODE_MANUAL,
        cancellationRefundHours = null,
        allowPaymentPlans = false,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                allowPaymentPlans = false,
                installmentCount = null,
                installmentDueDates = emptyList(),
                installmentDueRelativeDays = emptyList(),
                installmentAmounts = emptyList(),
            )
        },
    )
}

fun Event.withSimpleAutomaticRefunds(
    enabled: Boolean,
    paidRegistrationEnabled: Boolean,
): Event = copy(
    cancellationRefundHours = if (
        enabled && paidRegistrationEnabled && registrationPaymentMode != REGISTRATION_PAYMENT_MODE_MANUAL
    ) {
        cancellationRefundHours ?: 24
    } else {
        null
    },
)

fun Event.withSimplePaymentPlans(
    enabled: Boolean,
    paidRegistrationEnabled: Boolean,
): Event {
    val canEnable = enabled && paidRegistrationEnabled &&
        registrationPaymentMode != REGISTRATION_PAYMENT_MODE_MANUAL
    if (canEnable) return copy(allowPaymentPlans = true)
    return copy(
        allowPaymentPlans = false,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentDueRelativeDays = emptyList(),
        installmentAmounts = emptyList(),
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                allowPaymentPlans = false,
                installmentCount = null,
                installmentDueDates = emptyList(),
                installmentDueRelativeDays = emptyList(),
                installmentAmounts = emptyList(),
            )
        },
    )
}

fun Event.withSimpleSingleDivision(enabled: Boolean): Event {
    if (singleDivision == enabled) return this
    val mergedDetails = mergeDivisionDetailsForDivisions(
        divisions = divisions,
        existingDetails = divisionDetails,
        eventId = id,
    )
    val minimumMaxParticipants = eventType.minimumParticipantCount()
    val resolvedEventPlayoffTeamCount = if (includePlayoffs) {
        playoffTeamCount
            ?: mergedDetails.firstNotNullOfOrNull { detail -> detail.playoffTeamCount }
            ?: MIN_BRACKET_TEAM_COUNT
    } else {
        null
    }
    return copy(
        singleDivision = enabled,
        playoffTeamCount = if (enabled && includePlayoffs) {
            resolvedEventPlayoffTeamCount
        } else {
            playoffTeamCount
        },
        allowTeamSplitDefault = if (enabled) false else allowTeamSplitDefault,
        divisionDetails = mergedDetails.map { detail ->
            if (enabled) {
                detail.copy(
                    price = priceCents.coerceAtLeast(0),
                    maxParticipants = maxParticipants.takeIf { it >= minimumMaxParticipants },
                    playoffTeamCount = if (includePlayoffs) {
                        resolvedEventPlayoffTeamCount
                    } else {
                        null
                    },
                )
            } else {
                detail.copy(
                    playoffTeamCount = if (includePlayoffs) {
                        detail.playoffTeamCount
                            ?: playoffTeamCount
                            ?: MIN_BRACKET_TEAM_COUNT
                    } else {
                        null
                    },
                )
            }
        },
    )
}


fun Event.withSimpleDoubleElimination(enabled: Boolean): Event {
    val nextEnabled = eventType == EventType.TOURNAMENT && enabled
    return copy(
        doubleElimination = nextEnabled,
        loserSetCount = if (nextEnabled) loserSetCount.coerceAtLeast(1) else 1,
        loserBracketPointsToVictory = if (nextEnabled) {
            loserBracketPointsToVictory.ifEmpty { listOf(21) }
        } else {
            emptyList()
        },
        divisionDetails = divisionDetails.map { detail ->
            val config = detail.playoffConfig
            detail.copy(
                playoffConfig = config?.copy(
                    doubleElimination = nextEnabled,
                    loserSetCount = if (nextEnabled) {
                        config.loserSetCount.coerceAtLeast(1)
                    } else {
                        1
                    },
                    loserBracketPointsToVictory = if (nextEnabled) {
                        config.loserBracketPointsToVictory.ifEmpty { listOf(21) }
                    } else {
                        emptyList()
                    },
                ),
            )
        },
    )
}
