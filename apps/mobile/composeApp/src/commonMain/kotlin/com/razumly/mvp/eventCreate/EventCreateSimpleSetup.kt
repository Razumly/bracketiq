package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.EventDetailsSectionVisibility

enum class EventCreateSetupMode {
    SIMPLE,
    ADVANCED,
}

enum class EventCreateSetupPageId(val label: String) {
    FORMAT("Format"),
    BASICS("Basics"),
    PARTICIPATION_PLAN("Participation Plan"),
    DIVISIONS("Divisions"),
    SCHEDULE_PLAN("Schedule Plan"),
    SCHEDULE_LOCATION("Schedule & Location"),
    COMPETITION_PLAN("Competition Plan"),
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
    val customizeMatchRules: Boolean = false,
    val customizeScoring: Boolean = false,
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

private val pageControllers = mapOf(
    EventCreateSetupPageId.DIVISIONS to EventCreateSetupPageId.PARTICIPATION_PLAN,
    EventCreateSetupPageId.SCHEDULE_LOCATION to EventCreateSetupPageId.SCHEDULE_PLAN,
    EventCreateSetupPageId.COMPETITION_RULES to EventCreateSetupPageId.COMPETITION_PLAN,
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
    EventCreateSetupPageId.COMPETITION_PLAN,
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
    EventCreateSetupPageId.SCHEDULE_PLAN,
    EventCreateSetupPageId.COMPETITION_PLAN,
    EventCreateSetupPageId.REGISTRATION_PLAN,
    EventCreateSetupPageId.OPERATIONS_PLAN,
)

fun isSimpleSetupPageComplete(pageId: EventCreateSetupPageId, event: Event): Boolean = when (pageId) {
    EventCreateSetupPageId.FORMAT -> event.eventType in mobileCreateEventTypes()
    EventCreateSetupPageId.BASICS -> event.name.isNotBlank() && !event.sportId.isNullOrBlank()
    EventCreateSetupPageId.DIVISIONS -> event.divisions.isNotEmpty()
    EventCreateSetupPageId.SCHEDULE_LOCATION -> {
        event.location.isNotBlank() && event.lat != 0.0 && event.long != 0.0
    }
    else -> true
}

fun simpleSetupSectionVisibility(pageId: EventCreateSetupPageId): EventDetailsSectionVisibility = when (pageId) {
    EventCreateSetupPageId.BASICS -> EventDetailsSectionVisibility.None.copy(
        hero = true,
        basics = true,
    )
    EventCreateSetupPageId.DIVISIONS -> EventDetailsSectionVisibility.None.copy(divisions = true)
    EventCreateSetupPageId.SCHEDULE_LOCATION -> EventDetailsSectionVisibility.None.copy(
        hero = true,
        basics = true,
        schedule = true,
    )
    EventCreateSetupPageId.COMPETITION_RULES -> EventDetailsSectionVisibility.None.copy(
        matchRules = true,
        leagueScoring = true,
    )
    EventCreateSetupPageId.PRICING_REGISTRATION,
    EventCreateSetupPageId.DOCUMENTS_QUESTIONS -> {
        EventDetailsSectionVisibility.None.copy(registration = true)
    }
    EventCreateSetupPageId.STAFF_OPERATIONS -> EventDetailsSectionVisibility.None.copy(staff = true)
    else -> EventDetailsSectionVisibility.None
}
