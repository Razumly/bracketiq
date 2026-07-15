package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.MatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeName
import com.razumly.mvp.core.data.util.buildGenderSkillAgeDivisionToken
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.core.util.resolvedTimeZone
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

enum class EventCreateSetupMode {
    SIMPLE,
    ADVANCED,
}

enum class EventCreateSetupPageId(val label: String) {
    FORMAT("Format"),
    BASICS("Basics"),
    PARTICIPATION_PLAN("Participation Plan"),
    DIVISIONS("Divisions"),
    SCHEDULE_LOCATION("Schedule & Location"),
    COMPETITION_RULES("Competition Rules"),
    REGISTRATION_PLAN("Registration Plan"),
    PRICING_REGISTRATION("Pricing & Registration"),
    DOCUMENTS_QUESTIONS("Documents & Questions"),
    OPERATIONS_PLAN("Operations Plan"),
    STAFF_OPERATIONS("Staff & Operations"),
    REVIEW_PUBLISH("Review & Publish"),
}

enum class EventCreateSetupPageStatus {
    CURRENT,
    COMPLETE,
    AVAILABLE,
    LOCKED,
    NOT_USED,
}

data class EventCreateSetupChoices(
    val paidRegistration: Boolean = false,
    val useRequiredDocuments: Boolean = false,
    val useRegistrationQuestions: Boolean = false,
    val useStaffAssignments: Boolean = false,
    val useDedicatedOfficials: Boolean = false,
)

data class EventCreateSetupPage(
    val id: EventCreateSetupPageId,
    val status: EventCreateSetupPageStatus,
    val used: Boolean,
    val prerequisitePageId: EventCreateSetupPageId? = null,
    val controlledByPageId: EventCreateSetupPageId? = null,
    val unavailableReason: String? = null,
)

data class SimpleSetupDivisionSelection(
    val gender: String,
    val skillDivisionTypeId: String,
    val skillDivisionTypeName: String,
    val ageDivisionTypeId: String,
    val ageDivisionTypeName: String,
)

@OptIn(ExperimentalTime::class)
fun createSimpleSetupEventRangeSlot(
    event: Event,
    fields: List<Field>,
    slotId: String = newId(),
    now: Instant = Clock.System.now(),
): TimeSlot {
    val start = event.start.takeUnless { value -> value == Instant.DISTANT_PAST } ?: now
    val end = event.end.takeIf { value -> value > start } ?: start + 1.hours
    val timeZone = event.resolvedTimeZone()
    val startLocal = start.toLocalDateTime(timeZone)
    val endLocal = end.toLocalDateTime(timeZone)
    val dayOfWeek = (startLocal.date.dayOfWeek.isoDayNumber - 1).mod(7)
    val fieldIds = fields.map(Field::id).map(String::trim).filter(String::isNotBlank).distinct()
    return TimeSlot(
        id = slotId,
        dayOfWeek = dayOfWeek,
        daysOfWeek = listOf(dayOfWeek),
        divisions = event.divisions.normalizeDivisionIdentifiers(),
        startTimeMinutes = startLocal.time.hour * 60 + startLocal.time.minute,
        endTimeMinutes = endLocal.time.hour * 60 + endLocal.time.minute,
        startDate = start,
        timeZone = event.timeZone,
        repeating = false,
        endDate = end,
        scheduledFieldId = fieldIds.firstOrNull(),
        scheduledFieldIds = fieldIds,
        price = null,
    )
}

private val pageControllers = mapOf(
    EventCreateSetupPageId.DIVISIONS to EventCreateSetupPageId.PARTICIPATION_PLAN,
    EventCreateSetupPageId.PRICING_REGISTRATION to EventCreateSetupPageId.REGISTRATION_PLAN,
    EventCreateSetupPageId.DOCUMENTS_QUESTIONS to EventCreateSetupPageId.REGISTRATION_PLAN,
    EventCreateSetupPageId.STAFF_OPERATIONS to EventCreateSetupPageId.OPERATIONS_PLAN,
)

fun mobileCreateEventTypes(): List<EventType> = listOf(
    EventType.EVENT,
    EventType.WEEKLY_EVENT,
    EventType.LEAGUE,
    EventType.TOURNAMENT,
)

