package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier

internal fun EventWithFullRelations.resolveOverviewFilledParticipantCount(
    selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary? = null,
): Int {
    selectedWeeklyOccurrenceSummary?.let { summary -> return summary.participantCount }
    return if (event.teamSignup) {
        teams.size
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
    val divisionId = selectedDivision?.id?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
    val divisionKey = selectedDivision?.key?.normalizeDivisionIdentifier()?.takeIf(String::isNotBlank)
    val shouldFilterDivision = !event.singleDivision && (divisionId != null || divisionKey != null)
    return teams.count { teamWithPlayers ->
        val team = teamWithPlayers.team
        !shouldFilterDivision ||
            (divisionId != null && divisionsEquivalent(team.division, divisionId)) ||
            (divisionKey != null && divisionsEquivalent(team.division, divisionKey))
    }
}
