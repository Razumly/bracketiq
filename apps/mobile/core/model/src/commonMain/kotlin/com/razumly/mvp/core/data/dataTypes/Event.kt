@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.DivisionConverters
import com.razumly.mvp.core.data.util.DivisionDetailConverters
import com.razumly.mvp.core.data.util.findDivisionDetailByIdentifier
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.util.newId
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.native.ObjCName
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Entity
@Serializable
@OptIn(ExperimentalTime::class)
data class Event(
    val doubleElimination: Boolean = false,
    val winnerSetCount: Int = 1,
    val loserSetCount: Int = 0,
    val winnerBracketPointsToVictory: List<Int> = emptyList(),
    val loserBracketPointsToVictory: List<Int> = emptyList(),
    val prize: String = "",
    @PrimaryKey override val id: String = newId(),
    val name: String = "",
    @property:ObjCName(swiftName = "eventDescription")
    val description: String = "",
    @field:TypeConverters(DivisionConverters::class)
    val divisions: List<String> = emptyList(),
    @field:TypeConverters(DivisionDetailConverters::class)
    val divisionDetails: List<DivisionDetail> = emptyList(),
    val location: String = "",
    val address: String? = null,
    @Contextual val start: Instant = Instant.DISTANT_PAST,
    @Contextual val end: Instant = Instant.DISTANT_PAST,
    val timeZone: String = "UTC",
    val priceCents: Int = 0,
    val rating: Double? = null,
    val imageId: String = "",
    val coordinates: List<Double> = listOf(0.0, 0.0),
    val hostId: String = "",
    val assistantHostIds: List<String> = emptyList(),
    val noFixedEndDateTime: Boolean = false,
    val teamSignup: Boolean = true,
    val singleDivision: Boolean = true,
    val freeAgentIds: List<String> = emptyList(),
    val waitListIds: List<String> = emptyList(),
    val userIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    val cancellationRefundHours: Int? = null,
    val registrationCutoffHours: Int = 0,
    val seedColor: Int = DEFAULT_EVENT_SEED_COLOR_ARGB,
    val sportId: String? = null,
    val timeSlotIds: List<String> = emptyList(),
    val fieldIds: List<String> = emptyList(),
    val leagueScoringConfigId: String? = null,
    val organizationId: String? = null,
    val affiliateUrl: String? = null,
    val registrationPaymentMode: String = REGISTRATION_PAYMENT_MODE_ONLINE,
    val manualPaymentLinks: List<ManualPaymentLink> = emptyList(),
    val manualPaymentInstructions: String? = null,
    val autoCancellation: Boolean = false,
    val maxParticipants: Int = 0,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val teamSizeLimit: Int = 2,
    val registrationByDivisionType: Boolean = false,
    val eventType: EventType = EventType.EVENT,
    val fieldCount: Int? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean = false,
    val splitLeaguePlayoffDivisions: Boolean = false,
    val playoffTeamCount: Int? = null,
    val usesSets: Boolean = false,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean? = null,
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
    @Transient val lastUpdated: Instant = Clock.System.now(),
) : MVPDocument {
    @Ignore
    var price: Double = 0.0
        get() = priceCents.toDouble() / 100.0
        set(value) { field = value }

    @Ignore
    var latitude: Double = 0.0
        get() = coordinates.getOrNull(1) ?: 0.0
        set(value) { field = value }
    @Ignore
    var longitude: Double = 0.0
        get() = coordinates.getOrNull(0) ?: 0.0
        set(value) { field = value }
    @Ignore
    var lat: Double = 0.0
        get() = latitude
        set(value) { field = value }
    @Ignore
    var long: Double = 0.0
        get() = longitude
        set(value) { field = value }
    @Ignore
    var freeAgents: List<String> = emptyList()
        get() = freeAgentIds
        set(value) { field = value }
    @Ignore
    var waitList: List<String> = emptyList()
        get() = waitListIds
        set(value) { field = value }
    @Ignore
    var playerIds: List<String> = emptyList()
        get() = userIds
        set(value) { field = value }
}

