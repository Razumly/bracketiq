package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.manualPaymentProviderInputLabel
import com.razumly.mvp.core.data.dataTypes.manualPaymentProviderUsesUsername
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentUrl
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments
import com.razumly.mvp.core.data.dataTypes.toTournamentConfig
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.eventDetail.composables.leagueScoringValidationErrors
import kotlinx.datetime.LocalDate

internal fun eventAgeRangeErrors(event: Event): Pair<String?, String?> {
    val minAge = event.minAge
    val maxAge = event.maxAge
    val minimumError = when {
        minAge != null && minAge < 0 -> "Minimum age must be 0 or greater."
        minAge != null && maxAge != null && minAge > maxAge ->
            "Minimum age must not exceed maximum age."
        else -> null
    }
    val maximumError = when {
        maxAge != null && maxAge < 0 -> "Maximum age must be 0 or greater."
        minAge != null && maxAge != null && maxAge < minAge ->
            "Maximum age must be at least minimum age."
        else -> null
    }
    return minimumError to maximumError
}

internal fun manualPaymentLinkError(link: ManualPaymentLink): String? {
    val rawValue = link.url.trim()
    val inputLabel = manualPaymentProviderInputLabel(link.provider)
    if (rawValue.isBlank()) return "Enter ${inputLabel.lowercase()}."
    if (normalizeManualPaymentUrl(link.provider, rawValue) != null) return null
    return if (manualPaymentProviderUsesUsername(link.provider)) {
        "Enter a valid ${inputLabel.lowercase()} or HTTPS link."
    } else {
        "Enter a valid https:// payment link."
    }
}
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
        installmentDueRelativeDays: List<Int>,
        useRelativeDueDates: Boolean,
    ): List<String> {
        if (!allowPaymentPlans) return emptyList()

        val errors = mutableListOf<String>()
        val normalizedAmounts = installmentAmounts.map { amount -> amount.coerceAtLeast(0) }
        val normalizedDueDates = installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val normalizedRelativeDueDays = installmentDueRelativeDays
        val normalizedCount = maxOf(
            installmentCount ?: 0,
            normalizedAmounts.size,
            if (useRelativeDueDates) normalizedRelativeDueDays.size else normalizedDueDates.size,
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
        if (useRelativeDueDates) {
            if (normalizedRelativeDueDays.size != normalizedCount) {
                errors += "$label: installment count must match installment due offsets."
            }
        } else if (normalizedDueDates.size != normalizedCount) {
            errors += "$label: installment count must match installment due dates."
        }

        if (!useRelativeDueDates) {
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
            installmentDueRelativeDays = event.installmentDueRelativeDays,
            useRelativeDueDates = event.eventType == EventType.WEEKLY_EVENT,
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
        installmentDueRelativeDays = event.installmentDueRelativeDays,
        useRelativeDueDates = event.eventType == EventType.WEEKLY_EVENT,
    )

    divisionDetails.forEach { detail ->
        val detailName = detail.name.trim().ifBlank { detail.id }
        errors += validatePlan(
            label = "Division \"$detailName\" payment plan",
            priceCents = detail.price?.coerceAtLeast(0) ?: 0,
            allowPaymentPlans = detail.allowPaymentPlans == true,
            installmentCount = detail.installmentCount,
            installmentAmounts = detail.installmentAmounts,
            installmentDueDates = detail.installmentDueDates,
            installmentDueRelativeDays = detail.installmentDueRelativeDays,
            useRelativeDueDates = event.eventType == EventType.WEEKLY_EVENT,
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
    val isDivisionIdentityValid: Boolean,
    val isSportValid: Boolean,
    val isFixedEndDateRangeValid: Boolean,
    val isPaymentPlansValid: Boolean,
    val isImageValid: Boolean,
    val isAgeRangeValid: Boolean,
    val isRegistrationCutoffValid: Boolean,
    val isRefundCutoffValid: Boolean,
    val isManualPaymentLinksValid: Boolean,
    val isOfficialPositionsValid: Boolean,
    val isLeagueScoringValid: Boolean,
    val leagueScoringValidationErrors: List<String>,
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
    requiresPositiveRegistrationPrice: Boolean = false,
    leagueScoringConfig: LeagueScoringConfigDTO? = null,
    selectedSport: Sport? = null,
): EventValidationResult {
    val isNameValid = editEvent.name.isNotBlank()
    val isImageValid = editEvent.imageId.isNotBlank() && isColorLoaded
    val isPriceValid = if (!requiresPositiveRegistrationPrice) {
        editEvent.priceCents >= 0
    } else if (editEvent.singleDivision) {
        editEvent.priceCents > 0
    } else {
        divisionDetailsForSettings.isNotEmpty() &&
            divisionDetailsForSettings.all { detail -> (detail.price ?: 0) > 0 }
    }
    val isMaxParticipantsValid = if (editEvent.singleDivision) {
        editEvent.maxParticipants >= 2
    } else {
        divisionDetailsForSettings.isNotEmpty() &&
            divisionDetailsForSettings.all { detail -> (detail.maxParticipants ?: 0) >= 2 }
    }
    val isTeamSizeValid = !editEvent.teamSignup || editEvent.teamSizeLimit >= 1
    val ageRangeErrors = eventAgeRangeErrors(editEvent)
    val isAgeRangeValid = ageRangeErrors.first == null && ageRangeErrors.second == null
    val isRegistrationCutoffValid = editEvent.registrationCutoffHours >= 0
    val isRefundCutoffValid = editEvent.cancellationRefundHours?.let { hours -> hours >= 0 } ?: true
    val manualPaymentLinkErrors = if (editEvent.usesManualRegistrationPayments()) {
        editEvent.manualPaymentLinks.mapNotNull(::manualPaymentLinkError)
    } else {
        emptyList()
    }
    val isManualPaymentLinksValid = manualPaymentLinkErrors.isEmpty()
    val isOfficialPositionsValid = editEvent.officialPositions.all { position ->
        position.id.isNotBlank() && position.name.isNotBlank() && position.count >= 1 && position.order >= 0
    }
    val isLocationValid = editEvent.location.isNotBlank() && editEvent.lat != 0.0 && editEvent.long != 0.0
    val isSkillLevelValid = editEvent.eventType == EventType.LEAGUE || editEvent.divisions.isNotEmpty()
    val duplicateDivisionNames = duplicateDivisionIdentityNames(divisionDetailsForSettings)
    val isDivisionIdentityValid = duplicateDivisionNames.isEmpty()
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
        val validSetCounts = setOf(1, 3, 5)
        val tournamentDetails = tournamentValidationDetails(editEvent, divisionDetailsForSettings)
        val tournamentConfigs = if (editEvent.singleDivision) {
            listOf(tournamentDetails.firstOrNull()?.toTournamentConfig(editEvent.toTournamentConfig())
                ?: editEvent.toTournamentConfig())
        } else {
            tournamentDetails.map { detail -> detail.toTournamentConfig(editEvent.toTournamentConfig()) }
        }
        isWinnerSetCountValid = tournamentConfigs.isNotEmpty() &&
            tournamentConfigs.all { config -> config.winnerSetCount in validSetCounts }
        isWinnerPointsValid = tournamentConfigs.isNotEmpty() &&
            tournamentConfigs.all { config ->
                config.winnerBracketPointsToVictory.size >= config.winnerSetCount &&
                    config.winnerBracketPointsToVictory.take(config.winnerSetCount).all { points -> points > 0 }
            }
        isLoserSetCountValid = tournamentConfigs.isNotEmpty() &&
            tournamentConfigs.all { config ->
                !config.doubleElimination || config.loserSetCount in validSetCounts
            }
        isLoserPointsValid = tournamentConfigs.isNotEmpty() &&
            tournamentConfigs.all { config ->
                !config.doubleElimination ||
                    (
                        config.loserBracketPointsToVictory.size >= config.loserSetCount &&
                            config.loserBracketPointsToVictory.take(config.loserSetCount).all { points -> points > 0 }
                        )
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
        val validSetCounts = setOf(1, 3, 5)
        fun validSetCount(value: Int?): Int? = value?.takeIf { count -> count in validSetCounts }
        fun isDurationValid(
            usesSets: Boolean,
            matchDurationMinutes: Int?,
            setDurationMinutes: Int?,
            setsPerMatch: Int?,
        ): Boolean {
            val setCount = validSetCount(setsPerMatch)
            return if (usesSets) {
                setCount != null && (setDurationMinutes ?: 0) >= 5
            } else {
                (matchDurationMinutes ?: 0) >= 1
            }
        }
        fun arePointsValid(
            usesSets: Boolean,
            setsPerMatch: Int?,
            pointsToVictory: List<Int>,
        ): Boolean {
            if (!usesSets) return true
            val setCount = validSetCount(setsPerMatch) ?: return false
            return pointsToVictory.size >= setCount &&
                pointsToVictory.take(setCount).all { points -> points > 0 }
        }
        fun isPlayoffConfigValid(detail: DivisionDetail): Boolean {
            val fallbackUsesSets = detail.usesSets ?: editEvent.usesSets
            val config = detail.playoffConfig
            val usesSets = config?.usesSets ?: fallbackUsesSets
            if (!isDurationValid(
                    usesSets = usesSets,
                    matchDurationMinutes = config?.matchDurationMinutes ?: editEvent.matchDurationMinutes,
                    setDurationMinutes = config?.setDurationMinutes ?: detail.setDurationMinutes ?: editEvent.setDurationMinutes,
                    setsPerMatch = if (usesSets) {
                        config?.winnerSetCount ?: detail.setsPerMatch ?: editEvent.winnerSetCount
                    } else {
                        1
                    },
                )
            ) {
                return false
            }
            if (!usesSets) return true
            val winnerSetCount = validSetCount(config?.winnerSetCount ?: editEvent.winnerSetCount) ?: return false
            val winnerPoints = config?.winnerBracketPointsToVictory ?: editEvent.winnerBracketPointsToVictory
            if (winnerPoints.size < winnerSetCount || winnerPoints.take(winnerSetCount).any { points -> points <= 0 }) {
                return false
            }
            val doubleElimination = config?.doubleElimination ?: editEvent.doubleElimination
            if (!doubleElimination) return true
            val loserSetCount = validSetCount(config?.loserSetCount ?: editEvent.loserSetCount) ?: return false
            val loserPoints = config?.loserBracketPointsToVictory ?: editEvent.loserBracketPointsToVictory
            return loserPoints.size >= loserSetCount &&
                loserPoints.take(loserSetCount).all { points -> points > 0 }
        }
        val leagueDetails = mergeDivisionDetailsForDivisions(
            divisions = editEvent.divisions,
            existingDetails = editEvent.divisionDetails,
            eventId = editEvent.id,
        )
        val singleLeagueDetail = if (editEvent.singleDivision) leagueDetails.firstOrNull() else null
        isLeagueGamesValid = if (editEvent.singleDivision) {
            (singleLeagueDetail?.gamesPerOpponent ?: editEvent.gamesPerOpponent ?: 1) >= 1
        } else {
            leagueDetails.isNotEmpty() &&
                leagueDetails.all { detail -> (detail.gamesPerOpponent ?: editEvent.gamesPerOpponent ?: 1) >= 1 }
        }
        isLeaguePlayoffTeamsValid = if (!editEvent.includePlayoffs) {
            true
        } else if (editEvent.singleDivision) {
            (editEvent.playoffTeamCount ?: singleLeagueDetail?.playoffTeamCount ?: 0) >= 2 &&
                (singleLeagueDetail?.let(::isPlayoffConfigValid) ?: true)
        } else {
            leagueDetails.isNotEmpty() &&
                leagueDetails.all { detail -> (detail.playoffTeamCount ?: 0) >= 2 && isPlayoffConfigValid(detail) }
        }
        if (editEvent.singleDivision) {
            val usesSets = singleLeagueDetail?.usesSets ?: editEvent.usesSets
            isLeagueDurationValid = isDurationValid(
                usesSets = usesSets,
                matchDurationMinutes = singleLeagueDetail?.matchDurationMinutes ?: editEvent.matchDurationMinutes,
                setDurationMinutes = singleLeagueDetail?.setDurationMinutes ?: editEvent.setDurationMinutes,
                setsPerMatch = singleLeagueDetail?.setsPerMatch ?: editEvent.setsPerMatch,
            )
            isLeaguePointsValid = arePointsValid(
                usesSets = usesSets,
                setsPerMatch = singleLeagueDetail?.setsPerMatch ?: editEvent.setsPerMatch,
                pointsToVictory = singleLeagueDetail?.pointsToVictory?.takeIf { points -> points.isNotEmpty() }
                    ?: editEvent.pointsToVictory,
            )
        } else {
            isLeagueDurationValid = leagueDetails.isNotEmpty() &&
                leagueDetails.all { detail ->
                    val usesSets = detail.usesSets ?: editEvent.usesSets
                    isDurationValid(
                        usesSets = usesSets,
                        matchDurationMinutes = detail.matchDurationMinutes ?: editEvent.matchDurationMinutes,
                        setDurationMinutes = detail.setDurationMinutes ?: editEvent.setDurationMinutes,
                        setsPerMatch = detail.setsPerMatch ?: editEvent.setsPerMatch,
                    )
                }
            isLeaguePointsValid = leagueDetails.isNotEmpty() &&
                leagueDetails.all { detail ->
                    val usesSets = detail.usesSets ?: editEvent.usesSets
                    arePointsValid(
                        usesSets = usesSets,
                        setsPerMatch = detail.setsPerMatch ?: editEvent.setsPerMatch,
                        pointsToVictory = detail.pointsToVictory.takeIf { points -> points.isNotEmpty() }
                            ?: editEvent.pointsToVictory,
                    )
                }
        }
    } else if (editEvent.eventType == EventType.TOURNAMENT) {
        isLeagueGamesValid = true
        val details = tournamentValidationDetails(editEvent, divisionDetailsForSettings)
        isLeaguePlayoffTeamsValid = if (!editEvent.includePlayoffs) {
            true
        } else {
            details.isNotEmpty() && details.all(::isTournamentPoolDivisionValid)
        }
        isLeaguePointsValid = true
        val tournamentConfigs = if (editEvent.singleDivision) {
            listOf(details.firstOrNull()?.toTournamentConfig(editEvent.toTournamentConfig()) ?: editEvent.toTournamentConfig())
        } else {
            details.map { detail -> detail.toTournamentConfig(editEvent.toTournamentConfig()) }
        }
        isLeagueDurationValid = tournamentConfigs.isNotEmpty() && tournamentConfigs.all { config ->
            if (config.usesSets) {
                (config.setDurationMinutes ?: 0) >= 5
            } else {
                (config.matchDurationMinutes ?: 0) >= 1
            }
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
    val leagueScoringErrors = if (editEvent.eventType == EventType.LEAGUE && leagueScoringConfig != null) {
        leagueScoringValidationErrors(leagueScoringConfig, selectedSport)
    } else {
        emptyList()
    }
    val isLeagueScoringValid = leagueScoringErrors.isEmpty()

    val isValid = isNameValid &&
        isPriceValid &&
        isMaxParticipantsValid &&
        isTeamSizeValid &&
        isAgeRangeValid &&
        isRegistrationCutoffValid &&
        isRefundCutoffValid &&
        isManualPaymentLinksValid &&
        isOfficialPositionsValid &&
        isWinnerSetCountValid &&
        isWinnerPointsValid &&
        isLoserSetCountValid &&
        isLoserPointsValid &&
        isLocationValid &&
        isSkillLevelValid &&
        isDivisionIdentityValid &&
        isFieldCountValid &&
        isLeagueGamesValid &&
        isLeagueDurationValid &&
        isLeaguePointsValid &&
        isLeaguePlayoffTeamsValid &&
        isLeagueSlotsValid &&
        isFixedEndDateRangeValid &&
        isSportValid &&
        isLeagueScoringValid &&
        isPaymentPlansValid &&
        isImageValid

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
            add(
                if (requiresPositiveRegistrationPrice) {
                    if (editEvent.singleDivision) {
                        "Enter a price greater than 0 for paid registration."
                    } else {
                        "Each division needs a price greater than 0 for paid registration."
                    }
                } else {
                    "Price must be 0 or higher."
                },
            )
        }
        if (!isMaxParticipantsValid) {
            add(
                when {
                    editEvent.singleDivision && editEvent.teamSignup -> "Max teams must be at least 2."
                    editEvent.singleDivision -> "Max participants must be at least 2."
                    editEvent.teamSignup -> "Each division must have max teams of at least 2."
                    else -> "Each division must have max participants of at least 2."
                },
            )
        }
        if (!isTeamSizeValid) {
            add("Team size must be at least 1.")
        }
        if (!isAgeRangeValid) {
            addAll(listOfNotNull(ageRangeErrors.first, ageRangeErrors.second).distinct())
        }
        if (!isRegistrationCutoffValid) {
            add("Registration cutoff must be 0 hours or greater.")
        }
        if (!isRefundCutoffValid) {
            add("Automatic refund cutoff must be 0 hours or greater.")
        }
        if (!isManualPaymentLinksValid) {
            addAll(manualPaymentLinkErrors.distinct())
        }
        if (!isOfficialPositionsValid) {
            add("Every official position needs a name and at least 1 slot.")
        }
        if (!isSkillLevelValid) {
            add("Add at least one division.")
        }
        if (!isDivisionIdentityValid) {
            add("Each division must have a unique gender, skill division, and age division.")
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
                    "Match duration must be at least 1 minute."
                },
            )
        }
        if (!isLeaguePointsValid) {
            add("Points to victory must be greater than 0 for every configured set.")
        }
        if (!isLeaguePlayoffTeamsValid) {
            add(
                if (editEvent.eventType == EventType.TOURNAMENT) {
                    "Each tournament division needs pool count, bracket team count, and even pool sizing when pool play is enabled."
                } else if (editEvent.singleDivision) {
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
        if (!isLeagueScoringValid) {
            addAll(leagueScoringErrors)
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
        isDivisionIdentityValid = isDivisionIdentityValid,
        isSportValid = isSportValid,
        isFixedEndDateRangeValid = isFixedEndDateRangeValid,
        isPaymentPlansValid = isPaymentPlansValid,
        isImageValid = isImageValid,
        isAgeRangeValid = isAgeRangeValid,
        isRegistrationCutoffValid = isRegistrationCutoffValid,
        isRefundCutoffValid = isRefundCutoffValid,
        isManualPaymentLinksValid = isManualPaymentLinksValid,
        isOfficialPositionsValid = isOfficialPositionsValid,
        isLeagueScoringValid = isLeagueScoringValid,
        leagueScoringValidationErrors = leagueScoringErrors,
        paymentPlanValidationErrors = paymentPlanValidationErrors,
        validationErrors = validationErrors,
        isValid = isValid,
    )
}

private fun tournamentValidationDetails(
    editEvent: Event,
    divisionDetailsForSettings: List<DivisionDetail>,
): List<DivisionDetail> {
    return divisionDetailsForSettings.ifEmpty {
        mergeDivisionDetailsForDivisions(
            divisions = editEvent.divisions,
            existingDetails = editEvent.divisionDetails,
            eventId = editEvent.id,
        )
    }
}
