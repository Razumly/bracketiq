@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DEFAULT_EVENT_SEED_COLOR_ARGB
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_ONLINE
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.isManualRegistrationPaymentMode
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentInstructions
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentLinks
import com.razumly.mvp.core.data.dataTypes.normalizeRegistrationPaymentMode
import com.razumly.mvp.core.data.dataTypes.requiresTeamOfficials
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionDetails
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.native.ObjCName
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private fun DivisionDetail.isPlayoffDivisionKind(): Boolean =
    kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true

@Serializable
data class EventApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,

    val name: String? = null,
    @property:ObjCName(swiftName = "eventDescription")
    val description: String? = null,

    val divisions: List<String>? = null,
    val divisionDetails: List<DivisionDetail>? = null,
    val playoffDivisionDetails: List<DivisionDetail>? = null,
    val location: String? = null,
    val address: String? = null,

    val start: String? = null,
    val end: String? = null,
    val timeZone: String? = null,

    val price: Int? = null,
    val rating: Double? = null,
    val imageId: String? = null,
    val coordinates: List<Double>? = null,

    val hostId: String? = null,
    val assistantHostIds: List<String>? = null,
    val noFixedEndDateTime: Boolean? = null,
    val teamSignup: Boolean? = null,
    val singleDivision: Boolean? = null,
    val registrationByDivisionType: Boolean? = null,

    val freeAgentIds: List<String>? = null,
    val waitListIds: List<String>? = null,
    val userIds: List<String>? = null,
    val teamIds: List<String>? = null,

    val cancellationRefundHours: Int? = null,
    val registrationCutoffHours: Int? = null,
    val seedColor: Int? = null,

    val sportId: String? = null,
    val timeSlotIds: List<String>? = null,
    val fieldIds: List<String>? = null,
    val leagueScoringConfigId: String? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
    val organizationId: String? = null,
    val affiliateUrl: String? = null,
    val registrationPaymentMode: String? = null,
    val manualPaymentLinks: List<ManualPaymentLink>? = null,
    val manualPaymentInstructions: String? = null,

    val autoCancellation: Boolean? = null,
    val maxParticipants: Int? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val teamSizeLimit: Int? = null,

    val eventType: String? = null,
    val fieldCount: Int? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean? = null,
    val includePlayoffsOrPools: Boolean? = null,
    val splitLeaguePlayoffDivisions: Boolean? = null,
    val playoffTeamCount: Int? = null,

    val doubleElimination: Boolean? = null,
    val winnerSetCount: Int? = null,
    val loserSetCount: Int? = null,
    val winnerBracketPointsToVictory: List<Int>? = null,
    val loserBracketPointsToVictory: List<Int>? = null,
    val prize: String? = null,

    val usesSets: Boolean? = null,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean? = null,
    val matchRulesOverride: MatchRulesConfigMVP? = null,
    val autoCreatePointMatchIncidents: Boolean? = null,
    val resolvedMatchRules: ResolvedMatchRulesMVP? = null,
    val restTimeMinutes: Int? = null,

    val state: String? = null,
    val pointsToVictory: List<Int>? = null,
    val officialSchedulingMode: String? = null,
    val officialPositions: List<EventOfficialPosition>? = null,
    val eventOfficials: List<EventOfficial>? = null,
    val officialIds: List<String>? = null,
    val staffInvites: List<Invite>? = null,

    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String>? = null,
    val installmentDueRelativeDays: List<Int>? = null,
    val installmentAmounts: List<Int>? = null,
    val allowTeamSplitDefault: Boolean? = null,
    val requiredTemplateIds: List<String>? = null,

    val prizeTitle: String? = null, // legacy/unused; ignore if present
) {
    @OptIn(ExperimentalTime::class)
    fun toEventOrNull(): Event? {
        val resolvedId = id ?: legacyId
        val resolvedName = name
        val resolvedHostId = hostId
        val resolvedStart = start
        val resolvedEnd = end
        val resolvedAffiliateUrl = affiliateUrl?.trim()?.takeIf(String::isNotBlank)
        if (resolvedId.isNullOrBlank() || resolvedName.isNullOrBlank()) return null
        if (resolvedHostId.isNullOrBlank() && resolvedAffiliateUrl == null) return null
        if (resolvedStart.isNullOrBlank()) return null
        val parsedStart = runCatching { Instant.parse(resolvedStart) }.getOrNull() ?: return null

        val normalizedEventType = eventType?.trim()?.uppercase()
        val resolvedEventType = runCatching { EventType.valueOf(normalizedEventType ?: EventType.EVENT.name) }
            .getOrDefault(EventType.EVENT)
        val resolvedNoFixedEndDateTime = noFixedEndDateTime ?: false
        val parsedEnd = when {
            !resolvedEnd.isNullOrBlank() -> runCatching { Instant.parse(resolvedEnd) }.getOrNull()
            resolvedNoFixedEndDateTime -> parsedStart
            else -> null
        } ?: return null
        val normalizedResponseDetails = (divisionDetails ?: emptyList()).normalizeDivisionDetails(resolvedId)
        val normalizedRegularDetails = normalizedResponseDetails.filterNot(DivisionDetail::isPlayoffDivisionKind)
        val normalizedPlayoffDetails = (
            normalizedResponseDetails.filter(DivisionDetail::isPlayoffDivisionKind) +
                (playoffDivisionDetails ?: emptyList()).map { detail ->
                    detail.copy(kind = detail.kind?.takeIf { kind -> kind.isNotBlank() } ?: "PLAYOFF")
                }
            )
            .normalizeDivisionDetails(resolvedId)
            .map { detail ->
                detail.copy(kind = detail.kind?.takeIf { kind -> kind.isNotBlank() } ?: "PLAYOFF")
            }
        val allNormalizedDetails = (normalizedRegularDetails + normalizedPlayoffDetails)
            .fold(mutableListOf<DivisionDetail>()) { acc, detail ->
                val normalizedId = detail.id.normalizeDivisionIdentifier()
                val alreadyAdded = acc.any { existing ->
                    existing.id.normalizeDivisionIdentifier() == normalizedId
                }
                if (!alreadyAdded) {
                    acc += detail
                }
                acc
            }
        val normalizedDivisions = when {
            divisions != null -> divisions.normalizeDivisionIdentifiers()
            normalizedRegularDetails.isNotEmpty() -> normalizedRegularDetails
                .map { detail -> detail.id }
                .normalizeDivisionIdentifiers()
            else -> normalizedPlayoffDetails
                .map { detail -> detail.id }
                .normalizeDivisionIdentifiers()
        }
        val mergedRegularDetails = mergeDivisionDetailsForDivisions(
            divisions = normalizedDivisions,
            existingDetails = allNormalizedDetails,
            eventId = resolvedId,
        )
        val mergedDetailIds = mergedRegularDetails
            .map { detail -> detail.id }
            .normalizeDivisionIdentifiers()
            .toSet()
        val mergedDetails = mergedRegularDetails + normalizedPlayoffDetails.filter { detail ->
            detail.id.normalizeDivisionIdentifier() !in mergedDetailIds
        }
        val resolvedFieldIds = (fieldIds ?: emptyList())
            .map { fieldId -> fieldId.trim() }
            .filter(String::isNotBlank)
            .distinct()
        val resolvedFieldCount = resolvedFieldIds.size.takeIf { count -> count > 0 }
        val resolvedPriceCents = (price ?: 0).coerceAtLeast(0)
        val resolvedMaxParticipants = (maxParticipants ?: 0).coerceAtLeast(0)
        val resolvedIncludePlayoffsOrPools = includePlayoffsOrPools ?: includePlayoffs ?: false
        val resolvedEventPlayoffTeamCount = playoffTeamCount
        val resolvedEventInstallmentAmounts = (installmentAmounts ?: emptyList())
            .map { amount -> amount.coerceAtLeast(0) }
        val resolvedEventInstallmentDueDates = (installmentDueDates ?: emptyList())
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val resolvedEventInstallmentDueRelativeDays = (installmentDueRelativeDays ?: emptyList())
        val resolvedEventInstallmentCount = maxOf(
            installmentCount ?: 0,
            resolvedEventInstallmentAmounts.size,
            resolvedEventInstallmentDueDates.size,
            resolvedEventInstallmentDueRelativeDays.size,
        ).takeIf { count -> count > 0 }
        val resolvedEventAllowPaymentPlans = allowPaymentPlans == true &&
            resolvedEventInstallmentCount != null &&
            resolvedPriceCents > 0
        val resolvedRegistrationPaymentMode = normalizeRegistrationPaymentMode(registrationPaymentMode)
        val manualPaymentsEnabled = isManualRegistrationPaymentMode(resolvedRegistrationPaymentMode)
        val mergedDetailsWithCapacity = mergedDetails.map { detail ->
            detail.copy(
                price = detail.price?.coerceAtLeast(0),
                maxParticipants = detail.maxParticipants?.coerceAtLeast(2),
                playoffTeamCount = when {
                    !resolvedIncludePlayoffsOrPools -> null
                    singleDivision != false -> resolvedEventPlayoffTeamCount
                    else -> detail.playoffTeamCount
                },
                allowPaymentPlans = if (singleDivision != false) {
                    resolvedEventAllowPaymentPlans
                } else {
                    detail.allowPaymentPlans ?: resolvedEventAllowPaymentPlans
                },
                installmentCount = if (singleDivision != false) {
                    resolvedEventInstallmentCount
                } else {
                    maxOf(
                        detail.installmentCount ?: 0,
                        detail.installmentAmounts.size,
                        detail.installmentDueDates.size,
                        detail.installmentDueRelativeDays.size,
                    ).takeIf { count -> count > 0 } ?: resolvedEventInstallmentCount
                },
                installmentDueDates = if (singleDivision != false) {
                    resolvedEventInstallmentDueDates
                } else {
                    val normalized = detail.installmentDueDates
                        .map { dueDate -> dueDate.trim() }
                        .filter(String::isNotBlank)
                    if (normalized.isNotEmpty()) normalized else resolvedEventInstallmentDueDates
                },
                installmentDueRelativeDays = if (singleDivision != false) {
                    resolvedEventInstallmentDueRelativeDays
                } else {
                    if (detail.installmentDueRelativeDays.isNotEmpty()) {
                        detail.installmentDueRelativeDays
                    } else {
                        resolvedEventInstallmentDueRelativeDays
                    }
                },
                installmentAmounts = if (singleDivision != false) {
                    resolvedEventInstallmentAmounts
                } else {
                    val normalized = detail.installmentAmounts
                        .map { amount -> amount.coerceAtLeast(0) }
                    if (normalized.isNotEmpty()) normalized else resolvedEventInstallmentAmounts
                },
            )
        }

        val resolvedOfficialSchedulingMode = runCatching {
            OfficialSchedulingMode.valueOf(
                officialSchedulingMode?.trim()?.uppercase() ?: OfficialSchedulingMode.SCHEDULE.name,
            )
        }.getOrDefault(OfficialSchedulingMode.SCHEDULE)
        val effectiveDoTeamsOfficiate = if (resolvedOfficialSchedulingMode.requiresTeamOfficials()) {
            true
        } else {
            doTeamsOfficiate
        }
        val normalizedEventOfficials = when {
            !eventOfficials.isNullOrEmpty() -> eventOfficials
            !officialIds.isNullOrEmpty() -> officialIds.mapNotNull { officialId ->
                val normalizedUserId = officialId.trim()
                if (normalizedUserId.isBlank()) {
                    null
                } else {
                    EventOfficial(
                        id = buildEventOfficialRecordId(resolvedId, normalizedUserId),
                        userId = normalizedUserId,
                        positionIds = officialPositions?.map(EventOfficialPosition::id).orEmpty(),
                        fieldIds = emptyList(),
                        isActive = true,
                    )
                }
            }
            else -> emptyList()
        }

        return Event(
            id = resolvedId,
            name = resolvedName,
            description = description ?: "",
            divisions = normalizedDivisions,
            divisionDetails = mergedDetailsWithCapacity,
            location = location ?: "",
            address = address,
            start = parsedStart,
            end = parsedEnd,
            timeZone = timeZone?.trim()?.takeIf(String::isNotBlank) ?: "UTC",
            priceCents = resolvedPriceCents,
            rating = rating,
            imageId = imageId ?: "",
            coordinates = coordinates ?: listOf(0.0, 0.0),
            hostId = resolvedHostId.orEmpty(),
            assistantHostIds = assistantHostIds ?: emptyList(),
            noFixedEndDateTime = resolvedNoFixedEndDateTime,
            teamSignup = teamSignup ?: true,
            singleDivision = singleDivision ?: true,
            freeAgentIds = freeAgentIds ?: emptyList(),
            waitListIds = waitListIds ?: emptyList(),
            userIds = userIds ?: emptyList(),
            teamIds = teamIds ?: emptyList(),
            cancellationRefundHours = cancellationRefundHours,
            registrationCutoffHours = registrationCutoffHours ?: 0,
            seedColor = seedColor ?: DEFAULT_EVENT_SEED_COLOR_ARGB,
            sportId = sportId,
            timeSlotIds = timeSlotIds ?: emptyList(),
            fieldIds = resolvedFieldIds,
            leagueScoringConfigId = leagueScoringConfigId,
            organizationId = organizationId,
            affiliateUrl = resolvedAffiliateUrl,
            registrationPaymentMode = resolvedRegistrationPaymentMode,
            manualPaymentLinks = if (manualPaymentsEnabled) {
                normalizeManualPaymentLinks(manualPaymentLinks)
            } else {
                emptyList()
            },
            manualPaymentInstructions = if (manualPaymentsEnabled) {
                normalizeManualPaymentInstructions(manualPaymentInstructions)
            } else {
                null
            },
            autoCancellation = autoCancellation ?: false,
            maxParticipants = resolvedMaxParticipants,
            minAge = minAge,
            maxAge = maxAge,
            teamSizeLimit = (teamSizeLimit ?: 0).takeIf { it > 0 } ?: 2,
            registrationByDivisionType = registrationByDivisionType ?: false,
            eventType = resolvedEventType,
            fieldCount = resolvedFieldCount,
            gamesPerOpponent = gamesPerOpponent,
            includePlayoffs = resolvedIncludePlayoffsOrPools,
            splitLeaguePlayoffDivisions = splitLeaguePlayoffDivisions ?: false,
            playoffTeamCount = resolvedEventPlayoffTeamCount,
            doubleElimination = doubleElimination ?: false,
            winnerSetCount = winnerSetCount ?: 1,
            loserSetCount = loserSetCount ?: 0,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory ?: emptyList(),
            loserBracketPointsToVictory = loserBracketPointsToVictory ?: emptyList(),
            prize = prize ?: "",
            usesSets = usesSets ?: false,
            matchDurationMinutes = matchDurationMinutes,
            setDurationMinutes = setDurationMinutes,
            setsPerMatch = setsPerMatch,
            doTeamsOfficiate = effectiveDoTeamsOfficiate,
            teamOfficialsMaySwap = if (effectiveDoTeamsOfficiate == true) teamOfficialsMaySwap else false,
            matchRulesOverride = matchRulesOverride,
            autoCreatePointMatchIncidents = autoCreatePointMatchIncidents ?: false,
            resolvedMatchRules = resolvedMatchRules,
            restTimeMinutes = restTimeMinutes,
            state = state ?: "UNPUBLISHED",
            pointsToVictory = pointsToVictory ?: emptyList(),
            officialSchedulingMode = resolvedOfficialSchedulingMode,
            officialPositions = officialPositions ?: emptyList(),
            eventOfficials = normalizedEventOfficials,
            officialIds = normalizedEventOfficials.map(EventOfficial::userId),
            allowPaymentPlans = resolvedEventAllowPaymentPlans,
            installmentCount = resolvedEventInstallmentCount,
            installmentDueDates = resolvedEventInstallmentDueDates,
            installmentDueRelativeDays = resolvedEventInstallmentDueRelativeDays,
            installmentAmounts = resolvedEventInstallmentAmounts,
            allowTeamSplitDefault = allowTeamSplitDefault,
            requiredTemplateIds = requiredTemplateIds ?: emptyList(),
            lastUpdated = Clock.System.now(),
        )
    }
}

