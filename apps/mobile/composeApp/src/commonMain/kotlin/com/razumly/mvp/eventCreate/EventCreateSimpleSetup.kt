package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.MatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.RegistrationQuestionDraft
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
    RESOURCES("Resources"),
    TIMESLOTS("Timeslots"),
    COMPETITION_RULES("Competition Rules"),
    WINNER_BRACKET_RULES("Winner Bracket"),
    LOSER_BRACKET_RULES("Loser Bracket"),
    REGISTRATION_PLAN("Registration Plan"),
    PRICING_REGISTRATION("Pricing & Registration"),
    QUESTIONS("Registration Questions"),
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
    EventCreateSetupPageId.QUESTIONS to EventCreateSetupPageId.REGISTRATION_PLAN,
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
    EventCreateSetupPageId.RESOURCES,
    EventCreateSetupPageId.TIMESLOTS -> {
        val used = event.eventType == EventType.LEAGUE || event.eventType == EventType.TOURNAMENT
        used to if (used) null else "Competition scheduling is used by leagues and tournaments."
    }

    EventCreateSetupPageId.COMPETITION_RULES -> {
        val used = event.eventType == EventType.LEAGUE ||
            (event.eventType == EventType.TOURNAMENT && event.includePlayoffs)
        used to if (used) null else "Pool or league match rules are not used for this format."
    }

    EventCreateSetupPageId.WINNER_BRACKET_RULES -> {
        val used = event.eventType == EventType.TOURNAMENT
        used to if (used) null else "Bracket rules are used by tournaments."
    }

    EventCreateSetupPageId.LOSER_BRACKET_RULES -> {
        val used = event.eventType == EventType.TOURNAMENT && event.doubleElimination && event.usesSets
        used to if (used) null else "Separate loser-bracket set rules are used by set-based double elimination."
    }

    EventCreateSetupPageId.QUESTIONS -> {
        val used = choices.useRegistrationQuestions
        used to if (used) null else "Enable registration questions on Registration Plan."
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
    registrationQuestions: List<RegistrationQuestionDraft> = emptyList(),
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
    EventCreateSetupPageId.COMPETITION_RULES -> when {
        event.eventType == EventType.TOURNAMENT && event.includePlayoffs ->
            simpleTournamentPoolValidationErrors(event, requireCapacity = false).isEmpty()
        event.eventType == EventType.LEAGUE && event.includePlayoffs ->
            (event.playoffTeamCount ?: 0) >= 2
        else -> true
    }
    EventCreateSetupPageId.WINNER_BRACKET_RULES ->
        simpleTournamentWinnerBracketValidationErrors(event).isEmpty()
    EventCreateSetupPageId.LOSER_BRACKET_RULES ->
        simpleTournamentLoserBracketValidationErrors(event).isEmpty()
    EventCreateSetupPageId.PRICING_REGISTRATION -> event.maxParticipants >= 2 &&
        (!choices.paidRegistration || (event.priceCents > 0 && priceQuoteConfirmed))
    EventCreateSetupPageId.QUESTIONS -> !choices.useRegistrationQuestions ||
        (
            registrationQuestions.isNotEmpty() &&
                registrationQuestions.all { question -> question.prompt.isNotBlank() }
            )
    EventCreateSetupPageId.REVIEW_PUBLISH -> simpleSetupValidationErrors(
        event = event,
        choices = choices,
        priceQuoteConfirmed = priceQuoteConfirmed,
        registrationQuestions = registrationQuestions,
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
        playoffTeamCount = if (eventType == EventType.TOURNAMENT && includePlayoffs) {
            existingDetail?.playoffTeamCount ?: playoffTeamCount
        } else {
            existingDetail?.playoffTeamCount
        },
        poolCount = if (eventType == EventType.TOURNAMENT && includePlayoffs) {
            existingDetail?.poolCount ?: divisionDetails.firstNotNullOfOrNull(DivisionDetail::poolCount)
        } else {
            existingDetail?.poolCount
        },
    )
    val normalizedDetail = detail.copy(
        poolTeamCount = detail.poolCount?.let { count ->
            detail.maxParticipants?.takeIf { capacity -> count > 0 && capacity % count == 0 }?.div(count)
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
                retained + normalizedDetail
            } else {
                retained.mapIndexed { index, candidate ->
                    if (index == replacementIndex) normalizedDetail else candidate
                }
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
            val detailCapacity = normalizedCapacity.takeIf { value -> value >= 2 }
            detail.copy(
                price = normalizedPrice,
                maxParticipants = detailCapacity,
                poolTeamCount = detail.poolCount?.let { count ->
                    detailCapacity?.takeIf { capacity -> count > 0 && capacity % count == 0 }?.div(count)
                },
            )
        },
    )
}

