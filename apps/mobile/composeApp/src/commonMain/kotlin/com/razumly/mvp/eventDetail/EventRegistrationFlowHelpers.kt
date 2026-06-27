package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.hasAnyPaidDivision
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion

enum class WithdrawTargetMembership {
    PARTICIPANT,
    WAITLIST,
    FREE_AGENT,
}

data class WithdrawTargetOption(
    val userId: String,
    val fullName: String,
    val membership: WithdrawTargetMembership,
    val isSelf: Boolean,
)

internal data class CurrentUserRegistrationMembershipState(
    val participant: Boolean = false,
    val waitlist: Boolean = false,
    val freeAgent: Boolean = false,
    val paymentPending: Boolean = false,
    val paymentFailed: Boolean = false,
    val teamId: String? = null,
)

internal enum class JoinConfirmationRegistrantType {
    SELF,
    TEAM,
}

internal data class JoinConfirmationTarget(
    val eventId: String,
    val registrantType: JoinConfirmationRegistrantType,
    val registrantId: String,
    val occurrence: EventOccurrenceSelection? = null,
)

internal fun buildJoinConfirmationTarget(
    eventId: String,
    registrantType: JoinConfirmationRegistrantType,
    registrantId: String,
    occurrence: EventOccurrenceSelection? = null,
): JoinConfirmationTarget? {
    val normalizedRegistrantId = registrantId.trim()
    val normalizedEventId = eventId.trim()
    if (normalizedRegistrantId.isBlank() || normalizedEventId.isBlank()) {
        return null
    }
    return JoinConfirmationTarget(
        eventId = normalizedEventId,
        registrantType = registrantType,
        registrantId = normalizedRegistrantId,
        occurrence = occurrence,
    )
}

internal fun registrationMatchesJoinConfirmationTarget(
    registration: EventRegistrationCacheEntry,
    target: JoinConfirmationTarget,
): Boolean {
    if (registration.eventId != target.eventId || !registration.isActiveForMembership()) {
        return false
    }
    if (registration.normalizedRosterRole() != "PARTICIPANT") {
        return false
    }
    val expectedRegistrantType = target.registrantType.name
    if (!registration.registrantType.trim().equals(expectedRegistrantType, ignoreCase = true)) {
        return false
    }
    val registrationMatchesRegistrant = when (expectedRegistrantType) {
        "TEAM" -> setOf(
            registration.registrantId,
            registration.parentId,
            registration.eventTeamId,
        ).any { value -> value?.trim() == target.registrantId }

        else -> registration.registrantId == target.registrantId
    }
    if (!registrationMatchesRegistrant) {
        return false
    }
    return if (target.occurrence != null) {
        registration.slotId == target.occurrence.slotId &&
            registration.occurrenceDate == target.occurrence.occurrenceDate
    } else {
        registration.slotId.isNullOrBlank() && registration.occurrenceDate.isNullOrBlank()
    }
}

internal fun eventSnapshotMatchesJoinConfirmationTarget(
    event: Event,
    target: JoinConfirmationTarget,
): Boolean {
    val registrantId = target.registrantId.trim()
    if (registrantId.isBlank()) {
        return false
    }
    return when (target.registrantType) {
        JoinConfirmationRegistrantType.SELF -> event.playerIds.any { playerId ->
            playerId.trim() == registrantId
        }

        JoinConfirmationRegistrantType.TEAM -> event.teamIds.any { teamId ->
            teamId.trim() == registrantId
        }
    }
}

internal fun EventRegistrationCacheEntry.normalizedRosterRole(): String =
    rosterRole?.trim()?.uppercase().orEmpty()

internal fun EventRegistrationCacheEntry.normalizedStatus(): String =
    status?.trim()?.uppercase().orEmpty()

internal fun EventRegistrationCacheEntry.isCancelledLike(): Boolean =
    normalizedStatus() == "CANCELLED"

internal fun EventRegistrationCacheEntry.isActiveForMembership(): Boolean =
    !isCancelledLike() &&
        normalizedStatus() != "CONSENTFAILED" &&
        normalizedStatus() != "PAYMENT_FAILED"

internal fun EventRegistrationCacheEntry.isPaymentPending(): Boolean =
    normalizedStatus() == "PENDING"