const val DEFAULT_EVENT_SEED_COLOR_ARGB: Int = -9781761

data class EventPriceRange(
    val minPriceCents: Int,
    val maxPriceCents: Int,
    val hasMissingPrices: Boolean = false,
)

private fun Event.mergedDivisionDetailsForPricing(): List<DivisionDetail> =
    mergeDivisionDetailsForDivisions(
        divisions = divisions,
        existingDetails = divisionDetails,
        eventId = id,
    )

private fun Event.findDivisionDetailForPricing(preferredDivisionId: String?): DivisionDetail? {
    val normalizedPreferredDivision = preferredDivisionId
        ?.normalizeDivisionIdentifier()
        ?.ifEmpty { null }

    if (!normalizedPreferredDivision.isNullOrBlank()) {
        divisionDetails.findDivisionDetailByIdentifier(normalizedPreferredDivision)
            ?.let { detail -> return detail }
    }

    val mergedDetails = mergedDivisionDetailsForPricing()
    if (mergedDetails.isEmpty()) {
        return null
    }

    return if (!normalizedPreferredDivision.isNullOrBlank()) {
        mergedDetails.findDivisionDetailByIdentifier(normalizedPreferredDivision)
            ?: mergedDetails.firstOrNull()
    } else {
        mergedDetails.firstOrNull()
    }
}

private fun formatPriceCentsLabel(priceCents: Int): String {
    val normalizedPriceCents = priceCents.coerceAtLeast(0)
    if (normalizedPriceCents == 0) {
        return "Free"
    }
    val wholeDollars = normalizedPriceCents / 100
    val cents = normalizedPriceCents % 100
    return "$$wholeDollars.${cents.toString().padStart(2, '0')}"
}

fun Event.resolvedDivisionPriceCents(preferredDivisionId: String? = null): Int? {
    val detail = findDivisionDetailForPricing(preferredDivisionId)
    return if (detail == null) {
        priceCents.coerceAtLeast(0)
    } else {
        detail.price?.coerceAtLeast(0)
    }
}

fun Event.divisionPriceRange(): EventPriceRange {
    val mergedDetails = mergedDivisionDetailsForPricing()
    if (mergedDetails.isEmpty()) {
        val eventPriceCents = priceCents.coerceAtLeast(0)
        return EventPriceRange(
            minPriceCents = eventPriceCents,
            maxPriceCents = eventPriceCents,
        )
    }

    val divisionPrices = mergedDetails.mapNotNull { detail ->
        detail.price?.coerceAtLeast(0)
    }
    val hasMissingPrices = mergedDetails.any { detail -> detail.price == null }
    if (divisionPrices.isEmpty()) {
        return EventPriceRange(
            minPriceCents = 0,
            maxPriceCents = 0,
            hasMissingPrices = true,
        )
    }

    return EventPriceRange(
        minPriceCents = divisionPrices.minOrNull() ?: 0,
        maxPriceCents = divisionPrices.maxOrNull() ?: 0,
        hasMissingPrices = hasMissingPrices,
    )
}

fun Event.hasAnyPaidDivision(): Boolean = divisionPriceRange().maxPriceCents > 0

fun Event.divisionPriceRangeLabel(): String {
    val priceRange = divisionPriceRange()
    return if (priceRange.minPriceCents == priceRange.maxPriceCents) {
        formatPriceCentsLabel(priceRange.minPriceCents)
    } else {
        "${formatPriceCentsLabel(priceRange.minPriceCents)} - ${formatPriceCentsLabel(priceRange.maxPriceCents)}"
    }
}

fun Event.isDraftLikeState(): Boolean {
    return when (state.trim().uppercase()) {
        "UNPUBLISHED", "DRAFT" -> true
        else -> false
    }
}

fun Event.isPrivateState(): Boolean {
    return state.trim().uppercase() == "PRIVATE"
}

fun Event.normalizedAffiliateUrl(): String? =
    affiliateUrl?.trim()?.takeIf(String::isNotBlank)