fun Event.withSimpleTournamentPoolPlayEnabled(enabled: Boolean): Event {
    if (eventType != EventType.TOURNAMENT) return copy(includePlayoffs = enabled)
    return copy(
        includePlayoffs = enabled,
        playoffTeamCount = playoffTeamCount.takeIf { enabled },
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                playoffTeamCount = detail.playoffTeamCount.takeIf { enabled },
                poolCount = detail.poolCount.takeIf { enabled },
                poolTeamCount = detail.poolTeamCount.takeIf { enabled },
            )
        },
    )
}

fun Event.withSimpleTournamentPoolConfiguration(
    poolCount: Int?,
    bracketTeamCount: Int? = playoffTeamCount,
): Event {
    val normalizedPoolCount = poolCount?.takeIf { count -> count >= 1 }
    val normalizedBracketTeamCount = bracketTeamCount?.takeIf { count -> count >= 1 }
    return copy(
        playoffTeamCount = normalizedBracketTeamCount,
        divisionDetails = divisionDetails.map { detail ->
            val capacity = detail.maxParticipants ?: maxParticipants.takeIf { value -> value >= 2 }
            detail.copy(
                playoffTeamCount = normalizedBracketTeamCount,
                poolCount = normalizedPoolCount,
                poolTeamCount = normalizedPoolCount?.let { count ->
                    capacity?.takeIf { value -> value % count == 0 }?.div(count)
                },
            )
        },
    )
}

fun Event.withSimpleTournamentDoubleElimination(enabled: Boolean): Event {
    if (eventType != EventType.TOURNAMENT) return this
    val nextLoserSetCount = if (enabled) loserSetCount.takeIf { it in setOf(1, 3, 5) } ?: 1 else 1
    val nextLoserTargets = if (enabled) {
        resizeSimpleSetPointTargets(loserBracketPointsToVictory, nextLoserSetCount)
    } else {
        listOf(21)
    }
    return copy(
        doubleElimination = enabled,
        loserSetCount = nextLoserSetCount,
        loserBracketPointsToVictory = nextLoserTargets,
        divisionDetails = divisionDetails.map { detail ->
            val bracketConfig = detail.playoffConfig ?: TournamentConfig(
                winnerSetCount = winnerSetCount.coerceAtLeast(1),
                loserSetCount = loserSetCount.coerceAtLeast(1),
                winnerBracketPointsToVictory = winnerBracketPointsToVictory.ifEmpty { listOf(21) },
                loserBracketPointsToVictory = loserBracketPointsToVictory.ifEmpty { listOf(21) },
                restTimeMinutes = restTimeMinutes ?: 0,
            )
            detail.copy(
                playoffConfig = bracketConfig.copy(
                    doubleElimination = enabled,
                    loserSetCount = nextLoserSetCount,
                    loserBracketPointsToVictory = nextLoserTargets,
                ),
            )
        },
    )
}

fun Event.withSimpleSetDurationMinutes(minutes: Int?): Event {
    val normalizedDuration = minutes?.takeIf { value -> value >= 1 }
    return copy(
        usesSets = true,
        matchDurationMinutes = null,
        setDurationMinutes = normalizedDuration,
        divisionDetails = divisionDetails.map { detail ->
            detail.copy(
                usesSets = true,
                matchDurationMinutes = null,
                setDurationMinutes = normalizedDuration,
            )
        },
    )
}

fun Event.withSimpleTournamentBracketDuration(minutes: Int?): Event {
    if (eventType != EventType.TOURNAMENT) return this
    val normalizedDuration = minutes?.takeIf { value -> value >= 1 }
    val setBased = usesSets
    return copy(
        matchDurationMinutes = if (!includePlayoffs && !setBased) normalizedDuration else matchDurationMinutes,
        setDurationMinutes = if (!includePlayoffs && setBased) normalizedDuration else setDurationMinutes,
        divisionDetails = divisionDetails.map { detail ->
            val bracketConfig = detail.playoffConfig ?: TournamentConfig(
                doubleElimination = doubleElimination,
                winnerSetCount = winnerSetCount.coerceAtLeast(1),
                loserSetCount = loserSetCount.coerceAtLeast(1),
                winnerBracketPointsToVictory = winnerBracketPointsToVictory.ifEmpty { listOf(21) },
                loserBracketPointsToVictory = loserBracketPointsToVictory.ifEmpty { listOf(21) },
                restTimeMinutes = restTimeMinutes ?: 0,
            )
            detail.copy(
                playoffConfig = bracketConfig.copy(
                    usesSets = setBased,
                    matchDurationMinutes = normalizedDuration.takeUnless { setBased },
                    setDurationMinutes = normalizedDuration.takeIf { setBased },
                ),
            )
        },
    )
}