@Serializable
data class EventsResponseDto(
    val events: List<EventApiDto> = emptyList(),
)

@Serializable
data class EventResponseDto(
    val event: EventApiDto? = null,
)

@Serializable
data class ScheduleEventRequestDto(
    val participantCount: Int? = null,
    val includePlaceholderTeams: Boolean? = null,
)

@Serializable
data class ScheduleEventResponseDto(
    val preview: Boolean? = null,
    val event: EventApiDto? = null,
    val matches: List<MatchApiDto> = emptyList(),
)

@Serializable
data class EventSearchUserLocationDto(
    val lat: Double,
    val lng: Double? = null,
    val long: Double? = null,
)

@Serializable
data class EventSearchFiltersDto(
    val query: String? = null,
    val maxDistance: Double? = null,
    val userLocation: EventSearchUserLocationDto? = null,
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val priceMax: Int? = null,
    val eventTypes: List<String>? = null,
    val sports: List<String>? = null,
    val divisions: List<String>? = null,
)

@Serializable
data class EventSearchRequestDto(
    val filters: EventSearchFiltersDto? = null,
    val limit: Int? = null,
    val offset: Int? = null,
)

@Serializable
data class EventParticipantsRequestDto(
    val userId: String? = null,
    val teamId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val refundMode: String? = null,
    val refundReason: String? = null,
    val answers: List<RegistrationQuestionAnswerDto> = emptyList(),
)

