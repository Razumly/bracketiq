package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import kotlinx.datetime.LocalDate
internal fun validatePaymentPlans(
    event: Event,
    divisionDetails: List<DivisionDetail> = emptyList(),
): List<String> {
    fun validatePlan(
        label: String,
        priceCents: Int,
        allowPaymentPlans: Boolean,
        installmentCount: Int?,
        installmentAmounts: List<Int>,
        installmentDueDates: List<String>,
    ): List<String> {
        if (!allowPaymentPlans) return emptyList()

        val errors = mutableListOf<String>()
        val normalizedAmounts = installmentAmounts.map { amount -> amount.coerceAtLeast(0) }
        val normalizedDueDates = installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val normalizedCount = maxOf(
            installmentCount ?: 0,
            normalizedAmounts.size,
            normalizedDueDates.size,
        )

        if (priceCents <= 0) {
            errors += "$label: set a price greater than 0 before enabling payment plans."
        }
        if (normalizedCount <= 0) {
            errors += "$label: installment count must be at least 1 when payment plans are enabled."
        }
        if (normalizedAmounts.size != normalizedCount) {
            errors += "$label: installment count must match installment amounts."
        }
        if (normalizedDueDates.size != normalizedCount) {
            errors += "$label: installment count must match installment due dates."
        }

        val parsedDueDates = normalizedDueDates.mapIndexed { index, dueDate ->
            runCatching { LocalDate.parse(dueDate) }
                .getOrElse {
                    errors += "$label: installment ${index + 1} due date must use YYYY-MM-DD."
                    null
                }
        }
        if (parsedDueDates.filterNotNull().zipWithNext().any { (previous, next) -> next < previous }) {
            errors += "$label: installment due dates must be in chronological order."
        }

        if (normalizedAmounts.sum() != priceCents) {
            errors += "$label: installment total must equal the configured price."
        }

        return errors
    }

    if (event.singleDivision) {
        return validatePlan(
            label = "Payment plan",
            priceCents = event.priceCents.coerceAtLeast(0),
            allowPaymentPlans = event.allowPaymentPlans == true,
            installmentCount = event.installmentCount,
            installmentAmounts = event.installmentAmounts,
            installmentDueDates = event.installmentDueDates,
        ).distinct()
    }

    val errors = mutableListOf<String>()
    errors += validatePlan(
        label = "Default payment plan",
        priceCents = event.priceCents.coerceAtLeast(0),
        allowPaymentPlans = event.allowPaymentPlans == true,
        installmentCount = event.installmentCount,
        installmentAmounts = event.installmentAmounts,
        installmentDueDates = event.installmentDueDates,
    )

    divisionDetails.forEach { detail ->
        val detailName = detail.name.trim().ifBlank { detail.id }
        errors += validatePlan(
            label = "Division \"$detailName\" payment plan",
            priceCents = (detail.price ?: event.priceCents).coerceAtLeast(0),
            allowPaymentPlans = detail.allowPaymentPlans == true,
            installmentCount = detail.installmentCount,
            installmentAmounts = detail.installmentAmounts,
            installmentDueDates = detail.installmentDueDates,
        )
    }

    return errors.distinct()
}

internal data class EventValidationResult(
    val isNameValid: Boolean,
    val isPriceValid: Boolean,
    val isMaxParticipantsValid: Boolean,
    val isTeamSizeValid: Boolean,
    val isWinnerSetCountValid: Boolean,
    val isLoserSetCountValid: Boolean,
    val isWinnerPointsValid: Boolean,
    val isLoserPointsValid: Boolean,
    val isLocationValid: Boolean,
    val isFieldCountValid: Boolean,
    val isLeagueGamesValid: Boolean,
    val isLeagueDurationValid: Boolean,
    val isLeaguePointsValid: Boolean,
    val isLeaguePlayoffTeamsValid: Boolean,
    val isLeagueSlotsValid: Boolean,
    val isSkillLevelValid: Boolean,
    val isSportValid: Boolean,
    val isFixedEndDateRangeValid: Boolean,
    val isPaymentPlansValid: Boolean,
    val paymentPlanValidationErrors: List<String>,
    val validationErrors: List<String>,
    val isValid: Boolean,
)