fun Event.withSimpleTournamentBracketTargets(
    losersBracket: Boolean,
    targets: List<Int>,
): Event {
    if (eventType != EventType.TOURNAMENT) return this
    val normalizedTargets = targets.map { value -> value.coerceAtLeast(1) }.ifEmpty { listOf(21) }
    val setCount = normalizedTargets.size
    return copy(
        usesSets = true,
        matchDurationMinutes = null,
        winnerSetCount = if (losersBracket) winnerSetCount else setCount,
        loserSetCount = if (losersBracket) setCount else loserSetCount,
        winnerBracketPointsToVictory = if (losersBracket) winnerBracketPointsToVictory else normalizedTargets,
        loserBracketPointsToVictory = if (losersBracket) normalizedTargets else loserBracketPointsToVictory,
        divisionDetails = divisionDetails.map { detail ->
            val bracketConfig = detail.playoffConfig ?: TournamentConfig(
                doubleElimination = doubleElimination,
                winnerSetCount = winnerSetCount.coerceAtLeast(1),
                loserSetCount = loserSetCount.coerceAtLeast(1),
                winnerBracketPointsToVictory = winnerBracketPointsToVictory.ifEmpty { listOf(21) },
                loserBracketPointsToVictory = loserBracketPointsToVictory.ifEmpty { listOf(21) },
                restTimeMinutes = restTimeMinutes ?: 0,
            )
            detail.copy(
                playoffConfig = bracketConfig.copy(
                    usesSets = true,
                    matchDurationMinutes = null,
                    winnerSetCount = if (losersBracket) bracketConfig.winnerSetCount else setCount,
                    loserSetCount = if (losersBracket) setCount else bracketConfig.loserSetCount,
                    winnerBracketPointsToVictory = if (losersBracket) {
                        bracketConfig.winnerBracketPointsToVictory
                    } else {
                        normalizedTargets
                    },
                    loserBracketPointsToVictory = if (losersBracket) {
                        normalizedTargets
                    } else {
                        bracketConfig.loserBracketPointsToVictory
                    },
                ),
            )
        },
    )
}

private fun Event.simpleTournamentBracketConfig(): TournamentConfig {
    return divisionDetails.firstNotNullOfOrNull(DivisionDetail::playoffConfig) ?: TournamentConfig(
        doubleElimination = doubleElimination,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory.ifEmpty { listOf(21) },
        loserBracketPointsToVictory = loserBracketPointsToVictory.ifEmpty { listOf(21) },
        restTimeMinutes = restTimeMinutes ?: 0,
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
    )
}

fun simpleTournamentWinnerBracketValidationErrors(event: Event): List<String> {
    if (event.eventType != EventType.TOURNAMENT) return emptyList()
    val config = event.simpleTournamentBracketConfig()
    return buildList {
        if (event.usesSets) {
            val duration = config.setDurationMinutes ?: event.setDurationMinutes ?: 20
            if (duration < 1) add("Set duration must be at least one minute.")
            if (config.winnerSetCount !in setOf(1, 3, 5)) add("Choose 1, 3, or 5 winner-bracket sets.")
            if (
                config.winnerBracketPointsToVictory.size < config.winnerSetCount ||
                config.winnerBracketPointsToVictory.take(config.winnerSetCount).any { target -> target < 1 }
            ) {
                add("Enter a target score for every winner-bracket set.")
            }
        } else {
            val duration = config.matchDurationMinutes ?: event.matchDurationMinutes ?: 60
            if (duration < 1) add("Bracket match duration must be at least one minute.")
        }
    }
}

fun simpleTournamentLoserBracketValidationErrors(event: Event): List<String> {
    if (event.eventType != EventType.TOURNAMENT || !event.doubleElimination || !event.usesSets) {
        return emptyList()
    }
    val config = event.simpleTournamentBracketConfig()
    return buildList {
        if (config.loserSetCount !in setOf(1, 3, 5)) add("Choose 1, 3, or 5 loser-bracket sets.")
        if (
            config.loserBracketPointsToVictory.size < config.loserSetCount ||
            config.loserBracketPointsToVictory.take(config.loserSetCount).any { target -> target < 1 }
        ) {
            add("Enter a target score for every loser-bracket set.")
        }
    }
}

