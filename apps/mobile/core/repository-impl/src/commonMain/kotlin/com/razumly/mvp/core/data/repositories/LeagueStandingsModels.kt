package com.razumly.mvp.core.data.repositories

import kotlin.time.Instant

data class LeagueStandingsRow(
    val position: Int,
    val teamId: String,
    val teamName: String,
    val wins: Int,
    val losses: Int,
    val draws: Int,
    val goalsFor: Int,
    val goalsAgainst: Int,
    val goalDifference: Int,
    val matchesPlayed: Int,
    val basePoints: Double,
    val finalPoints: Double,
    val pointsDelta: Double,
)

data class LeagueDivisionStandings(
    val divisionId: String,
    val divisionName: String,
    val standingsConfirmedAt: Instant?,
    val standingsConfirmedBy: String?,
    val rows: List<LeagueStandingsRow>,
    val validationMessages: List<String> = emptyList(),
)

data class LeagueStandingsConfirmResult(
    val division: LeagueDivisionStandings,
    val applyReassignment: Boolean,
    val reassignedPlayoffDivisionIds: List<String> = emptyList(),
    val seededTeamIds: List<String> = emptyList(),
)