internal fun computeEventValidationResult(
    editEvent: Event,
    isNewEvent: Boolean,
    fieldCount: Int,
    leagueTimeSlots: List<TimeSlot>,
    leagueSlotErrors: Map<Int, String>,
    slotEditorEnabled: Boolean,
    divisionDetailsForSettings: List<DivisionDetail>,
    isColorLoaded: Boolean,
    scheduleTimeLocked: Boolean,
): EventValidationResult {
    val isNameValid = editEvent.name.isNotBlank()
    val isPriceValid = editEvent.priceCents >= 0
    val isMaxParticipantsValid = editEvent.maxParticipants > 1
    val isTeamSizeValid = editEvent.teamSizeLimit >= 1
    val isLocationValid = editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0
    val isSkillLevelValid = editEvent.eventType == EventType.LEAGUE || editEvent.divisions.isNotEmpty()
    val isSportValid = !isNewEvent || !editEvent.sportId.isNullOrBlank()
    val requiresFixedEndValidation = requiresFixedEndRangeValidation(
        event = editEvent,
        scheduleTimeLocked = scheduleTimeLocked,
    )
    val isFixedEndDateRangeValid = !requiresFixedEndValidation || editEvent.end > editEvent.start
    val isLeagueSlotsValid = if (
        requiresScheduleInputValidation(
            eventType = editEvent.eventType,
            isNewEvent = isNewEvent,
            scheduleTimeLocked = scheduleTimeLocked,
            slotEditorEnabled = slotEditorEnabled,
        )
    ) {
        leagueTimeSlots.isNotEmpty() && leagueSlotErrors.isEmpty()
    } else {
        true
    }

    val isFieldCountValid = if (
        requiresFieldCountValidation(
            eventType = editEvent.eventType,
            scheduleTimeLocked = scheduleTimeLocked,
        )
    ) {
        fieldCount > 0
    } else {
        true
    }

    val isWinnerSetCountValid: Boolean
    val isLoserSetCountValid: Boolean
    val isWinnerPointsValid: Boolean
    val isLoserPointsValid: Boolean
    if (editEvent.eventType == EventType.TOURNAMENT) {
        isWinnerSetCountValid = editEvent.winnerSetCount in setOf(1, 3, 5)
        isWinnerPointsValid = editEvent.winnerBracketPointsToVictory.size >= editEvent.winnerSetCount &&
            editEvent.winnerBracketPointsToVictory.take(editEvent.winnerSetCount).all { it > 0 }
        if (editEvent.doubleElimination) {
            isLoserSetCountValid = editEvent.loserSetCount in setOf(1, 3, 5)
            isLoserPointsValid = editEvent.loserBracketPointsToVictory.size >= editEvent.loserSetCount &&
                editEvent.loserBracketPointsToVictory.take(editEvent.loserSetCount).all { it > 0 }
        } else {
            isLoserSetCountValid = true
            isLoserPointsValid = true
        }
    } else {
        isWinnerSetCountValid = true
        isWinnerPointsValid = true
        isLoserSetCountValid = true
        isLoserPointsValid = true
    }

    val isLeagueGamesValid: Boolean
    val isLeaguePlayoffTeamsValid: Boolean
    val isLeaguePointsValid: Boolean
    val isLeagueDurationValid: Boolean
    if (editEvent.eventType == EventType.LEAGUE) {
        val setCount = when (editEvent.setsPerMatch) {
            1, 3, 5 -> editEvent.setsPerMatch
            else -> null
        }
        isLeagueGamesValid = (editEvent.gamesPerOpponent ?: 1) >= 1
        isLeaguePlayoffTeamsValid = if (!editEvent.includePlayoffs) {
            true
        } else {
            val hasEventPlayoffCount = (editEvent.playoffTeamCount ?: 0) >= 2
            val details = mergeDivisionDetailsForDivisions(
                divisions = editEvent.divisions,
                existingDetails = editEvent.divisionDetails,
                eventId = editEvent.id,
            )
            hasEventPlayoffCount && (
                editEvent.singleDivision ||
                    (details.isNotEmpty() && details.all { detail -> (detail.playoffTeamCount ?: 0) >= 2 })
                )
        }
        if (editEvent.usesSets) {
            isLeagueDurationValid = setCount != null && (editEvent.setDurationMinutes ?: 0) >= 5
            isLeaguePointsValid = setCount != null &&
                editEvent.pointsToVictory.size >= setCount &&
                editEvent.pointsToVictory.take(setCount).all { it > 0 }
        } else {
            isLeagueDurationValid = (editEvent.matchDurationMinutes ?: 0) >= 15
            isLeaguePointsValid = true
        }
    } else if (editEvent.eventType == EventType.TOURNAMENT) {
        isLeagueGamesValid = true
        isLeaguePlayoffTeamsValid = true
        isLeaguePointsValid = true
        isLeagueDurationValid = if (editEvent.usesSets) {
            (editEvent.setDurationMinutes ?: 0) >= 5
        } else {
            (editEvent.matchDurationMinutes ?: 0) >= 15
        }
    } else {
        isLeagueGamesValid = true
        isLeagueDurationValid = true
        isLeaguePointsValid = true
        isLeaguePlayoffTeamsValid = true
    }

    val paymentPlanValidationErrors = validatePaymentPlans(
        event = editEvent,
        divisionDetails = divisionDetailsForSettings,
    )
    val isPaymentPlansValid = paymentPlanValidationErrors.isEmpty()

    val isValid = isPriceValid &&
        isMaxParticipantsValid &&
        isTeamSizeValid &&
        isWinnerSetCountValid &&
        isWinnerPointsValid &&
        isLoserSetCountValid &&
        isLoserPointsValid &&
        isLocationValid &&
        isSkillLevelValid &&
        isFieldCountValid &&
        isLeagueGamesValid &&
        isLeagueDurationValid &&
        isLeaguePointsValid &&
        isLeaguePlayoffTeamsValid &&
        isLeagueSlotsValid &&
        isFixedEndDateRangeValid &&
        isSportValid &&
        isPaymentPlansValid &&
        isColorLoaded

    val validationErrors = buildList {
        if (!isNameValid) {
            add("Event name is required.")
        }
        if (!isSportValid) {
            add("Select a sport to continue.")
        }
        if (!scheduleTimeLocked && !isFixedEndDateRangeValid) {
            add("End date/time must be after start date/time when no fixed end datetime scheduling is disabled.")
        }
        if (!isPriceValid) {
            add("Price must be 0 or higher.")
        }
        if (!isMaxParticipantsValid) {
            add(
                if (editEvent.teamSignup) {
                    "Max teams must be at least 2."
                } else {
                    "Max participants must be at least 2."
                },
            )
        }
        if (!isTeamSizeValid) {
            add("Team size must be at least 1.")
        }
        if (!isSkillLevelValid) {
            add("Add at least one division.")
        }
        if (!isLocationValid) {
            add("Select a location.")
        }
        if (!scheduleTimeLocked && !isFieldCountValid) {
            add("Field count must be at least 1.")
        }
        if (!isWinnerSetCountValid) {
            add("Winner set count must be 1, 3, or 5.")
        }
        if (!isWinnerPointsValid) {
            add("Winner points must be greater than 0 for every set.")
        }
        if (editEvent.doubleElimination && !isLoserSetCountValid) {
            add("Loser set count must be 1, 3, or 5.")
        }
        if (editEvent.doubleElimination && !isLoserPointsValid) {
            add("Loser points must be greater than 0 for every set.")
        }
        if (!isLeagueGamesValid) {
            add("Games per opponent must be at least 1.")
        }
        if (!isLeagueDurationValid) {
            add(
                if (editEvent.usesSets) {
                    "Set duration must be at least 5 minutes and sets must be Best of 1, 3, or 5."
                } else {
                    "Match duration must be at least 15 minutes."
                },
            )
        }
        if (!isLeaguePointsValid) {
            add("Points to victory must be greater than 0 for every configured set.")
        }
        if (!isLeaguePlayoffTeamsValid) {
            add(
                if (editEvent.singleDivision) {
                    "Playoff team count must be at least 2 when playoffs are enabled."
                } else {
                    "Each division must have a playoff team count of at least 2 when playoffs are enabled."
                },
            )
        }
        if (!scheduleTimeLocked && !isLeagueSlotsValid) {
            add(
                if (leagueTimeSlots.isEmpty()) {
                    "Add at least one timeslot for scheduling."
                } else {
                    "Fix timeslot issues before continuing."
                },
            )
        }
        if (!isPaymentPlansValid) {
            addAll(paymentPlanValidationErrors)
        }
        val imageError = when {
            editEvent.imageId.isBlank() -> "Select an image for the event."
            !isColorLoaded -> "Image is still loading."
            else -> null
        }
        if (imageError != null) {
            add(imageError)
        }
    }

    return EventValidationResult(
        isNameValid = isNameValid,
        isPriceValid = isPriceValid,
        isMaxParticipantsValid = isMaxParticipantsValid,
        isTeamSizeValid = isTeamSizeValid,
        isWinnerSetCountValid = isWinnerSetCountValid,
        isLoserSetCountValid = isLoserSetCountValid,
        isWinnerPointsValid = isWinnerPointsValid,
        isLoserPointsValid = isLoserPointsValid,
        isLocationValid = isLocationValid,
        isFieldCountValid = isFieldCountValid,
        isLeagueGamesValid = isLeagueGamesValid,
        isLeagueDurationValid = isLeagueDurationValid,
        isLeaguePointsValid = isLeaguePointsValid,
        isLeaguePlayoffTeamsValid = isLeaguePlayoffTeamsValid,
        isLeagueSlotsValid = isLeagueSlotsValid,
        isSkillLevelValid = isSkillLevelValid,
        isSportValid = isSportValid,
        isFixedEndDateRangeValid = isFixedEndDateRangeValid,
        isPaymentPlansValid = isPaymentPlansValid,
        paymentPlanValidationErrors = paymentPlanValidationErrors,
        validationErrors = validationErrors,
        isValid = isValid,
    )
}