fun resolveEventCreateSetupPages(
    event: Event,
    choices: EventCreateSetupChoices,
    currentPageId: EventCreateSetupPageId,
    completedPageIds: Set<EventCreateSetupPageId>,
): List<EventCreateSetupPage> {
    var earliestIncompleteUsedPage: EventCreateSetupPageId? = null
    return EventCreateSetupPageId.entries.map { pageId ->
        val usage = resolvePageUsage(pageId, event, choices)
        if (!usage.first) {
            return@map EventCreateSetupPage(
                id = pageId,
                status = if (pageId == currentPageId) {
                    EventCreateSetupPageStatus.CURRENT
                } else {
                    EventCreateSetupPageStatus.NOT_USED
                },
                used = false,
                controlledByPageId = pageControllers[pageId],
                unavailableReason = usage.second,
            )
        }

        val prerequisite = earliestIncompleteUsedPage
        val status = when {
            pageId == currentPageId -> EventCreateSetupPageStatus.CURRENT
            pageId in completedPageIds -> EventCreateSetupPageStatus.COMPLETE
            prerequisite != null -> EventCreateSetupPageStatus.LOCKED
            else -> EventCreateSetupPageStatus.AVAILABLE
        }
        if (pageId !in completedPageIds && earliestIncompleteUsedPage == null) {
            earliestIncompleteUsedPage = pageId
        }
        EventCreateSetupPage(
            id = pageId,
            status = status,
            used = true,
            prerequisitePageId = prerequisite,
            controlledByPageId = pageControllers[pageId],
        )
    }
}

private fun resolvePageUsage(
    pageId: EventCreateSetupPageId,
    event: Event,
    choices: EventCreateSetupChoices,
): Pair<Boolean, String?> = when (pageId) {
    EventCreateSetupPageId.COMPETITION_RULES -> {
        val used = event.eventType == EventType.LEAGUE || event.eventType == EventType.TOURNAMENT
        used to if (used) null else "Competition configuration is used by leagues and tournaments."
    }

    EventCreateSetupPageId.DOCUMENTS_QUESTIONS -> {
        val used = choices.useRequiredDocuments || choices.useRegistrationQuestions
        used to if (used) null else "Enable documents or questions on Registration Plan."
    }

    EventCreateSetupPageId.STAFF_OPERATIONS -> {
        val used = choices.useStaffAssignments || choices.useDedicatedOfficials || event.teamSignup
        used to if (used) null else "Enable staff or officials on Operations Plan."
    }

    else -> true to null
}

fun nextUsedSetupPage(
    pages: List<EventCreateSetupPage>,
    currentPageId: EventCreateSetupPageId,
): EventCreateSetupPageId? {
    val currentIndex = pages.indexOfFirst { it.id == currentPageId }
    if (currentIndex < 0) return null
    return pages.drop(currentIndex + 1).firstOrNull { it.used }?.id
}

fun previousUsedSetupPage(
    pages: List<EventCreateSetupPage>,
    currentPageId: EventCreateSetupPageId,
): EventCreateSetupPageId? {
    val currentIndex = pages.indexOfFirst { it.id == currentPageId }
    if (currentIndex <= 0) return null
    return pages.take(currentIndex).lastOrNull { it.used }?.id
}

fun isPlanningSetupPage(pageId: EventCreateSetupPageId): Boolean = pageId in setOf(
    EventCreateSetupPageId.FORMAT,
    EventCreateSetupPageId.PARTICIPATION_PLAN,
    EventCreateSetupPageId.REGISTRATION_PLAN,
    EventCreateSetupPageId.OPERATIONS_PLAN,
)

fun isSimpleSetupPageComplete(
    pageId: EventCreateSetupPageId,
    event: Event,
    choices: EventCreateSetupChoices = EventCreateSetupChoices(),
    priceQuoteConfirmed: Boolean = true,
): Boolean = when (pageId) {
    EventCreateSetupPageId.FORMAT -> event.eventType in mobileCreateEventTypes()
    EventCreateSetupPageId.BASICS -> event.name.isNotBlank() && !event.sportId.isNullOrBlank()
    EventCreateSetupPageId.DIVISIONS -> event.divisions.isNotEmpty()
    EventCreateSetupPageId.SCHEDULE_LOCATION -> {
        event.location.isNotBlank() &&
            event.lat != 0.0 &&
            event.long != 0.0 &&
            (event.noFixedEndDateTime || event.end > event.start)
    }
    EventCreateSetupPageId.COMPETITION_RULES -> !event.includePlayoffs ||
        (event.playoffTeamCount ?: 0) >= 2
    EventCreateSetupPageId.PRICING_REGISTRATION -> event.maxParticipants >= 2 &&
        (!choices.paidRegistration || (event.priceCents > 0 && priceQuoteConfirmed))
    EventCreateSetupPageId.DOCUMENTS_QUESTIONS -> !choices.useRequiredDocuments ||
        event.requiredTemplateIds.isNotEmpty()
    EventCreateSetupPageId.REVIEW_PUBLISH -> simpleSetupValidationErrors(
        event = event,
        choices = choices,
        priceQuoteConfirmed = priceQuoteConfirmed,
    ).isEmpty()
    else -> true
}