fun Event.isAffiliateEvent(): Boolean = normalizedAffiliateUrl() != null

fun Event.normalizedRegistrationPaymentMode(): String =
    normalizeRegistrationPaymentMode(registrationPaymentMode)

fun Event.usesManualRegistrationPayments(): Boolean =
    isManualRegistrationPaymentMode(registrationPaymentMode)

fun Event.lifecycleStateLabel(): String {
    return when (state.trim().uppercase()) {
        "UNPUBLISHED", "DRAFT" -> "Draft"
        "PRIVATE" -> "Private"
        "TEMPLATE" -> "Template"
        else -> "Published"
    }
}

fun Event.toEventDTO(): EventDTO {
    val effectiveDoTeamsOfficiate = if (officialSchedulingMode.requiresTeamOfficials()) true else doTeamsOfficiate
    return EventDTO(
        id = id,
        name = name,
        description = description,
        doubleElimination = doubleElimination,
        divisions = divisions.normalizeDivisionIdentifiers(),
        divisionDetails = mergeDivisionDetailsForDivisions(
            divisions = divisions,
            existingDetails = divisionDetails,
            eventId = id,
        ),
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory,
        loserBracketPointsToVictory = loserBracketPointsToVictory,
        prize = prize,
        location = location,
        address = address,
        start = start.toString(),
        end = end.toString(),
        timeZone = timeZone,
        priceCents = priceCents,
        rating = rating,
        imageId = imageId,
        hostId = hostId,
        assistantHostIds = assistantHostIds,
        noFixedEndDateTime = noFixedEndDateTime,
        coordinates = coordinates,
        maxParticipants = maxParticipants,
        teamSizeLimit = teamSizeLimit,
        teamSignup = teamSignup,
        singleDivision = singleDivision,
        waitListIds = waitListIds,
        freeAgentIds = freeAgentIds,
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
        affiliateUrl = affiliateUrl,
        registrationPaymentMode = normalizedRegistrationPaymentMode(),
        manualPaymentLinks = if (usesManualRegistrationPayments()) {
            normalizeManualPaymentLinks(manualPaymentLinks)
        } else {
            emptyList()
        },
        manualPaymentInstructions = if (usesManualRegistrationPayments()) {
            normalizeManualPaymentInstructions(manualPaymentInstructions)
        } else {
            null
        },
        autoCancellation = autoCancellation,
        eventType = eventType.name,
        minAge = minAge,
        maxAge = maxAge,
        registrationByDivisionType = registrationByDivisionType,
        fieldCount = fieldIds
            .count { fieldId -> fieldId.isNotBlank() }
            .takeIf { count -> count > 0 },
        gamesPerOpponent = gamesPerOpponent,
        includePlayoffs = includePlayoffs,
        splitLeaguePlayoffDivisions = splitLeaguePlayoffDivisions,
        includePlayoffsOrPools = includePlayoffs,
        playoffTeamCount = playoffTeamCount,
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
        setsPerMatch = setsPerMatch,
        doTeamsOfficiate = effectiveDoTeamsOfficiate,
        teamOfficialsMaySwap = if (effectiveDoTeamsOfficiate == true) teamOfficialsMaySwap else false,
        matchRulesOverride = matchRulesOverride,
        autoCreatePointMatchIncidents = autoCreatePointMatchIncidents,
        resolvedMatchRules = resolvedMatchRules,
        restTimeMinutes = restTimeMinutes,
        state = state,
        pointsToVictory = pointsToVictory,
        officialSchedulingMode = officialSchedulingMode,
        officialPositions = officialPositions,
        eventOfficials = eventOfficials,
        officialIds = officialIds,
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentDueDates = installmentDueDates,
        installmentDueRelativeDays = installmentDueRelativeDays,
        installmentAmounts = installmentAmounts,
        allowTeamSplitDefault = allowTeamSplitDefault,
        requiredTemplateIds = requiredTemplateIds,
    )
}
