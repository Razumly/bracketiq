package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.util.isPlaceholderSlot

internal fun Event.visibleTeams(teams: List<TeamWithPlayers>): List<TeamWithPlayers> =
    if (!teamSignup) {
        teams
    } else {
        teams.filterNot { teamWithPlayers -> teamWithPlayers.team.isPlaceholderSlot(eventType) }
    }

internal fun EventWithFullRelations.resolveOverviewFilledParticipantCount(
    selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary? = null,
): Int {
    selectedWeeklyOccurrenceSummary?.let { summary -> return summary.participantCount }
    return if (event.teamSignup) {
        event.visibleTeams(teams).size
    } else {
        event.playerIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .size
    }
}

internal fun countTeamSignupParticipantsForCapacity(
    event: Event,
    teams: List<TeamWithPlayers>,
    selectedDivision: DivisionDetail? = null,
): Int {
    val visibleTeams = event.visibleTeams(teams)
    val targetDivision = selectedDivision
    if (event.singleDivision || targetDivision == null) {
        return visibleTeams.size
    }
    return visibleTeams.count { teamWithPlayers -> teamWithPlayers.team.matchesEventDivision(targetDivision) }
}
