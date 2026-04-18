package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier

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
    val divisionId = selectedDivision?.id?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
    val divisionKey = selectedDivision?.key?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
    val shouldFilterDivision = !event.singleDivision && (divisionId != null || divisionKey != null)
    return visibleTeams.count { teamWithPlayers ->
        val team = teamWithPlayers.team
        !shouldFilterDivision ||
            (divisionId != null && divisionsEquivalent(team.division, divisionId)) ||
            (divisionKey != null && divisionsEquivalent(team.division, divisionKey))
    }
}
