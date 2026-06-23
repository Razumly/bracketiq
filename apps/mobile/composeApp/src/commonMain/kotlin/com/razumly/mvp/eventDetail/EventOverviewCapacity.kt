package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import com.razumly.mvp.core.data.util.isPlaceholderSlot
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier

internal fun Event.visibleTeams(teams: List<TeamWithPlayers>): List<TeamWithPlayers> =
    if (!teamSignup) {
        teams
    } else {
        teams.filterNot { teamWithPlayers -> teamWithPlayers.team.isPlaceholderSlot(eventType) }
    }

internal fun Event.registeredTeamIdsForCapacity(): List<String> =
    teamIds
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

internal fun EventWithFullRelations.resolveOverviewFilledParticipantCount(
    selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary? = null,
): Int {
    selectedWeeklyOccurrenceSummary?.let { summary -> return summary.participantCount }
    return if (event.teamSignup) {
        event.registeredTeamIdsForCapacity().size
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
    val registeredTeamIds = event.registeredTeamIdsForCapacity()
    val targetDivision = selectedDivision
    if (event.singleDivision || targetDivision == null) {
        return registeredTeamIds.size
    }
    val registeredTeamIdSet = registeredTeamIds.toSet()
    val targetDivisionId = targetDivision.id.normalizeDivisionIdentifier()
    val assignedTeamIds = event.divisionDetails
        .firstOrNull { detail -> detail.id.normalizeDivisionIdentifier() == targetDivisionId }
        ?.teamIds
        .orEmpty()
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()

    return assignedTeamIds.count(registeredTeamIdSet::contains)
}

internal fun eventIsFullForRegistration(
    event: Event,
    teams: List<TeamWithPlayers>,
    preferredDivisionId: String?,
    selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary? = null,
    overviewParticipantSummary: EventParticipantsSummary? = null,
): Boolean {
    if (isWeeklyParentEvent(event)) {
        val capacity = selectedWeeklyOccurrenceSummary?.participantCapacity ?: return false
        return selectedWeeklyOccurrenceSummary.participantCount >= capacity && capacity > 0
    }
    if ((event.singleDivision || preferredDivisionId == null) && overviewParticipantSummary != null) {
        val capacity = overviewParticipantSummary.participantCapacity
        if (capacity != null && capacity > 0) {
            return overviewParticipantSummary.participantCount >= capacity
        }
    }

    val selectedDivision = resolveSelectedDivisionDetail(event, preferredDivisionId)
    val maxParticipants = if (event.divisions.isEmpty()) {
        event.maxParticipants.takeIf { value -> value > 0 }
    } else {
        selectedDivision?.maxParticipants
    }

    if (maxParticipants == null || maxParticipants <= 0) {
        return false
    }

    val participantCount = if (event.teamSignup) {
        countTeamSignupParticipantsForCapacity(
            event = event,
            teams = teams,
            selectedDivision = selectedDivision,
        )
    } else {
        event.playerIds.size
    }

    return participantCount >= maxParticipants
}