internal fun EventRegistrationCacheEntry.isPaymentFailed(): Boolean =
    normalizedStatus() == "PAYMENT_FAILED"

internal fun matchingParticipantTeamId(
    event: Event,
    currentUserTeamIds: Set<String>,
): String? {
    if (!event.teamSignup || currentUserTeamIds.isEmpty()) {
        return null
    }
    return event.teamIds
        .asSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .firstOrNull { teamId -> currentUserTeamIds.contains(teamId) }
}

internal fun isUserParticipantInEventSnapshot(
    event: Event,
    currentUserId: String,
    currentUserTeamIds: Set<String>,
): Boolean {
    val normalizedUserId = currentUserId.trim()
    if (normalizedUserId.isNotBlank() && event.playerIds.any { playerId -> playerId == normalizedUserId }) {
        return true
    }
    return matchingParticipantTeamId(event, currentUserTeamIds) != null
}

internal fun resolveCurrentUserRegistrationMembership(
    registrations: List<EventRegistrationCacheEntry>,
    selectedOccurrence: EventOccurrenceSelection?,
    currentUserId: String,
    currentUserTeamIds: Set<String>,
    isWeeklyParentEvent: Boolean,
): CurrentUserRegistrationMembershipState? {
    if (registrations.isEmpty()) {
        return null
    }

    val normalizedCurrentUserId = currentUserId.trim()
    val matchingRegistrations = registrations.filter { registration ->
        val matchesRegistrant = when (registration.registrantType.trim().uppercase()) {
            "SELF" -> normalizedCurrentUserId.isNotBlank() && registration.registrantId == normalizedCurrentUserId
            "TEAM" -> registration.matchesCurrentUserTeamIds(currentUserTeamIds)
            else -> false
        }
        if (!matchesRegistrant) {
            return@filter false
        }

        if (isWeeklyParentEvent) {
            selectedOccurrence != null &&
                registration.slotId == selectedOccurrence.slotId &&
                registration.occurrenceDate == selectedOccurrence.occurrenceDate
        } else {
            registration.slotId.isNullOrBlank() && registration.occurrenceDate.isNullOrBlank()
        }
    }
    if (matchingRegistrations.isEmpty()) {
        return CurrentUserRegistrationMembershipState()
    }

    val activeRegistrations = matchingRegistrations.filter { registration ->
        registration.isActiveForMembership()
    }
    val participant = activeRegistrations.any { registration ->
        registration.normalizedRosterRole() == "PARTICIPANT"
    }
    val waitlist = activeRegistrations.any { registration ->
        registration.normalizedRosterRole() == "WAITLIST"
    }
    val freeAgent = activeRegistrations.any { registration ->
        registration.normalizedRosterRole() == "FREE_AGENT"
    }
    val paymentPending = activeRegistrations.any { registration ->
        registration.isPaymentPending()
    }
    val paymentFailed = matchingRegistrations.any { registration ->
        registration.isPaymentFailed()
    }
    val teamId = activeRegistrations
        .firstOrNull { registration -> registration.registrantType.trim().uppercase() == "TEAM" }
        ?.resolvedEventTeamId()

    return CurrentUserRegistrationMembershipState(
        participant = participant,
        waitlist = waitlist,
        freeAgent = freeAgent,
        paymentPending = paymentPending,
        paymentFailed = paymentFailed,
        teamId = teamId,
    )
}

internal fun resolveWithdrawTargetMembershipFromEvent(
    event: Event,
    targetUserId: String,
    currentUserId: String,
    currentUserTeamIds: Set<String>,
    currentUserMembership: CurrentUserRegistrationMembershipState?,
    weeklyParentWithoutSelection: Boolean,
): WithdrawTargetMembership? {
    if (weeklyParentWithoutSelection) {
        return null
    }
    if (targetUserId == currentUserId && currentUserMembership != null) {
        return currentUserMembership.toWithdrawTargetMembership()
    }
    return when {
        event.playerIds.contains(targetUserId) -> WithdrawTargetMembership.PARTICIPANT
        event.waitList.contains(targetUserId) -> WithdrawTargetMembership.WAITLIST
        event.freeAgents.contains(targetUserId) -> WithdrawTargetMembership.FREE_AGENT
        event.teamSignup && targetUserId == currentUserId -> {
            when {
                matchingParticipantTeamId(event, currentUserTeamIds) != null ->
                    WithdrawTargetMembership.PARTICIPANT

                event.waitList.any { teamId -> currentUserTeamIds.contains(teamId) } ->
                    WithdrawTargetMembership.WAITLIST

                event.freeAgents.any { teamId -> currentUserTeamIds.contains(teamId) } ->
                    WithdrawTargetMembership.FREE_AGENT

                else -> null
            }
        }

        else -> null
    }
}

