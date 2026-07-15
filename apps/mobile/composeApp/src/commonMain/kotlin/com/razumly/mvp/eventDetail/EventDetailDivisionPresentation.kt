package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel

internal data class EventDetailDivisionPresentation(
    val joinDivisionOptions: List<BracketDivisionOption>,
    val leagueDivisionOptions: List<BracketDivisionOption>,
    val registrationDivisionOptions: List<EventDetailDivisionOption>,
    val registrationJoinDivisionOptions: List<BracketDivisionOption>,
    val splitRegistrationDivisionOptions: List<EventDetailDivisionOption>,
    val playoffDivisionOptions: List<BracketDivisionOption>,
    val selectedJoinDivisionId: String?,
    val tournamentBracketDivisionOptions: List<BracketDivisionOption>,
    val selectedScheduleDivisionId: String?,
    val schedulePoolDivisionOptions: List<BracketDivisionOption>,
    val selectedStandingsDivisionId: String?,
    val selectedStandingsDataDivisionId: String?,
    val standingsTabDivisionOptions: List<BracketDivisionOption>,
    val standingsPoolDivisionOptions: List<BracketDivisionOption>,
    val leagueStandings: List<TeamStanding>,
)

internal fun buildEventDetailDivisionPresentation(
    selectedEvent: EventWithFullRelations,
    selectedDivision: String?,
    selectedStandingsPoolDivisionId: String?,
    tournamentPoolPlayEnabled: Boolean,
    showStandingsDrawColumn: Boolean,
    leagueDivisionStandings: LeagueDivisionStandings?,
): EventDetailDivisionPresentation {
    val joinDivisionOptions = buildList {
        val seenIds = mutableSetOf<String>()

        fun addOption(rawId: String?, explicitLabel: String? = null) {
            val normalizedId = rawId
                ?.normalizeDivisionIdentifier()
                .orEmpty()
            if (normalizedId.isEmpty() || !seenIds.add(normalizedId)) return

            val label = explicitLabel
                ?.takeIf(String::isNotBlank)
                ?: normalizedId.toDivisionDisplayLabel(selectedEvent.event.divisionDetails)
            add(
                BracketDivisionOption(
                    id = normalizedId,
                    label = label.ifBlank { normalizedId },
                ),
            )
        }

        selectedEvent.event.divisionDetails.forEach { detail ->
            addOption(detail.id, detail.name)
        }
        selectedEvent.event.divisions.forEach { divisionId ->
            addOption(divisionId)
        }
        selectedEvent.matches.forEach { match ->
            addOption(match.match.division)
        }
        addOption(selectedDivision)
    }
    val leagueDivisionOptions = selectedEvent.event.leagueDivisionOptionsForStandings(
        fallbackOptions = joinDivisionOptions,
        matches = selectedEvent.matches,
    )
    val registrationDivisionOptions = buildRegistrationDivisionOptions(selectedEvent.event)
    val registrationJoinDivisionOptions = registrationDivisionOptions.toJoinDivisionOptions()
    val splitRegistrationDivisionOptions = if (
        selectedEvent.event.teamSignup &&
        !selectedEvent.event.singleDivision &&
        registrationDivisionOptions.size > 1
    ) {
        registrationDivisionOptions
    } else {
        emptyList()
    }
    val playoffDivisionOptions = selectedEvent.event.playoffDivisionOptionsForBracket(
        fallbackOptions = joinDivisionOptions,
        matches = selectedEvent.matches,
    )
    val selectedJoinDivisionId = joinDivisionOptions.resolveSelectedDivisionId(selectedDivision)
    val tournamentBracketDivisionOptions = if (tournamentPoolPlayEnabled) {
        selectedEvent.event.tournamentBracketDivisionOptions(joinDivisionOptions)
    } else {
        emptyList()
    }
    val preferredScheduleBracketDivisionId = if (!tournamentPoolPlayEnabled) {
        selectedJoinDivisionId
    } else {
        selectedEvent.event.resolveBracketDivisionForPool(selectedJoinDivisionId)
            ?: selectedJoinDivisionId
    }
    val selectedScheduleDivisionId = if (
        tournamentPoolPlayEnabled && tournamentBracketDivisionOptions.isNotEmpty()
    ) {
        tournamentBracketDivisionOptions.resolveSelectedDivisionId(preferredScheduleBracketDivisionId)
    } else {
        joinDivisionOptions.resolveSelectedDivisionId(preferredScheduleBracketDivisionId)
    }
    val schedulePoolDivisionOptions = if (tournamentPoolPlayEnabled) {
        selectedEvent.event.tournamentPoolDivisionOptions(selectedScheduleDivisionId)
    } else {
        emptyList()
    }
    val standingsTabDivisionOptions = when {
        tournamentPoolPlayEnabled && tournamentBracketDivisionOptions.isNotEmpty() -> {
            tournamentBracketDivisionOptions
        }

        selectedEvent.event.eventType == EventType.LEAGUE -> leagueDivisionOptions
        else -> joinDivisionOptions
    }
    val preferredStandingsBracketDivisionId = selectedEvent.event.preferredStandingsStageDivisionId(
        tournamentPoolPlayEnabled = tournamentPoolPlayEnabled,
        selectedDivisionId = selectedJoinDivisionId,
    )
    val selectedStandingsDivisionId = standingsTabDivisionOptions.resolveSelectedDivisionId(
        preferredStandingsBracketDivisionId,
    )
    val standingsPoolDivisionOptions = if (tournamentPoolPlayEnabled) {
        selectedEvent.event.tournamentPoolDivisionOptions(selectedStandingsDivisionId)
    } else {
        emptyList()
    }
    val selectedStandingsDataDivisionId = if (!tournamentPoolPlayEnabled) {
        selectedStandingsDivisionId
    } else {
        selectedStandingsPoolDivisionId
            ?.takeIf { selectedPoolId ->
                standingsPoolDivisionOptions.any { option -> option.id == selectedPoolId }
            }
            ?: standingsPoolDivisionOptions.firstOrNull()?.id
    }
    val shouldFilterStandings = tournamentPoolPlayEnabled ||
        (!selectedEvent.event.singleDivision && !selectedStandingsDataDivisionId.isNullOrBlank())
    val standingsMatches = if (!shouldFilterStandings || selectedStandingsDataDivisionId.isNullOrBlank()) {
        selectedEvent.matches
    } else {
        val normalizedStandingsDivisionId = selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
        selectedEvent.matches.filter { match ->
            match.match.division?.normalizeDivisionIdentifier() == normalizedStandingsDivisionId
        }
    }
    val matchTeamIds = standingsMatches
        .flatMap { match -> listOfNotNull(match.match.team1Id, match.match.team2Id) }
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSet()
    val divisionTeamIds = if (shouldFilterStandings) {
        selectedEvent.event.teamIdsForDivision(selectedStandingsDataDivisionId)
    } else {
        emptySet()
    }
    val standingsTeamIds = divisionTeamIds.ifEmpty { matchTeamIds }
    val standingsTeams = if (!shouldFilterStandings || selectedStandingsDataDivisionId.isNullOrBlank()) {
        selectedEvent.teams
    } else {
        val normalizedStandingsDivisionId = selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
        selectedEvent.teams.filter { team ->
            standingsTeamIds.contains(team.team.id) ||
                team.team.division.normalizeDivisionIdentifier() == normalizedStandingsDivisionId
        }
    }
    val computedLeagueStandings = buildLeagueStandings(
        teams = standingsTeams,
        matches = standingsMatches,
        config = selectedEvent.leagueScoringConfig,
        supportsDraw = showStandingsDrawColumn,
    )
    val remoteRows = if (
        !selectedStandingsDataDivisionId.isNullOrBlank() &&
        leagueDivisionStandings?.divisionId?.let { loadedDivisionId ->
            loadedDivisionId.normalizeDivisionIdentifier() ==
                selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
        } == true
    ) {
        leagueDivisionStandings.rows
    } else {
        emptyList()
    }
    val filteredRemoteRows = if (remoteRows.isEmpty() || selectedStandingsDataDivisionId.isNullOrBlank()) {
        remoteRows
    } else {
        val explicitTeamIds = selectedEvent.event.teamIdsForDivision(selectedStandingsDataDivisionId)
        val normalizedStandingsDivisionId = selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
        val selectedDivisionTeamIds = selectedEvent.teams
            .filter { team ->
                explicitTeamIds.contains(team.team.id) ||
                    team.team.division.normalizeDivisionIdentifier() == normalizedStandingsDivisionId
            }
            .map { team -> team.team.id }
            .filter(String::isNotBlank)
            .toSet()
        if (selectedDivisionTeamIds.isEmpty()) {
            remoteRows
        } else {
            remoteRows.filter { row -> row.teamId in selectedDivisionTeamIds }
        }
    }
    val leagueStandings = if (filteredRemoteRows.isEmpty()) {
        computedLeagueStandings
    } else {
        val teamsById = selectedEvent.teams.associateBy { it.team.id }
        filteredRemoteRows.map { row ->
            TeamStanding(
                team = teamsById[row.teamId],
                teamId = row.teamId,
                teamName = row.teamName,
                wins = row.wins,
                losses = row.losses,
                draws = row.draws,
                goalsFor = row.goalsFor,
                goalsAgainst = row.goalsAgainst,
                matchesPlayed = row.matchesPlayed,
                basePoints = row.basePoints,
                finalPoints = row.finalPoints,
                pointsDelta = row.pointsDelta,
            )
        }
    }

    return EventDetailDivisionPresentation(
        joinDivisionOptions = joinDivisionOptions,
        leagueDivisionOptions = leagueDivisionOptions,
        registrationDivisionOptions = registrationDivisionOptions,
        registrationJoinDivisionOptions = registrationJoinDivisionOptions,
        splitRegistrationDivisionOptions = splitRegistrationDivisionOptions,
        playoffDivisionOptions = playoffDivisionOptions,
        selectedJoinDivisionId = selectedJoinDivisionId,
        tournamentBracketDivisionOptions = tournamentBracketDivisionOptions,
        selectedScheduleDivisionId = selectedScheduleDivisionId,
        schedulePoolDivisionOptions = schedulePoolDivisionOptions,
        selectedStandingsDivisionId = selectedStandingsDivisionId,
        selectedStandingsDataDivisionId = selectedStandingsDataDivisionId,
        standingsTabDivisionOptions = standingsTabDivisionOptions,
        standingsPoolDivisionOptions = standingsPoolDivisionOptions,
        leagueStandings = leagueStandings,
    )
}