fun simpleTournamentPoolValidationErrors(
    event: Event,
    requireCapacity: Boolean = true,
): List<String> {
    if (event.eventType != EventType.TOURNAMENT || !event.includePlayoffs) return emptyList()
    val poolCount = event.divisionDetails.firstNotNullOfOrNull(DivisionDetail::poolCount)
    val bracketTeamCount = event.playoffTeamCount
    val capacities = event.divisionDetails.map { detail ->
        detail.maxParticipants ?: event.maxParticipants.takeIf { value -> value >= 2 }
    }
    return buildList {
        if (poolCount == null || poolCount < 1) {
            add("Choose at least one pool.")
            return@buildList
        }
        if (
            requireCapacity &&
            (capacities.isEmpty() || capacities.any { capacity -> capacity == null || capacity % poolCount != 0 })
        ) {
            add("Maximum teams must divide evenly by the pool count.")
        }
        if (bracketTeamCount == null || bracketTeamCount < 2) {
            add("Choose at least two bracket teams.")
        } else {
            if (bracketTeamCount % poolCount != 0) {
                add("Bracket teams must divide evenly by the pool count.")
            }
            val smallestCapacity = capacities.filterNotNull().minOrNull()
            if (requireCapacity && smallestCapacity != null && bracketTeamCount > smallestCapacity) {
                add("Bracket teams cannot exceed maximum teams.")
            }
        }
    }
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

fun resizeSimpleSetPointTargets(
    currentTargets: List<Int>,
    setCount: Int,
    sportDefaults: List<Int> = emptyList(),
): List<Int> {
    val normalizedSetCount = when {
        setCount <= 1 -> 1
        setCount <= 3 -> 3
        else -> 5
    }
    val normalizedCurrent = currentTargets.map { target -> target.coerceAtLeast(1) }
    val normalizedDefaults = sportDefaults.map { target -> target.coerceAtLeast(1) }
    val regulationTarget = normalizedCurrent.firstOrNull()
        ?: normalizedDefaults.firstOrNull()
        ?: 21
    if (normalizedSetCount == 1) {
        return listOf(regulationTarget)
    }
    val decidingTarget = normalizedCurrent.takeIf { targets -> targets.size > 1 }?.last()
        ?: normalizedDefaults.takeIf { targets -> targets.size > 1 }?.last()
        ?: regulationTarget
    val existingRegulationTargets = normalizedCurrent.dropLast(1)
    return List(normalizedSetCount) { index ->
        when {
            index == normalizedSetCount - 1 -> decidingTarget
            index < existingRegulationTargets.size -> existingRegulationTargets[index]
            else -> regulationTarget
        }
    }
}

fun resolveSimpleCompetitionSegmentCount(
    event: Event,
    scoringModel: String,
    sportSegmentCount: Int,
): Int {
    val normalizedSportCount = sportSegmentCount.coerceAtLeast(1)
    if (!scoringModel.equals("SETS", ignoreCase = true)) return normalizedSportCount

    val configuredCount = when (event.eventType) {
        EventType.LEAGUE -> event.setsPerMatch
        EventType.TOURNAMENT -> event.setsPerMatch
        EventType.EVENT, EventType.TRYOUT, EventType.WEEKLY_EVENT -> null
    }
    return configuredCount?.takeIf { count -> count in setOf(1, 3, 5) }
        ?: normalizedSportCount
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

    val updatesTournamentBracket = eventType != EventType.TOURNAMENT
    return copy(
        usesSets = true,
        matchDurationMinutes = null,
        setsPerMatch = setCount,
        pointsToVictory = normalizedTargets,
        winnerSetCount = if (updatesTournamentBracket) setCount else winnerSetCount,
        loserSetCount = if (updatesTournamentBracket) setCount else loserSetCount,
        winnerBracketPointsToVictory = if (updatesTournamentBracket) normalizedTargets else winnerBracketPointsToVictory,
        loserBracketPointsToVictory = if (updatesTournamentBracket) normalizedTargets else loserBracketPointsToVictory,
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
                playoffConfig = if (updatesTournamentBracket) playoff.withTargets() else detail.playoffConfig,
            )
        },
    )
}

fun simpleSetupValidationErrors(
    event: Event,
    choices: EventCreateSetupChoices,
    priceQuoteConfirmed: Boolean,
    registrationQuestions: List<RegistrationQuestionDraft> = emptyList(),
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
    if (event.eventType == EventType.TOURNAMENT && event.includePlayoffs) {
        addAll(simpleTournamentPoolValidationErrors(event))
    } else if (event.eventType == EventType.LEAGUE && event.includePlayoffs && (event.playoffTeamCount ?: 0) < 2) {
        add("Choose at least two playoff teams.")
    }
    if (event.eventType == EventType.TOURNAMENT) {
        addAll(simpleTournamentWinnerBracketValidationErrors(event))
        addAll(simpleTournamentLoserBracketValidationErrors(event))
    }
    if (event.maxParticipants < 2) add("Capacity must be at least 2.")
    if (choices.paidRegistration && event.priceCents <= 0) add("Enter a registration price.")
    if (choices.paidRegistration && !priceQuoteConfirmed) add("Wait for the online price quote.")
    if (choices.useRegistrationQuestions && registrationQuestions.isEmpty()) {
        add("Add at least one registration question.")
    } else if (choices.useRegistrationQuestions && registrationQuestions.any { question -> question.prompt.isBlank() }) {
        add("Registration questions cannot be blank.")
    }
}
