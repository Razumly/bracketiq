package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.network.dto.BillDiscountSummaryDto
import com.razumly.mvp.core.network.dto.EventComplianceDocumentCountsDto
import com.razumly.mvp.core.network.dto.EventCompliancePaymentSummaryDto
import com.razumly.mvp.core.network.dto.EventComplianceRequiredDocumentDto
import com.razumly.mvp.core.network.dto.EventComplianceUserSummaryDto
import com.razumly.mvp.core.network.dto.EventParticipantDivisionWarningDto
import com.razumly.mvp.core.network.dto.EventParticipantEntryDto
import com.razumly.mvp.core.network.dto.EventParticipantRegistrationSectionsDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceSummaryDto
import com.razumly.mvp.core.network.dto.EventTemplateApiDto
import com.razumly.mvp.core.network.dto.RegistrationQuestionAnswerDto
import com.razumly.mvp.core.network.dto.RegistrationQuestionAnswerSnapshotDto
import com.razumly.mvp.core.network.dto.StandingsDivisionDto
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlin.time.Instant

internal fun Event.explicitlyClearedEventPatchFields(previous: Event): Set<String> = buildSet {
    if (previous.address != null && address == null) add("address")
    if (previous.rating != null && rating == null) add("rating")
    if (previous.cancellationRefundHours != null && cancellationRefundHours == null) add("cancellationRefundHours")
    if (previous.sportId != null && sportId == null) add("sportId")
    if (previous.leagueScoringConfigId != null && leagueScoringConfigId == null) add("leagueScoringConfigId")
    if (previous.affiliateUrl != null && affiliateUrl == null) add("affiliateUrl")
    if (previous.scheduleText != null && scheduleText == null) add("scheduleText")
    if (previous.dateDisplayMode != null && dateDisplayMode == null) add("dateDisplayMode")
    if (previous.dateDisplayText != null && dateDisplayText == null) add("dateDisplayText")
    if (previous.manualPaymentInstructions != null && manualPaymentInstructions == null) add("manualPaymentInstructions")
    if (previous.minAge != null && minAge == null) add("minAge")
    if (previous.maxAge != null && maxAge == null) add("maxAge")
    if (previous.gamesPerOpponent != null && gamesPerOpponent == null) add("gamesPerOpponent")
    if (previous.playoffTeamCount != null && playoffTeamCount == null) add("playoffTeamCount")
    if (previous.matchDurationMinutes != null && matchDurationMinutes == null) add("matchDurationMinutes")
    if (previous.setDurationMinutes != null && setDurationMinutes == null) add("setDurationMinutes")
    if (previous.setsPerMatch != null && setsPerMatch == null) add("setsPerMatch")
    if (previous.doTeamsOfficiate != null && doTeamsOfficiate == null) add("doTeamsOfficiate")
    if (previous.teamOfficialsMaySwap != null && teamOfficialsMaySwap == null) add("teamOfficialsMaySwap")
    if (previous.matchRulesOverride != null && matchRulesOverride == null) add("matchRulesOverride")
    if (previous.restTimeMinutes != null && restTimeMinutes == null) add("restTimeMinutes")
    if (previous.allowPaymentPlans != null && allowPaymentPlans == null) add("allowPaymentPlans")
    if (previous.installmentCount != null && installmentCount == null) add("installmentCount")
    if (previous.allowTeamSplitDefault != null && allowTeamSplitDefault == null) add("allowTeamSplitDefault")
}

@Serializable
internal data class RegistrationQuestionDto(
    val id: String = "",
    val prompt: String = "",
    val answerType: String = "TEXT",
    val required: Boolean = false,
    val sortOrder: Int = 0,
)

@Serializable
internal data class RegistrationQuestionsResponseDto(
    val questions: List<RegistrationQuestionDto> = emptyList(),
    val error: String? = null,
)