@Serializable
data class EventParticipantsResponseDto(
    val event: EventApiDto? = null,
    val requiresParentApproval: Boolean? = null,
    val error: String? = null,
)

@Serializable
data class EventChildRegistrationRequestDto(
    val childId: String,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
)

@Serializable
data class EventRegistrationStatusDto(
    val id: String? = null,
    val status: String? = null,
    val consentStatus: String? = null,
)

@Serializable
data class EventConsentStatusDto(
    val documentId: String? = null,
    val status: String? = null,
    val requiresChildEmail: Boolean? = null,
)

@Serializable
data class EventChildRegistrationResponseDto(
    val registration: EventRegistrationStatusDto? = null,
    val consent: EventConsentStatusDto? = null,
    val requiresParentApproval: Boolean? = null,
    val warnings: List<String> = emptyList(),
    val error: String? = null,
)

@Serializable
data class EventParticipantEntryDto(
    val registrationId: String? = null,
    val registrantId: String? = null,
    val registrantType: String? = null,
    val rosterRole: String? = null,
    val status: String? = null,
    val parentId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val consentDocumentId: String? = null,
    val consentStatus: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class EventParticipantDivisionIdsDto(
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val teamIds: List<String> = emptyList(),
    val userIds: List<String> = emptyList(),
    val waitListIds: List<String> = emptyList(),
    val freeAgentIds: List<String> = emptyList(),
)

@Serializable
data class EventParticipantIdsSnapshotDto(
    val teamIds: List<String> = emptyList(),
    val userIds: List<String> = emptyList(),
    val waitListIds: List<String> = emptyList(),
    val freeAgentIds: List<String> = emptyList(),
    val divisions: List<EventParticipantDivisionIdsDto> = emptyList(),
)

@Serializable
data class EventParticipantDivisionWarningDto(
    val divisionId: String? = null,
    val code: String? = null,
    val message: String? = null,
    val filledCount: Int? = null,
    val slotCount: Int? = null,
    val maxTeams: Int? = null,
)

@Serializable
data class EventParticipantRegistrationSectionsDto(
    val teams: List<EventParticipantEntryDto> = emptyList(),
    val users: List<EventParticipantEntryDto> = emptyList(),
    val children: List<EventParticipantEntryDto> = emptyList(),
    val waitlist: List<EventParticipantEntryDto> = emptyList(),
    val freeAgents: List<EventParticipantEntryDto> = emptyList(),
)

@Serializable
data class EventOccurrenceDto(
    val slotId: String? = null,
    val occurrenceDate: String? = null,
)

@Serializable
data class EventParticipantsSnapshotResponseDto(
    val event: EventApiDto? = null,
    val participants: EventParticipantIdsSnapshotDto = EventParticipantIdsSnapshotDto(),
    val registrations: EventParticipantRegistrationSectionsDto? = null,
    val teams: List<TeamApiDto> = emptyList(),
    val users: List<UserProfileDto> = emptyList(),
    val participantCount: Int? = null,
    val participantCapacity: Int? = null,
    val occurrence: EventOccurrenceDto? = null,
    val divisionWarnings: List<EventParticipantDivisionWarningDto> = emptyList(),
    val weeklySelectionRequired: Boolean? = null,
    val error: String? = null,
)

@Serializable
data class EventCompliancePaymentSummaryDto(
    val hasBill: Boolean? = null,
    val billId: String? = null,
    val totalAmountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val status: String? = null,
    val isPaidInFull: Boolean? = null,
    val paymentPending: Boolean? = null,
    val inheritedFromTeamBill: Boolean? = null,
    val manualPaymentProofStatus: String? = null,
    val manualPaymentProofCount: Int? = null,
)

@Serializable
data class EventComplianceDocumentCountsDto(
    val signedCount: Int? = null,
    val requiredCount: Int? = null,
)

@Serializable
data class EventComplianceRequiredDocumentDto(
    val key: String? = null,
    val templateId: String? = null,
    val title: String? = null,
    val type: String? = null,
    val signerContext: String? = null,
    val signerLabel: String? = null,
    val signOnce: Boolean? = null,
    val status: String? = null,
    val signedDocumentRecordId: String? = null,
    val signedAt: String? = null,
)

@Serializable
data class RegistrationQuestionAnswerSnapshotDto(
    val questionId: String? = null,
    val prompt: String? = null,
    val answerType: String? = null,
    val required: Boolean? = null,
    val sortOrder: Int? = null,
    val answer: String? = null,
)

@Serializable
data class EventComplianceUserSummaryDto(
    val userId: String? = null,
    val fullName: String? = null,
    val userName: String? = null,
    val isMinorAtEvent: Boolean? = null,
    val registrationType: String? = null,
    val payment: EventCompliancePaymentSummaryDto? = null,
    val documents: EventComplianceDocumentCountsDto? = null,
    val requiredDocuments: List<EventComplianceRequiredDocumentDto> = emptyList(),
    val registrationAnswers: List<RegistrationQuestionAnswerSnapshotDto> = emptyList(),
)

@Serializable
data class EventTeamComplianceSummaryDto(
    val teamId: String? = null,
    val teamName: String? = null,
    val payment: EventCompliancePaymentSummaryDto? = null,
    val documents: EventComplianceDocumentCountsDto? = null,
    val users: List<EventComplianceUserSummaryDto> = emptyList(),
    val registrationAnswers: List<RegistrationQuestionAnswerSnapshotDto> = emptyList(),
)

@Serializable
data class EventTeamComplianceResponseDto(
    val teams: List<EventTeamComplianceSummaryDto> = emptyList(),
)

@Serializable
data class EventUserComplianceResponseDto(
    val users: List<EventComplianceUserSummaryDto> = emptyList(),
)

@Serializable
data class CurrentUserEventRegistrationDto(
    val id: String? = null,
    val eventId: String? = null,
    val registrantId: String? = null,
    val parentId: String? = null,
    val registrantType: String? = null,
    val rosterRole: String? = null,
    val status: String? = null,
    val eventTeamId: String? = null,
    val sourceTeamRegistrationId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val jerseyNumber: String? = null,
    val position: String? = null,
    val isCaptain: Boolean? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class CurrentUserEventRegistrationsResponseDto(
    val registrations: List<CurrentUserEventRegistrationDto> = emptyList(),
)

@Serializable
data class ProfileScheduleResponseDto(
    val events: List<EventApiDto> = emptyList(),
    val matches: List<MatchApiDto> = emptyList(),
    val teams: List<TeamApiDto> = emptyList(),
    val fields: List<Field> = emptyList(),
)

@Serializable
data class EventDetailBootstrapResponseDto(
    val event: EventApiDto? = null,
    val participantSnapshot: EventParticipantsSnapshotResponseDto? = null,
    val matches: List<MatchApiDto> = emptyList(),
    val fields: List<Field> = emptyList(),
    val timeSlots: List<TimeSlot> = emptyList(),
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
    val staffInvites: List<Invite> = emptyList(),
    val teamCompliance: EventTeamComplianceResponseDto? = null,
    val userCompliance: EventUserComplianceResponseDto? = null,
)

@Serializable
data class EventUpdateDto(
    val name: String? = null,
    val start: String? = null,
    val end: String? = null,
    val timeZone: String? = null,
    @property:ObjCName(swiftName = "eventDescription")
    val description: String? = null,
    val divisions: List<String>? = null,
    val divisionDetails: List<DivisionDetail> = emptyList(),
    val playoffDivisionDetails: List<DivisionDetail> = emptyList(),
    val winnerSetCount: Int? = null,
    val loserSetCount: Int? = null,
    val doubleElimination: Boolean? = null,
    val location: String? = null,
    val address: String? = null,
    val rating: Double? = null,
    val teamSizeLimit: Int? = null,
    val maxParticipants: Int? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val hostId: String? = null,
    val assistantHostIds: List<String>? = null,
    val noFixedEndDateTime: Boolean? = null,
    val price: Int? = null,
    val singleDivision: Boolean? = null,
    val registrationByDivisionType: Boolean? = null,
    val cancellationRefundHours: Int? = null,
    val teamSignup: Boolean? = null,
    val prize: String? = null,
    val registrationCutoffHours: Int? = null,
    val seedColor: Int? = null,
    val imageId: String? = null,
    val fieldCount: Int? = null,
    val winnerBracketPointsToVictory: List<Int>? = null,
    val loserBracketPointsToVictory: List<Int>? = null,
    val coordinates: List<Double>? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean? = null,
    val includePlayoffsOrPools: Boolean? = null,
    val splitLeaguePlayoffDivisions: Boolean? = null,
    val playoffTeamCount: Int? = null,
    val usesSets: Boolean? = null,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val restTimeMinutes: Int? = null,
    val state: String? = null,
    val pointsToVictory: List<Int>? = null,
    val officialSchedulingMode: String? = null,
    val officialPositions: List<EventOfficialPosition>? = null,
    val eventOfficials: List<EventOfficial>? = null,
    val sportId: String? = null,
    val timeSlotIds: List<String>? = null,
    val fieldIds: List<String>? = null,
    val fields: List<Field>? = null,
    val timeSlots: List<TimeSlot>? = null,
    val leagueScoringConfigId: String? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
    val organizationId: String? = null,
    val affiliateUrl: String? = null,
    val registrationPaymentMode: String? = null,
    val manualPaymentLinks: List<ManualPaymentLink>? = null,
    val manualPaymentInstructions: String? = null,
    val autoCancellation: Boolean? = null,
    val eventType: String? = null,
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean? = null,
    val matchRulesOverride: MatchRulesConfigMVP? = null,
    val autoCreatePointMatchIncidents: Boolean? = null,
    @Transient val officialIds: List<String>? = null,
    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String>? = null,
    val installmentDueRelativeDays: List<Int>? = null,
    val installmentAmounts: List<Int>? = null,
    val allowTeamSplitDefault: Boolean? = null,
    val requiredTemplateIds: List<String>? = null,
)

@Serializable
data class CreateEventRequestDto(
    val id: String,
    val event: EventUpdateDto,
    val newFields: List<Field>? = null,
    val timeSlots: List<TimeSlot>? = null,
    val leagueScoringConfig: LeagueScoringConfigDTO? = null,
)

@Serializable
data class UpdateEventRequestDto(
    val event: EventUpdateDto,
)

private fun DivisionDetail.isTournamentPoolBracketPayloadDetail(): Boolean {
    if (kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true) return true
    if (playoffPlacementDivisionIds.any { divisionId -> divisionId.isNotBlank() }) return false
    return poolCount != null ||
        poolTeamCount != null ||
        playoffConfig != null
}

fun Event.toUpdateDto(
    requiredTemplateIdsOverride: List<String>? = null,
    leagueScoringConfigOverride: LeagueScoringConfigDTO? = null,
    fieldsOverride: List<Field>? = null,
    timeSlotsOverride: List<TimeSlot>? = null,
    includeOrganizationId: Boolean = true,
    includeFieldObjects: Boolean = true,
    includeTimeSlotObjects: Boolean = true,
    applyEventDefaultsToMissingDivisionDetails: Boolean = false,
): EventUpdateDto {
    val sourceRequiredTemplateIds = requiredTemplateIdsOverride ?: requiredTemplateIds
    val resolvedRequiredTemplateIds = sourceRequiredTemplateIds
        .map { templateId -> templateId.trim() }
        .filter { templateId -> templateId.isNotEmpty() }
        .distinct()
    val normalizedDivisions = divisions.normalizeDivisionIdentifiers()
    val normalizedDivisionDetails = mergeDivisionDetailsForDivisions(
        divisions = normalizedDivisions,
        existingDetails = divisionDetails,
        eventId = id,
    )
    val normalizedAllDivisionDetails = divisionDetails.normalizeDivisionDetails(id)
    val isTournamentPoolPlay = eventType == EventType.TOURNAMENT && includePlayoffs
    val tournamentPoolBracketDetails = if (isTournamentPoolPlay) {
        normalizedAllDivisionDetails
            .filter(DivisionDetail::isTournamentPoolBracketPayloadDetail)
            .map { detail ->
                detail.copy(
                    kind = "PLAYOFF",
                    playoffPlacementDivisionIds = emptyList(),
                    teamIds = emptyList(),
                    fieldIds = emptyList(),
                )
            }
    } else {
        emptyList()
    }
    val tournamentPoolBracketIds = tournamentPoolBracketDetails
        .flatMap { detail -> listOf(detail.id, detail.key) }
        .normalizeDivisionIdentifiers()
        .toSet()
    val regularDivisionDetailsForPayload = if (isTournamentPoolPlay && tournamentPoolBracketIds.isNotEmpty()) {
        normalizedDivisionDetails.filterNot { detail ->
            listOf(detail.id, detail.key)
                .normalizeDivisionIdentifiers()
                .any { divisionId -> divisionId in tournamentPoolBracketIds }
        }
    } else {
        normalizedDivisionDetails
    }
    fun normalizeDivisionDetailForPayload(detail: DivisionDetail): DivisionDetail {
        val defaultPriceForCreate = priceCents.coerceAtLeast(0)
        val fallbackMaxParticipantsForCreate = maxParticipants.coerceAtLeast(2)
        val resolvedMaxParticipantsForDetail = if (applyEventDefaultsToMissingDivisionDetails) {
            (detail.maxParticipants ?: fallbackMaxParticipantsForCreate).coerceAtLeast(2)
        } else {
            detail.maxParticipants?.coerceAtLeast(2) ?: 0
        }
        val normalizedPoolCount = detail.poolCount?.takeIf { count -> count >= 1 }
        val normalizedPoolTeamCount = if (
            isTournamentPoolPlay &&
            normalizedPoolCount != null &&
            resolvedMaxParticipantsForDetail % normalizedPoolCount == 0
        ) {
            resolvedMaxParticipantsForDetail / normalizedPoolCount
        } else {
            null
        }
        val defaultInstallmentAmounts = installmentAmounts.map { amount -> amount.coerceAtLeast(0) }
        val defaultInstallmentDueDates = installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val defaultInstallmentDueRelativeDays = installmentDueRelativeDays
        val defaultInstallmentCount = maxOf(
            installmentCount ?: 0,
            defaultInstallmentAmounts.size,
            defaultInstallmentDueDates.size,
            defaultInstallmentDueRelativeDays.size,
        ).takeIf { count -> count > 0 }
        val defaultAllowPaymentPlans = allowPaymentPlans == true &&
            defaultInstallmentCount != null &&
            priceCents > 0
        val detailInstallmentAmounts = detail.installmentAmounts
            .map { amount -> amount.coerceAtLeast(0) }
        val detailInstallmentDueDates = detail.installmentDueDates
            .map { dueDate -> dueDate.trim() }
            .filter(String::isNotBlank)
        val detailInstallmentCount = maxOf(
            detail.installmentCount ?: 0,
            detailInstallmentAmounts.size,
            detailInstallmentDueDates.size,
            detail.installmentDueRelativeDays.size,
        ).takeIf { count -> count > 0 }
        val detailPrice = if (applyEventDefaultsToMissingDivisionDetails) {
            (detail.price ?: defaultPriceForCreate).coerceAtLeast(0)
        } else {
            detail.price?.coerceAtLeast(0)
        }
        val detailAllowPaymentPlans = detail.allowPaymentPlans == true &&
            detailInstallmentCount != null &&
            (detailPrice ?: 0) > 0
        return detail.copy(
            price = detailPrice,
            maxParticipants = if (applyEventDefaultsToMissingDivisionDetails) {
                (detail.maxParticipants ?: fallbackMaxParticipantsForCreate).coerceAtLeast(2)
            } else {
                detail.maxParticipants?.coerceAtLeast(2)
            },
            playoffTeamCount = when {
                !includePlayoffs -> null
                singleDivision -> playoffTeamCount
                else -> detail.playoffTeamCount
            },
            poolCount = if (isTournamentPoolPlay) normalizedPoolCount else null,
            poolTeamCount = if (isTournamentPoolPlay) normalizedPoolTeamCount else null,
            allowPaymentPlans = if (singleDivision) {
                if (applyEventDefaultsToMissingDivisionDetails) defaultAllowPaymentPlans else detailAllowPaymentPlans
            } else {
                detailAllowPaymentPlans
            },
            installmentCount = if (singleDivision) {
                if (applyEventDefaultsToMissingDivisionDetails) {
                    defaultInstallmentCount
                } else if (detailAllowPaymentPlans) {
                    detailInstallmentCount
                } else {
                    null
                }
            } else if (detailAllowPaymentPlans) {
                detailInstallmentCount
            } else {
                null
            },
            installmentDueDates = if (singleDivision) {
                if (applyEventDefaultsToMissingDivisionDetails) {
                    defaultInstallmentDueDates
                } else if (detailAllowPaymentPlans) {
                    detailInstallmentDueDates
                } else {
                    emptyList()
                }
            } else if (detailAllowPaymentPlans) {
                detailInstallmentDueDates
            } else {
                emptyList()
            },
            installmentDueRelativeDays = if (singleDivision) {
                if (applyEventDefaultsToMissingDivisionDetails) {
                    defaultInstallmentDueRelativeDays
                } else if (detailAllowPaymentPlans) {
                    detail.installmentDueRelativeDays
                } else {
                    emptyList()
                }
            } else if (detailAllowPaymentPlans) {
                detail.installmentDueRelativeDays
            } else {
                emptyList()
            },
            installmentAmounts = if (singleDivision) {
                if (applyEventDefaultsToMissingDivisionDetails) {
                    defaultInstallmentAmounts
                } else if (detailAllowPaymentPlans) {
                    detailInstallmentAmounts
                } else {
                    emptyList()
                }
            } else if (detailAllowPaymentPlans) {
                detailInstallmentAmounts
            } else {
                emptyList()
            },
        )
    }
    val normalizedDivisionDetailsForPayload = regularDivisionDetailsForPayload.map(::normalizeDivisionDetailForPayload)
    val normalizedPlayoffDivisionDetailsForPayload = tournamentPoolBracketDetails.map(::normalizeDivisionDetailForPayload)

    val effectiveDoTeamsOfficiate = if (officialSchedulingMode.requiresTeamOfficials()) true else doTeamsOfficiate
    val resolvedRegistrationPaymentMode = normalizeRegistrationPaymentMode(registrationPaymentMode)
    val manualPaymentsEnabled = isManualRegistrationPaymentMode(resolvedRegistrationPaymentMode)

    return EventUpdateDto(
        name = name,
        start = start.toString(),
        end = end.toString(),
        timeZone = timeZone,
        description = description,
        divisions = normalizedDivisions,
        divisionDetails = normalizedDivisionDetailsForPayload,
        playoffDivisionDetails = normalizedPlayoffDivisionDetailsForPayload,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        doubleElimination = doubleElimination,
        location = location,
        address = address,
        rating = rating,
        teamSizeLimit = teamSizeLimit,
        maxParticipants = maxParticipants,
        minAge = minAge,
        maxAge = maxAge,
        hostId = hostId,
        assistantHostIds = assistantHostIds,
        noFixedEndDateTime = noFixedEndDateTime,
        price = priceCents,
        singleDivision = singleDivision,
        registrationByDivisionType = registrationByDivisionType,
        cancellationRefundHours = cancellationRefundHours,
        teamSignup = teamSignup,
        prize = prize,
        registrationCutoffHours = registrationCutoffHours,
        seedColor = seedColor,
        imageId = imageId,
        fieldCount = null,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        coordinates = coordinates,
        gamesPerOpponent = gamesPerOpponent,
        includePlayoffs = includePlayoffs,
        includePlayoffsOrPools = includePlayoffs,
        splitLeaguePlayoffDivisions = splitLeaguePlayoffDivisions,
        playoffTeamCount = if (includePlayoffs) {
            playoffTeamCount
        } else {
            null
        },
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
        setsPerMatch = setsPerMatch,
        restTimeMinutes = restTimeMinutes,
        state = state,
        pointsToVictory = pointsToVictory,
        officialSchedulingMode = officialSchedulingMode.name,
        officialPositions = officialPositions,
        eventOfficials = eventOfficials,
        sportId = sportId,
        timeSlotIds = timeSlotIds,
        fieldIds = fieldIds,
        fields = if (includeFieldObjects) fieldsOverride else null,
        timeSlots = if (includeTimeSlotObjects) timeSlotsOverride else null,
        leagueScoringConfigId = leagueScoringConfigId,
        leagueScoringConfig = leagueScoringConfigOverride,
        organizationId = if (includeOrganizationId) organizationId else null,
        affiliateUrl = affiliateUrl?.trim()?.takeIf(String::isNotBlank),
        registrationPaymentMode = resolvedRegistrationPaymentMode,
        manualPaymentLinks = if (manualPaymentsEnabled) {
            normalizeManualPaymentLinks(manualPaymentLinks)
        } else {
            emptyList()
        },
        manualPaymentInstructions = if (manualPaymentsEnabled) {
            normalizeManualPaymentInstructions(manualPaymentInstructions)
        } else {
            null
        },
        autoCancellation = autoCancellation,
        eventType = eventType.name,
        doTeamsOfficiate = effectiveDoTeamsOfficiate,
        teamOfficialsMaySwap = if (effectiveDoTeamsOfficiate == true) teamOfficialsMaySwap else false,
        matchRulesOverride = matchRulesOverride,
        autoCreatePointMatchIncidents = autoCreatePointMatchIncidents,
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentDueDates = installmentDueDates,
        installmentDueRelativeDays = installmentDueRelativeDays,
        installmentAmounts = installmentAmounts,
        allowTeamSplitDefault = allowTeamSplitDefault,
        requiredTemplateIds = resolvedRequiredTemplateIds,
    )
}
