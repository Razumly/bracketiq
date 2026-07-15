package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.eventDetail.EventDetailsSectionVisibility
import com.razumly.mvp.eventDetail.eventAgeRangeErrors
import com.razumly.mvp.eventDetail.manualPaymentLinkError
import com.razumly.mvp.eventDetail.composables.leagueScoringValidationErrors
import com.razumly.mvp.eventDetail.shouldShowMatchRulesSection
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
    OPTIONS("Options"),
    BASIC_INFORMATION("Basic Information"),
    EVENT_DETAILS("Event Details"),
    MATCH_RULES("Match Rules"),
    STAFF("Staff"),
    DIVISIONS("Divisions"),
    LEAGUE_SCORING("League Scoring Config"),
    SCHEDULE("Schedule"),
}

enum class EventCreateSetupPageStatus {
    CURRENT,
    COMPLETE,
    AVAILABLE,
    LOCKED,
    NOT_USED,
}

data class EventCreateSetupPage(
    val id: EventCreateSetupPageId,
    val status: EventCreateSetupPageStatus,
    val used: Boolean,
    val prerequisitePageId: EventCreateSetupPageId? = null,
    val unavailableReason: String? = null,
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

fun mobileCreateEventTypes(): List<EventType> = listOf(
    EventType.EVENT,
    EventType.WEEKLY_EVENT,
    EventType.LEAGUE,
    EventType.TOURNAMENT,
)

fun resolveEventCreateSetupPages(
    event: Event,
    currentPageId: EventCreateSetupPageId,
    completedPageIds: Set<EventCreateSetupPageId>,
): List<EventCreateSetupPage> {
    var earliestIncompleteUsedPage: EventCreateSetupPageId? = null
    return EventCreateSetupPageId.entries.map { pageId ->
        val unavailableReason = simpleSetupPageUnavailableReason(pageId, event)
        val used = unavailableReason == null
        if (!used) {
            return@map EventCreateSetupPage(
                id = pageId,
                status = if (pageId == currentPageId) {
                    EventCreateSetupPageStatus.CURRENT
                } else {
                    EventCreateSetupPageStatus.NOT_USED
                },
                used = false,
                unavailableReason = unavailableReason,
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
        )
    }
}

private fun simpleSetupPageUnavailableReason(
    pageId: EventCreateSetupPageId,
    event: Event,
): String? = when (pageId) {
    EventCreateSetupPageId.MATCH_RULES -> if (shouldShowMatchRulesSection(event.eventType)) {
        null
    } else {
        "Match rules are not used for this event type."
    }
    EventCreateSetupPageId.LEAGUE_SCORING -> if (event.eventType == EventType.LEAGUE) {
        null
    } else {
        "League scoring configuration is only used by leagues."
    }
    else -> null
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

fun isSimpleSetupPageComplete(
    pageId: EventCreateSetupPageId,
    event: Event,
    leagueScoringConfig: LeagueScoringConfigDTO? = null,
    selectedSport: Sport? = null,
): Boolean = when (pageId) {
    EventCreateSetupPageId.OPTIONS -> true
    EventCreateSetupPageId.BASIC_INFORMATION -> {
        event.name.isNotBlank() &&
            event.imageId.isNotBlank() &&
            !event.sportId.isNullOrBlank() &&
            event.location.isNotBlank() &&
            event.lat != 0.0 &&
            event.long != 0.0 &&
            (event.noFixedEndDateTime || event.end > event.start)
    }
    EventCreateSetupPageId.EVENT_DETAILS -> {
        val ageRangeErrors = eventAgeRangeErrors(event)
        (!event.teamSignup || event.teamSizeLimit >= 1) &&
            ageRangeErrors.first == null &&
            ageRangeErrors.second == null &&
            event.registrationCutoffHours >= 0 &&
            (event.cancellationRefundHours ?: 0) >= 0 &&
            (
                !event.usesManualRegistrationPayments() ||
                    event.manualPaymentLinks.all { link -> manualPaymentLinkError(link) == null }
                )
    }
    EventCreateSetupPageId.STAFF -> event.officialPositions.all { position ->
        position.id.isNotBlank() &&
            position.name.isNotBlank() &&
            position.count >= 1 &&
            position.order >= 0
    }
    EventCreateSetupPageId.LEAGUE_SCORING -> {
        event.eventType != EventType.LEAGUE ||
            leagueScoringConfig?.let { config ->
                leagueScoringValidationErrors(config, selectedSport).isEmpty()
            } == true
    }
    EventCreateSetupPageId.DIVISIONS -> event.divisions.isNotEmpty()
    EventCreateSetupPageId.SCHEDULE -> {
        event.location.isNotBlank() &&
            event.lat != 0.0 &&
            event.long != 0.0 &&
            (event.noFixedEndDateTime || event.end > event.start)
    }
    else -> true
}

fun simpleSetupSectionVisibility(pageId: EventCreateSetupPageId): EventDetailsSectionVisibility = when (pageId) {
    EventCreateSetupPageId.OPTIONS -> EventDetailsSectionVisibility.None.copy(options = true)
    EventCreateSetupPageId.BASIC_INFORMATION -> EventDetailsSectionVisibility.None.copy(
        hero = true,
        basics = true,
    )
    EventCreateSetupPageId.EVENT_DETAILS -> EventDetailsSectionVisibility.None.copy(registration = true)
    EventCreateSetupPageId.MATCH_RULES -> EventDetailsSectionVisibility.None.copy(matchRules = true)
    EventCreateSetupPageId.STAFF -> EventDetailsSectionVisibility.None.copy(staff = true)
    EventCreateSetupPageId.DIVISIONS -> EventDetailsSectionVisibility.None.copy(divisions = true)
    EventCreateSetupPageId.LEAGUE_SCORING -> EventDetailsSectionVisibility.None.copy(leagueScoring = true)
    EventCreateSetupPageId.SCHEDULE -> EventDetailsSectionVisibility.None.copy(schedule = true)
}