internal fun canRequestPaidRefund(event: Event, membership: WithdrawTargetMembership): Boolean =
    event.hasAnyPaidDivision() &&
        !event.usesManualRegistrationPayments() &&
        membership == WithdrawTargetMembership.PARTICIPANT

internal fun usesRegisteredTeamWithdrawal(
    event: Event,
    targetUserId: String,
    currentUserId: String,
    membership: WithdrawTargetMembership,
    currentUserIsFreeAgent: Boolean,
): Boolean =
    membership == WithdrawTargetMembership.PARTICIPANT &&
        event.teamSignup &&
        targetUserId == currentUserId &&
        !currentUserIsFreeAgent

internal fun Throwable.isAlreadyRegisteredJoinError(): Boolean {
    val normalized = message?.lowercase() ?: return false
    return normalized.contains("already registered") ||
        normalized.contains("already in event") ||
        normalized.contains("already a participant")
}

internal fun Throwable.isDuplicatePaymentPlanError(): Boolean {
    val normalized = message?.lowercase() ?: return false
    return normalized.contains("payment plan already exists")
}

internal fun registrationQuestionAnswerUpdate(
    questionId: String,
    answer: String,
): Pair<String, String>? {
    val normalizedQuestionId = questionId.trim().takeIf(String::isNotBlank) ?: return null
    return normalizedQuestionId to answer
}

internal fun registrationQuestionDialogAnswers(
    questions: List<TeamJoinQuestion>,
    submittedAnswers: Map<String, String>,
): Map<String, String> {
    return questions.associate { question ->
        question.id to submittedAnswers[question.id].orEmpty()
    }
}

internal fun firstMissingRequiredRegistrationQuestion(
    questions: List<TeamJoinQuestion>,
    answers: Map<String, String>,
): TeamJoinQuestion? {
    return questions.firstOrNull { question ->
        question.required && answers[question.id].orEmpty().trim().isBlank()
    }
}

internal fun registrationAnswersForRequest(
    questions: List<TeamJoinQuestion>,
    answers: Map<String, String>,
): Map<String, String> {
    val questionIds = questions
        .mapNotNull { question -> question.id.trim().takeIf(String::isNotBlank) }
        .toSet()
    return answers
        .filter { (questionId, answer) ->
            val normalizedQuestionId = questionId.trim()
            normalizedQuestionId.isNotBlank() &&
                answer.trim().isNotBlank() &&
                (questionIds.isEmpty() || normalizedQuestionId in questionIds)
        }
        .mapKeys { (questionId, _) -> questionId.trim() }
}

private fun EventRegistrationCacheEntry.matchesCurrentUserTeamIds(currentUserTeamIds: Set<String>): Boolean {
    if (currentUserTeamIds.isEmpty()) {
        return false
    }
    return sequenceOf(
        parentId,
        eventTeamId,
        registrantId,
    )
        .mapNotNull { value -> value?.trim()?.takeIf(String::isNotBlank) }
        .any(currentUserTeamIds::contains)
}

private fun EventRegistrationCacheEntry.resolvedEventTeamId(): String? =
    eventTeamId?.trim()?.takeIf(String::isNotBlank)
        ?: registrantId.trim().takeIf(String::isNotBlank)

private fun CurrentUserRegistrationMembershipState.toWithdrawTargetMembership(): WithdrawTargetMembership? =
    when {
        participant -> WithdrawTargetMembership.PARTICIPANT
        waitlist -> WithdrawTargetMembership.WAITLIST
        freeAgent -> WithdrawTargetMembership.FREE_AGENT
        else -> null
    }
