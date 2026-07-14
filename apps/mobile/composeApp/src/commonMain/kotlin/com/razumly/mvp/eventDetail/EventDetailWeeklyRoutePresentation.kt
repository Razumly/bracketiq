package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.eventDetail.composables.ScheduleItem
import kotlin.time.Instant

internal data class EventDetailWeeklyRoutePresentation(
    val isWeeklyEvent: Boolean,
    val selectedWeeklyOccurrenceStarted: Boolean,
    val joinBlockedByStart: Boolean,
    val hasDirectionsTarget: Boolean,
    val isWeeklyParentEvent: Boolean,
    val weeklySessionOptions: List<WeeklySessionOption>,
    val weeklyScheduleOptions: List<WeeklySessionOption>,
    val weeklyScheduleOptionsById: Map<String, WeeklySessionOption>,
    val weeklyScheduleItems: List<ScheduleItem>,
    val teamSignup: Boolean,
    val teamSelectionSportLabel: String,
    val selectedWeeklyOccurrenceJoined: Boolean,
    val isAffiliateEvent: Boolean,
    val shouldShowViewSchedulePrimaryAction: Boolean,
    val showOverviewOpenDetailsAction: Boolean,
)

internal fun buildEventDetailWeeklyRoutePresentation(
    selectedEvent: EventWithFullRelations,
    selectedWeeklyOccurrence: SelectedWeeklyOccurrenceState?,
    sports: List<Sport>,
    now: Instant,
    eventHasStarted: Boolean,
    isUserInEvent: Boolean,
    isHost: Boolean,
    isAssistantHost: Boolean,
    isEventOfficial: Boolean,
): EventDetailWeeklyRoutePresentation {
    val event = selectedEvent.event
    val isWeeklyEvent = event.eventType == EventType.WEEKLY_EVENT
    val selectedWeeklyOccurrenceStarted = selectedWeeklyOccurrence?.sessionStart?.let { sessionStart ->
        now >= sessionStart
    } == true
    val joinBlockedByStart = if (isWeeklyEvent) selectedWeeklyOccurrenceStarted else eventHasStarted
    val hasWeeklyParentTimeSlots = event.timeSlotIds.any(String::isNotBlank)
    val hasDirectionsTarget = !event.address.isNullOrBlank() ||
        event.lat != 0.0 ||
        event.long != 0.0
    val isWeeklyParentEvent = isWeeklyEvent && hasWeeklyParentTimeSlots
    val weeklySessionOptions = if (!isWeeklyParentEvent) {
        emptyList()
    } else {
        buildWeeklySessionOptions(
            event = event,
            timeSlots = selectedEvent.timeSlots,
        )
    }
    val weeklyScheduleOptions = if (!isWeeklyParentEvent) {
        emptyList()
    } else {
        buildWeeklyScheduleOptions(
            event = event,
            timeSlots = selectedEvent.timeSlots,
        )
    }
    val weeklyScheduleOptionsById = weeklyScheduleOptions.associateBy { session -> session.id }
    val weeklyScheduleItems = weeklyScheduleOptions.map { session ->
        ScheduleItem.EventEntry(
            event = event.copy(
                id = session.id,
                name = session.label,
                location = session.divisionLabel,
                start = session.start,
                end = session.end,
            ),
        )
    }
    val teamSelectionSportLabel = selectedEvent.sport?.name
        ?: sports.firstOrNull { it.id == event.sportId }?.name
        ?: event.sportId
            ?.takeIf(String::isNotBlank)
            ?.replace('_', ' ')
            ?.replace('-', ' ')
            ?.toTitleCase()
        ?: "this event"
    val selectedWeeklyOccurrenceJoined = isWeeklyParentEvent &&
        selectedWeeklyOccurrence != null &&
        isUserInEvent
    val isAffiliateEvent = event.isAffiliateEvent()
    val shouldShowViewSchedulePrimaryAction = shouldUseViewSchedulePrimaryAction(
        isWeeklyParentEvent = isWeeklyParentEvent,
        isAffiliateEvent = isAffiliateEvent,
        isUserInEvent = isUserInEvent,
        isHost = isHost,
        isAssistantHost = isAssistantHost,
        isEventOfficial = isEventOfficial,
    )

    return EventDetailWeeklyRoutePresentation(
        isWeeklyEvent = isWeeklyEvent,
        selectedWeeklyOccurrenceStarted = selectedWeeklyOccurrenceStarted,
        joinBlockedByStart = joinBlockedByStart,
        hasDirectionsTarget = hasDirectionsTarget,
        isWeeklyParentEvent = isWeeklyParentEvent,
        weeklySessionOptions = weeklySessionOptions,
        weeklyScheduleOptions = weeklyScheduleOptions,
        weeklyScheduleOptionsById = weeklyScheduleOptionsById,
        weeklyScheduleItems = weeklyScheduleItems,
        teamSignup = event.teamSignup,
        teamSelectionSportLabel = teamSelectionSportLabel,
        selectedWeeklyOccurrenceJoined = selectedWeeklyOccurrenceJoined,
        isAffiliateEvent = isAffiliateEvent,
        shouldShowViewSchedulePrimaryAction = shouldShowViewSchedulePrimaryAction,
        showOverviewOpenDetailsAction = !isAffiliateEvent &&
            (isWeeklyParentEvent || !shouldShowViewSchedulePrimaryAction),
    )
}