internal fun RegistrationQuestionDto.toTeamJoinQuestionOrNull(): TeamJoinQuestion? {
    val normalizedId = id.trim().takeIf(String::isNotBlank) ?: return null
    val normalizedPrompt = prompt.trim().takeIf(String::isNotBlank) ?: return null
    return TeamJoinQuestion(
        id = normalizedId,
        prompt = normalizedPrompt,
        answerType = answerType.trim().ifBlank { "TEXT" },
        required = required,
        sortOrder = sortOrder,
    )
}

internal fun Map<String, String>.toEventRegistrationQuestionAnswerDtos(): List<RegistrationQuestionAnswerDto> =
    mapNotNull { (questionId, answer) ->
        val normalizedQuestionId = questionId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
        RegistrationQuestionAnswerDto(
            questionId = normalizedQuestionId,
            answer = answer,
        )
    }

internal data class RegistrationDivisionPayload(
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
)

internal fun EventParticipantEntryDto.toManagementEntryOrNull(): EventParticipantManagementEntry? {
    val normalizedRegistrationId = registrationId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedRegistrantId = registrantId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedRegistrantType = registrantType?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventParticipantManagementEntry(
        registrationId = normalizedRegistrationId,
        registrantId = normalizedRegistrantId,
        registrantType = normalizedRegistrantType,
        rosterRole = rosterRole?.trim()?.takeIf(String::isNotBlank),
        status = status?.trim()?.takeIf(String::isNotBlank),
        parentId = parentId?.trim()?.takeIf(String::isNotBlank),
        divisionId = divisionId?.trim()?.takeIf(String::isNotBlank),
        divisionTypeId = divisionTypeId?.trim()?.takeIf(String::isNotBlank),
        divisionTypeKey = divisionTypeKey?.trim()?.takeIf(String::isNotBlank),
        consentDocumentId = consentDocumentId?.trim()?.takeIf(String::isNotBlank),
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
        slotId = slotId?.trim()?.takeIf(String::isNotBlank),
        occurrenceDate = occurrenceDate?.trim()?.takeIf(String::isNotBlank),
        createdAt = createdAt?.trim()?.takeIf(String::isNotBlank),
        updatedAt = updatedAt?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun EventParticipantRegistrationSectionsDto?.toManagementSnapshot(): EventParticipantManagementSnapshot {
    if (this == null) {
        return EventParticipantManagementSnapshot()
    }
    return EventParticipantManagementSnapshot(
        teamRegistrations = teams.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        userRegistrations = users.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        childRegistrations = children.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        waitlistRegistrations = waitlist.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
        freeAgentRegistrations = freeAgents.mapNotNull(EventParticipantEntryDto::toManagementEntryOrNull),
    )
}
internal fun EventParticipantDivisionWarningDto.toDomainWarningOrNull(): EventParticipantDivisionWarning? {
    val normalizedDivisionId = divisionId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedCode = code?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedMessage = message?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventParticipantDivisionWarning(
        divisionId = normalizedDivisionId,
        code = normalizedCode,
        message = normalizedMessage,
        filledCount = filledCount ?: 0,
        slotCount = slotCount ?: 0,
        maxTeams = maxTeams ?: 0,
    )
}

internal fun EventCompliancePaymentSummaryDto?.toEventCompliancePaymentSummary(): EventCompliancePaymentSummary {
    if (this == null) {
        return EventCompliancePaymentSummary()
    }
    return EventCompliancePaymentSummary(
        hasBill = hasBill == true,
        billId = billId?.trim()?.takeIf(String::isNotBlank),
        totalAmountCents = totalAmountCents ?: 0,
        paidAmountCents = paidAmountCents ?: 0,
        originalAmountCents = originalAmountCents ?: totalAmountCents ?: 0,
        discountAmountCents = discountAmountCents ?: 0,
        discountedAmountCents = discountedAmountCents ?: totalAmountCents ?: 0,
        discounts = discounts.mapNotNull(BillDiscountSummaryDto::toEventBillDiscountSummaryOrNull),
        status = status?.trim()?.takeIf(String::isNotBlank),
        isPaidInFull = isPaidInFull == true,
        paymentPending = paymentPending == true,
        inheritedFromTeamBill = inheritedFromTeamBill == true,
        manualPaymentProofStatus = manualPaymentProofStatus?.trim()?.takeIf(String::isNotBlank),
        manualPaymentProofCount = manualPaymentProofCount ?: 0,
    )
}

internal fun BillDiscountSummaryDto.toEventBillDiscountSummaryOrNull(): BillDiscountSummary? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountId = discountId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountCodeId = discountCodeId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedCode = code?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOriginal = originalAmountCents ?: return null
    val resolvedDiscounted = discountedAmountCents ?: return null
    return BillDiscountSummary(
        id = resolvedId,
        discountId = resolvedDiscountId,
        discountCodeId = resolvedDiscountCodeId,
        code = resolvedCode,
        name = name?.trim()?.takeIf(String::isNotBlank),
        originalAmountCents = resolvedOriginal.coerceAtLeast(0),
        discountedAmountCents = resolvedDiscounted.coerceAtLeast(0),
        discountAmountCents = (discountAmountCents ?: (resolvedOriginal - resolvedDiscounted)).coerceAtLeast(0),
        paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
        registrationId = registrationId?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun EventComplianceDocumentCountsDto?.toEventComplianceDocumentCounts(): EventComplianceDocumentCounts {
    if (this == null) {
        return EventComplianceDocumentCounts()
    }
    return EventComplianceDocumentCounts(
        signedCount = signedCount ?: 0,
        requiredCount = requiredCount ?: 0,
    )
}

internal fun EventComplianceRequiredDocumentDto.toEventComplianceRequiredDocumentOrNull(): EventComplianceRequiredDocument? {
    val normalizedKey = key?.trim()?.takeIf(String::isNotBlank)
    val normalizedTemplateId = templateId?.trim()?.takeIf(String::isNotBlank)
    if (normalizedKey == null || normalizedTemplateId == null) {
        return null
    }
    return EventComplianceRequiredDocument(
        key = normalizedKey,
        templateId = normalizedTemplateId,
        title = title?.trim()?.takeIf(String::isNotBlank) ?: "Required document",
        type = type?.trim()?.takeIf(String::isNotBlank) ?: "PDF",
        signerContext = signerContext?.trim()?.takeIf(String::isNotBlank) ?: "participant",
        signerLabel = signerLabel?.trim()?.takeIf(String::isNotBlank) ?: "Participant",
        signOnce = signOnce == true,
        status = status?.trim()?.takeIf(String::isNotBlank) ?: "UNSIGNED",
        signedDocumentRecordId = signedDocumentRecordId?.trim()?.takeIf(String::isNotBlank),
        signedAt = signedAt?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun EventTemplateApiDto.toEventTemplateSummaryOrNull(): EventTemplateSummary? {
    val normalizedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedName = name?.trim()?.takeIf(String::isNotBlank) ?: "Untitled Template"
    return EventTemplateSummary(
        id = normalizedId,
        name = normalizedName,
        description = description?.trim()?.takeIf(String::isNotBlank),
        sourceEventId = sourceEventId?.trim()?.takeIf(String::isNotBlank),
        ownerUserId = ownerUserId?.trim()?.takeIf(String::isNotBlank),
        organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
        sportId = sportId?.trim()?.takeIf(String::isNotBlank),
        eventType = eventType?.trim()?.takeIf(String::isNotBlank),
        createdAt = createdAt?.trim()?.takeIf(String::isNotBlank)?.let { raw ->
            runCatching { Instant.parse(raw) }.getOrNull()
        },
        updatedAt = updatedAt?.trim()?.takeIf(String::isNotBlank)?.let { raw ->
            runCatching { Instant.parse(raw) }.getOrNull()
        },
    )
}

internal fun RegistrationQuestionAnswerSnapshotDto.toEventRegistrationQuestionAnswerOrNull(): RegistrationQuestionAnswerSummary? {
    val normalizedQuestionId = questionId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val normalizedPrompt = prompt?.trim()?.takeIf(String::isNotBlank) ?: return null
    return RegistrationQuestionAnswerSummary(
        questionId = normalizedQuestionId,
        prompt = normalizedPrompt,
        answerType = answerType?.trim()?.takeIf(String::isNotBlank) ?: "TEXT",
        required = required == true,
        sortOrder = sortOrder ?: 0,
        answer = answer?.trim().orEmpty(),
    )
}

internal fun EventComplianceUserSummaryDto.toEventComplianceUserSummaryOrNull(): EventComplianceUserSummary? {
    val normalizedUserId = userId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventComplianceUserSummary(
        userId = normalizedUserId,
        fullName = fullName?.trim()?.takeIf(String::isNotBlank) ?: normalizedUserId,
        userName = userName?.trim()?.takeIf(String::isNotBlank),
        isMinorAtEvent = isMinorAtEvent == true,
        registrationType = registrationType?.trim()?.takeIf(String::isNotBlank) ?: "ADULT",
        payment = payment.toEventCompliancePaymentSummary(),
        documents = documents.toEventComplianceDocumentCounts(),
        requiredDocuments = requiredDocuments.mapNotNull(EventComplianceRequiredDocumentDto::toEventComplianceRequiredDocumentOrNull),
        registrationAnswers = registrationAnswers.mapNotNull(RegistrationQuestionAnswerSnapshotDto::toEventRegistrationQuestionAnswerOrNull),
    )
}

internal fun EventTeamComplianceSummaryDto.toEventTeamComplianceSummaryOrNull(): EventTeamComplianceSummary? {
    val normalizedTeamId = teamId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventTeamComplianceSummary(
        teamId = normalizedTeamId,
        teamName = teamName?.trim()?.takeIf(String::isNotBlank) ?: "Team",
        payment = payment.toEventCompliancePaymentSummary(),
        documents = documents.toEventComplianceDocumentCounts(),
        users = users.mapNotNull(EventComplianceUserSummaryDto::toEventComplianceUserSummaryOrNull),
        registrationAnswers = registrationAnswers.mapNotNull(RegistrationQuestionAnswerSnapshotDto::toEventRegistrationQuestionAnswerOrNull),
    )
}
internal fun StandingsDivisionDto.toLeagueDivisionStandings(): LeagueDivisionStandings {
    val confirmedAt = standingsConfirmedAt
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { value -> runCatching { Instant.parse(value) }.getOrNull() }
    val validationMessages = validation.mappingErrors + validation.capacityErrors

    return LeagueDivisionStandings(
        divisionId = divisionId,
        divisionName = divisionName,
        standingsConfirmedAt = confirmedAt,
        standingsConfirmedBy = standingsConfirmedBy?.trim()?.takeIf(String::isNotBlank),
        rows = standings.map { row ->
            LeagueStandingsRow(
                position = row.position,
                teamId = row.teamId,
                teamName = row.teamName,
                wins = row.wins,
                losses = row.losses,
                draws = row.draws,
                goalsFor = row.goalsFor,
                goalsAgainst = row.goalsAgainst,
                goalDifference = row.goalDifference,
                matchesPlayed = row.matchesPlayed,
                basePoints = row.basePoints,
                finalPoints = row.finalPoints,
                pointsDelta = row.pointsDelta,
            )
        },
        validationMessages = validationMessages,
    )
}
@Serializable
internal data class EventModerationReportRequestDto(
    val targetType: String,
    val targetId: String,
    val category: String,
    val notes: String? = null,
)

@Serializable
internal data class EventModerationReportResponseDto(
    val hiddenEventIds: List<String> = emptyList(),
)
