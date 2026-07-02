package com.razumly.mvp.core.presentation.guides

object EventGuideTargets {
    const val OverviewHeader = "event.overview.header"
    const val OverviewPrimaryAction = "event.overview.primary_action"
    const val OverviewFormat = "event.overview.format"
    const val DetailTabs = "event.details.tabs"
    const val DetailDivisionSelector = "event.details.division_selector"
    const val ParticipantsContent = "event.participants.content"
    const val ScheduleContent = "event.schedule.content"
    const val BracketContent = "event.bracket.content"
    const val StandingsContent = "event.standings.content"
    const val MatchIdentity = "match.detail.identity"
    const val MatchOfficialAssignment = "match.detail.official_assignment"
    const val MatchScoreControls = "match.detail.score_controls"
    const val MatchResultControls = "match.detail.result_controls"
}

object EventGuideIds {
    fun eventOverviewJoined(eventId: String): String =
        "event_overview_joined_v1:event:${eventId.trim()}"

    fun eventOverviewMatchDay(eventId: String): String =
        "event_overview_match_day_v1:event:${eventId.trim()}"

    fun eventParticipantsTab(eventId: String): String =
        "event_participants_tab_v1:event:${eventId.trim()}"

    fun eventScheduleTab(eventId: String): String =
        "event_schedule_tab_v1:event:${eventId.trim()}"

    fun eventBracketTab(eventId: String): String =
        "event_bracket_tab_v1:event:${eventId.trim()}"

    fun eventStandingsTab(eventId: String): String =
        "event_standings_tab_v1:event:${eventId.trim()}"

    fun matchOfficialPreCheckIn(eventId: String?, matchId: String): String {
        val normalizedEventId = eventId?.trim().orEmpty()
        return if (normalizedEventId.isNotBlank()) {
            "match_official_pre_checkin_v1:event:$normalizedEventId"
        } else {
            "match_official_pre_checkin_v1:match:${matchId.trim()}"
        }
    }
}

fun eventOverviewGuide(guideId: String): AppGuide = AppGuide(
    id = guideId,
    steps = listOf(
        AppGuideStep(
            id = "event_home",
            targetId = EventGuideTargets.OverviewHeader,
            title = "Event home",
            body = "Use this screen for event updates, location, timing, registration state, and the main event actions.",
        ),
        AppGuideStep(
            id = "event_format",
            targetId = EventGuideTargets.OverviewFormat,
            title = "Event format",
            body = "Review the event setup, divisions, capacity, and registration type before moving into the active event tabs.",
        ),
        AppGuideStep(
            id = "event_primary_action",
            targetId = EventGuideTargets.OverviewPrimaryAction,
            title = "Open your event view",
            body = "After joining, use this action to open participants, schedules, brackets, and standings for the event.",
        ),
    ),
)

fun eventParticipantsTabGuide(guideId: String): AppGuide = AppGuide(
    id = guideId,
    steps = listOf(
        AppGuideStep(
            id = "event_tabs",
            targetId = EventGuideTargets.DetailTabs,
            title = "Event tabs",
            body = "Use these tabs to move between participants, schedules, standings, and brackets when they are available.",
        ),
        AppGuideStep(
            id = "participants_content",
            targetId = EventGuideTargets.ParticipantsContent,
            title = "Participants",
            body = "Check teams, players, free agents, rosters, and waitlist information for the selected event group.",
        ),
        AppGuideStep(
            id = "participant_divisions",
            targetId = EventGuideTargets.DetailDivisionSelector,
            title = "Change divisions",
            body = "When divisions or pools are available, use this selector to view the matching participant group.",
        ),
    ),
)

fun eventScheduleTabGuide(guideId: String): AppGuide = AppGuide(
    id = guideId,
    steps = listOf(
        AppGuideStep(
            id = "schedule_content",
            targetId = EventGuideTargets.ScheduleContent,
            title = "Schedule",
            body = "Match cards show times, fields, teams, status, and official assignments. Tap a match to open match details.",
        ),
        AppGuideStep(
            id = "schedule_divisions",
            targetId = EventGuideTargets.DetailDivisionSelector,
            title = "Filter the schedule",
            body = "Use division or pool filters when you only need a specific part of the event schedule.",
        ),
    ),
)

fun eventBracketTabGuide(guideId: String): AppGuide = AppGuide(
    id = guideId,
    steps = listOf(
        AppGuideStep(
            id = "bracket_content",
            targetId = EventGuideTargets.BracketContent,
            title = "Bracket",
            body = "Bracket matches show the event path forward. Completed results move teams through the bracket.",
        ),
        AppGuideStep(
            id = "bracket_divisions",
            targetId = EventGuideTargets.DetailDivisionSelector,
            title = "Switch bracket groups",
            body = "Use this selector when the event has multiple divisions, pools, or playoff groups.",
        ),
    ),
)

fun eventStandingsTabGuide(guideId: String): AppGuide = AppGuide(
    id = guideId,
    steps = listOf(
        AppGuideStep(
            id = "standings_content",
            targetId = EventGuideTargets.StandingsContent,
            title = "Standings",
            body = "Standings show rank, record, points, and tiebreaker progress as scores are reported.",
        ),
        AppGuideStep(
            id = "standings_divisions",
            targetId = EventGuideTargets.DetailDivisionSelector,
            title = "Switch standings groups",
            body = "Use division or pool filters to review the correct standings table for your group.",
        ),
    ),
)

fun matchOfficialPreCheckInGuide(guideId: String): AppGuide = AppGuide(
    id = guideId,
    steps = listOf(
        AppGuideStep(
            id = "match_identity",
            targetId = EventGuideTargets.MatchIdentity,
            title = "Confirm the match",
            body = "Check the match number, teams, field, and time before your team checks in to officiate.",
        ),
        AppGuideStep(
            id = "official_assignment",
            targetId = EventGuideTargets.MatchOfficialAssignment,
            title = "Official check-in",
            body = "Your team is assigned as the official team. Check in before using official scoring controls.",
        ),
        AppGuideStep(
            id = "score_controls",
            targetId = EventGuideTargets.MatchScoreControls,
            title = "Scoring controls",
            body = "After check-in, use the score and incident controls to update this match.",
        ),
        AppGuideStep(
            id = "result_controls",
            targetId = EventGuideTargets.MatchResultControls,
            title = "Submit results",
            body = "Saving the result updates the schedule, standings, and bracket when those views apply.",
        ),
    ),
)
