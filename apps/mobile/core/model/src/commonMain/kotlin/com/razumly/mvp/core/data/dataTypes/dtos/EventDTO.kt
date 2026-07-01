@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_ONLINE
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.buildEventOfficialRecordId
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.isManualRegistrationPaymentMode
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentInstructions
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentLinks
import com.razumly.mvp.core.data.dataTypes.normalizeRegistrationPaymentMode
import com.razumly.mvp.core.data.dataTypes.requiresTeamOfficials
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.native.ObjCName
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Serializable
@OptIn(ExperimentalTime::class)
data class EventDTO(
    val name: String,
    @property:ObjCName(swiftName = "eventDescription")
    val description: String = "",
    val doubleElimination: Boolean = false,
    val divisions: List<String> = emptyList(),
    val divisionDetails: List<DivisionDetail> = emptyList(),
    val winnerSetCount: Int = 1,
    val loserSetCount: Int = 0,
    val winnerBracketPointsToVictory: List<Int> = emptyList(),
    val loserBracketPointsToVictory: List<Int> = emptyList(),
    val prize: String = "",
    @Transient val id: String = "",
    val location: String = "",
    val address: String? = null,
    val start: String,
    val end: String,
    val timeZone: String = "UTC",
    val priceCents: Int = 0,
    val rating: Double? = null,
    val imageId: String = "",
    val coordinates: List<Double> = listOf(0.0, 0.0),
    val hostId: String = "",
    val assistantHostIds: List<String> = emptyList(),
    val noFixedEndDateTime: Boolean = false,
    val maxParticipants: Int = 0,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val teamSizeLimit: Int = 2,
    val teamSignup: Boolean = true,
    val singleDivision: Boolean = true,
    val registrationByDivisionType: Boolean = false,
    val waitListIds: List<String> = emptyList(),
    val freeAgentIds: List<String> = emptyList(),
    val userIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    val cancellationRefundHours: Int? = null,
    val registrationCutoffHours: Int = 0,
    val seedColor: Int = 0,
    val sportId: String? = null,
    val timeSlotIds: List<String> = emptyList(),
    val fieldIds: List<String> = emptyList(),
    val leagueScoringConfigId: String? = null,
    val organizationId: String? = null,
    val affiliateUrl: String? = null,
    val scheduleText: String? = null,
    val dateDisplayMode: String? = null,
    val dateDisplayText: String? = null,
    val registrationPaymentMode: String = REGISTRATION_PAYMENT_MODE_ONLINE,
    val manualPaymentLinks: List<ManualPaymentLink> = emptyList(),
    val manualPaymentInstructions: String? = null,
    val autoCancellation: Boolean = false,
    val eventType: String = EventType.EVENT.name,
    val fieldCount: Int? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean = false,
    val includePlayoffsOrPools: Boolean? = null,
    val splitLeaguePlayoffDivisions: Boolean = false,
    val playoffTeamCount: Int? = null,
    val usesSets: Boolean = false,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean? = null,
    val teamCheckInMode: TeamCheckInMode = TeamCheckInMode.OFF,
    val teamCheckInOpenMinutesBefore: Int = 60,
    val allowMatchRosterEdits: Boolean = false,
    val allowTemporaryMatchPlayers: Boolean = false,
    val matchRulesOverride: MatchRulesConfigMVP? = null,
    val autoCreatePointMatchIncidents: Boolean = false,
    val resolvedMatchRules: ResolvedMatchRulesMVP? = null,
    val restTimeMinutes: Int? = null,
    val state: String = "UNPUBLISHED",
    val pointsToVictory: List<Int> = emptyList(),
    val officialSchedulingMode: OfficialSchedulingMode = OfficialSchedulingMode.SCHEDULE,
    val officialPositions: List<EventOfficialPosition> = emptyList(),
    val eventOfficials: List<EventOfficial> = emptyList(),
    @Transient val officialIds: List<String> = emptyList(),
    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String> = emptyList(),
    val installmentDueRelativeDays: List<Int> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
    val allowTeamSplitDefault: Boolean? = null,
    val requiredTemplateIds: List<String> = emptyList(),
) {
    fun toEvent(id: String): Event {
        val effectiveDoTeamsOfficiate = if (officialSchedulingMode.requiresTeamOfficials()) true else doTeamsOfficiate
        val resolvedRegistrationPaymentMode = normalizeRegistrationPaymentMode(registrationPaymentMode)
        val manualPaymentsEnabled = isManualRegistrationPaymentMode(resolvedRegistrationPaymentMode)
        val normalizedEventOfficials = if (eventOfficials.isNotEmpty()) {
            eventOfficials
        } else {
            officialIds.mapNotNull { officialId ->
                val normalizedUserId = officialId.trim()
                if (normalizedUserId.isBlank()) {
                    null
                } else {
                    EventOfficial(
                        id = buildEventOfficialRecordId(id, normalizedUserId),
                        userId = normalizedUserId,
                        positionIds = officialPositions.map(EventOfficialPosition::id),
                        fieldIds = emptyList(),
                        isActive = true,
                    )
                }
            }
        }
        return Event(
            doubleElimination = doubleElimination,
            winnerSetCount = winnerSetCount,
            loserSetCount = loserSetCount,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory,
            loserBracketPointsToVictory = loserBracketPointsToVictory,
            prize = prize,
            id = id,
            name = name,
            description = description,
            divisions = divisions.normalizeDivisionIdentifiers(),
            divisionDetails = mergeDivisionDetailsForDivisions(
                divisions = divisions,
                existingDetails = divisionDetails,
                eventId = id,
            ),
            location = location,
            address = address,
            start = Instant.parse(start),
            end = Instant.parse(end),
            timeZone = timeZone,
            priceCents = priceCents,
            rating = rating,
            imageId = imageId,
            coordinates = coordinates,
            hostId = hostId,
            assistantHostIds = assistantHostIds,
            noFixedEndDateTime = noFixedEndDateTime,
            teamSignup = teamSignup,
            singleDivision = singleDivision,
            freeAgentIds = freeAgentIds,
            waitListIds = waitListIds,
            userIds = userIds,
            teamIds = teamIds,
            cancellationRefundHours = cancellationRefundHours,
            registrationCutoffHours = registrationCutoffHours,
            seedColor = seedColor,
            sportId = sportId,
            timeSlotIds = timeSlotIds,
            fieldIds = fieldIds,
            leagueScoringConfigId = leagueScoringConfigId,
            organizationId = organizationId,
            affiliateUrl = affiliateUrl?.trim()?.takeIf(String::isNotBlank),
            scheduleText = scheduleText?.trim()?.takeIf(String::isNotBlank),
            dateDisplayMode = dateDisplayMode?.trim()?.takeIf(String::isNotBlank),
            dateDisplayText = dateDisplayText?.trim()?.takeIf(String::isNotBlank),
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
            maxParticipants = maxParticipants,
            minAge = minAge,
            maxAge = maxAge,
            teamSizeLimit = teamSizeLimit,
            registrationByDivisionType = registrationByDivisionType,
            eventType = EventType.valueOf(eventType),
            fieldCount = fieldIds
                .count { fieldId -> fieldId.isNotBlank() }
                .takeIf { count -> count > 0 },
            gamesPerOpponent = gamesPerOpponent,
            includePlayoffs = includePlayoffsOrPools ?: includePlayoffs,
            splitLeaguePlayoffDivisions = splitLeaguePlayoffDivisions,
            playoffTeamCount = playoffTeamCount,
            usesSets = usesSets,
            matchDurationMinutes = matchDurationMinutes,
            setDurationMinutes = setDurationMinutes,
            setsPerMatch = setsPerMatch,
            doTeamsOfficiate = effectiveDoTeamsOfficiate,
            teamOfficialsMaySwap = if (effectiveDoTeamsOfficiate == true) teamOfficialsMaySwap else false,
            teamCheckInMode = if (teamSignup) teamCheckInMode else TeamCheckInMode.OFF,
            teamCheckInOpenMinutesBefore = teamCheckInOpenMinutesBefore.coerceAtLeast(0),
            allowMatchRosterEdits = teamSignup && allowMatchRosterEdits,
            allowTemporaryMatchPlayers = teamSignup && allowMatchRosterEdits && allowTemporaryMatchPlayers,
            matchRulesOverride = matchRulesOverride,
            autoCreatePointMatchIncidents = autoCreatePointMatchIncidents,
            resolvedMatchRules = resolvedMatchRules,
            restTimeMinutes = restTimeMinutes,
            state = state,
            pointsToVictory = pointsToVictory,
            officialSchedulingMode = officialSchedulingMode,
            officialPositions = officialPositions,
            eventOfficials = normalizedEventOfficials,
            lastUpdated = Clock.System.now(),
            officialIds = normalizedEventOfficials.map(EventOfficial::userId),
            allowPaymentPlans = allowPaymentPlans,
            installmentCount = installmentCount,
            installmentDueDates = installmentDueDates,
            installmentDueRelativeDays = installmentDueRelativeDays,
            installmentAmounts = installmentAmounts,
            allowTeamSplitDefault = allowTeamSplitDefault,
            requiredTemplateIds = requiredTemplateIds,
        )
    }
}
