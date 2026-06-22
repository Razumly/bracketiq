package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion

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