fun Event.upsertSimpleSetupDivision(
    selection: SimpleSetupDivisionSelection,
    replacingDivisionId: String? = null,
): Event {
    val normalizedGender = selection.gender.trim().uppercase()
    val normalizedSkillId = selection.skillDivisionTypeId.normalizeDivisionIdentifier()
    val normalizedAgeId = selection.ageDivisionTypeId.normalizeDivisionIdentifier()
    require(normalizedGender.isNotBlank()) { "Division gender is required." }
    require(normalizedSkillId.isNotBlank()) { "Division skill is required." }
    require(normalizedAgeId.isNotBlank()) { "Division age is required." }

    val token = buildGenderSkillAgeDivisionToken(
        gender = normalizedGender,
        skillDivisionTypeId = normalizedSkillId,
        ageDivisionTypeId = normalizedAgeId,
    )
    val selectedDetail = divisionDetails.firstOrNull { detail ->
        detail.key.normalizeDivisionIdentifier() == token.normalizeDivisionIdentifier()
    }
    val replacementDetail = replacingDivisionId
        ?.let { divisionId -> divisionDetails.firstOrNull { detail -> detail.id == divisionId } }
    val existingDetail = replacementDetail ?: selectedDetail
    val divisionId = existingDetail?.id ?: "${id}__division__$token"
    val skillName = selection.skillDivisionTypeName.trim().ifBlank { normalizedSkillId }
    val ageName = selection.ageDivisionTypeName.trim().ifBlank { normalizedAgeId }
    val genderName = when (normalizedGender) {
        "M" -> "Men's"
        "F" -> "Women's"
        else -> "Coed"
    }
    val name = listOf(genderName, skillName, ageName)
        .filter(String::isNotBlank)
        .joinToString(" ")
    val detail = (existingDetail ?: DivisionDetail(id = divisionId)).copy(
        id = divisionId,
        key = token,
        name = name,
        gender = normalizedGender,
        ratingType = "SKILL",
        divisionTypeId = buildCombinedDivisionTypeId(normalizedSkillId, normalizedAgeId),
        divisionTypeName = buildCombinedDivisionTypeName(skillName, ageName),
        skillDivisionTypeId = normalizedSkillId,
        skillDivisionTypeName = skillName,
        ageDivisionTypeId = normalizedAgeId,
        ageDivisionTypeName = ageName,
        price = if (singleDivision) priceCents.coerceAtLeast(0) else existingDetail?.price ?: 0,
        maxParticipants = if (singleDivision) {
            maxParticipants.takeIf { value -> value >= 2 }
        } else {
            existingDetail?.maxParticipants?.coerceAtLeast(2) ?: 2
        },
    )
    val nextDetails = divisionDetails
        .filterNot { candidate ->
            candidate.id == replacingDivisionId ||
                (
                    candidate.id != divisionId &&
                        candidate.key.normalizeDivisionIdentifier() == token.normalizeDivisionIdentifier()
                    )
        }
        .let { retained ->
            val replacementIndex = retained.indexOfFirst { candidate -> candidate.id == divisionId }
            if (replacementIndex < 0) {
                retained + detail
            } else {
                retained.mapIndexed { index, candidate -> if (index == replacementIndex) detail else candidate }
            }
        }
    val nextDivisionIds = nextDetails.map(DivisionDetail::id).normalizeDivisionIdentifiers()
    return copy(
        divisions = nextDivisionIds,
        divisionDetails = mergeDivisionDetailsForDivisions(
            divisions = nextDivisionIds,
            existingDetails = nextDetails,
            eventId = id,
        ),
    )
}

fun Event.withSimpleSetupRegistrationValues(
    priceCents: Int = this.priceCents,
    maxParticipants: Int = this.maxParticipants,
): Event {
    val normalizedPrice = priceCents.coerceAtLeast(0)
    val normalizedCapacity = maxParticipants.coerceAtLeast(0)
    return copy(
        priceCents = normalizedPrice,
        maxParticipants = normalizedCapacity,
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                price = normalizedPrice,
                maxParticipants = normalizedCapacity.takeIf { value -> value >= 2 },
            )
        },
    )
}

fun Event.withSimpleTimedMatchDuration(
    totalMinutes: Int?,
    segmentCount: Int,
): Event {
    val normalizedDuration = totalMinutes?.takeIf { value -> value > 0 }
    val normalizedSegmentCount = segmentCount.coerceAtLeast(1)
    val currentOverride = matchRulesOverride ?: MatchRulesConfigMVP()
    val currentTimekeeping = currentOverride.timekeeping ?: MatchTimekeepingConfigMVP()
    val segmentDuration = normalizedDuration?.let { duration ->
        ((duration + normalizedSegmentCount - 1) / normalizedSegmentCount).coerceAtLeast(1)
    }
    val nextTimekeeping = currentTimekeeping.copy(segmentDurationMinutes = segmentDuration)
    val nextOverride = currentOverride.copy(
        scoringModel = null,
        segmentCount = null,
        setPointTargets = emptyList(),
        timekeeping = nextTimekeeping.takeIf { timekeeping ->
            timekeeping.timerMode != null ||
                timekeeping.segmentDurationMinutes != null ||
                !timekeeping.segmentDurationMinutesBySequence.isNullOrEmpty() ||
                timekeeping.canUseAddedTime != null ||
                timekeeping.addedTimeEnabled != null ||
                timekeeping.stopAtRegulationEnd != null
        },
    )
    return copy(
        usesSets = false,
        matchDurationMinutes = normalizedDuration,
        setDurationMinutes = null,
        setsPerMatch = null,
        pointsToVictory = emptyList(),
        matchRulesOverride = nextOverride,
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                usesSets = false,
                matchDurationMinutes = normalizedDuration,
                setDurationMinutes = null,
                setsPerMatch = null,
                pointsToVictory = emptyList(),
            )
        },
    )
}

fun Event.withSimplePlayoffMatchDuration(totalMinutes: Int?): Event {
    val normalizedDuration = totalMinutes?.takeIf { value -> value > 0 }
    return copy(
        divisionDetails = divisionDetails.map { detail ->
            val playoff = detail.playoffConfig ?: TournamentConfig(
                doubleElimination = doubleElimination,
                winnerSetCount = winnerSetCount.coerceAtLeast(1),
                loserSetCount = loserSetCount.coerceAtLeast(1),
                winnerBracketPointsToVictory = winnerBracketPointsToVictory.ifEmpty { listOf(21) },
                loserBracketPointsToVictory = loserBracketPointsToVictory.ifEmpty { listOf(21) },
                restTimeMinutes = restTimeMinutes ?: 0,
            )
            detail.copy(
                playoffConfig = playoff.copy(
                    usesSets = false,
                    matchDurationMinutes = normalizedDuration,
                    setDurationMinutes = null,
                ),
            )
        },
    )
}

fun Event.withSimpleSetPointTargets(targets: List<Int>): Event {
    val normalizedTargets = targets.map { value -> value.coerceAtLeast(1) }.ifEmpty { listOf(21) }
    val setCount = normalizedTargets.size
    fun TournamentConfig.withTargets(): TournamentConfig = copy(
        usesSets = true,
        matchDurationMinutes = null,
        winnerSetCount = setCount,
        loserSetCount = setCount,
        winnerBracketPointsToVictory = normalizedTargets,
        loserBracketPointsToVictory = normalizedTargets,
    )

    return copy(
        usesSets = true,
        matchDurationMinutes = null,
        setsPerMatch = setCount,
        pointsToVictory = normalizedTargets,
        winnerSetCount = setCount,
        loserSetCount = setCount,
        winnerBracketPointsToVictory = normalizedTargets,
        loserBracketPointsToVictory = normalizedTargets,
        matchRulesOverride = matchRulesOverride?.copy(
            scoringModel = null,
            segmentCount = null,
            setPointTargets = emptyList(),
            timekeeping = null,
        ),
        divisionDetails = divisionDetails.map { detail ->
            val playoff = detail.playoffConfig ?: TournamentConfig(
                doubleElimination = doubleElimination,
                restTimeMinutes = restTimeMinutes ?: 0,
            )
            detail.copy(
                usesSets = true,
                matchDurationMinutes = null,
                setsPerMatch = setCount,
                pointsToVictory = normalizedTargets,
                playoffConfig = playoff.withTargets(),
            )
        },
    )
}

fun simpleSetupValidationErrors(
    event: Event,
    choices: EventCreateSetupChoices,
    priceQuoteConfirmed: Boolean,
): List<String> = buildList {
    if (event.name.isBlank()) add("Add an event name.")
    if (event.sportId.isNullOrBlank()) add("Select a sport.")
    if (event.divisions.isEmpty()) add("Add at least one division.")
    if (event.location.isBlank() || event.lat == 0.0 || event.long == 0.0) {
        add("Select a mapped location.")
    }
    if (!event.noFixedEndDateTime && event.end <= event.start) {
        add("Choose an end time after the start time.")
    }
    if (event.includePlayoffs && (event.playoffTeamCount ?: 0) < 2) {
        add("Choose at least two playoff teams.")
    }
    if (event.maxParticipants < 2) add("Capacity must be at least 2.")
    if (choices.paidRegistration && event.priceCents <= 0) add("Enter a registration price.")
    if (choices.paidRegistration && !priceQuoteConfirmed) add("Wait for the online price quote.")
    if (choices.useRequiredDocuments && event.requiredTemplateIds.isEmpty()) {
        add("Select at least one required document.")
    }
}
