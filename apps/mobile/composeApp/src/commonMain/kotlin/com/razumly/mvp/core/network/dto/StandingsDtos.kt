package com.razumly.mvp.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class StandingsRowDto(
    val position: Int = 0,
    val teamId: String = "",
    val teamName: String = "",
    val draws: Int = 0,
    val goalsFor: Int = 0,
    val goalsAgainst: Int = 0,
    val goalDifference: Int = 0,
    val matchesPlayed: Int = 0,
    val basePoints: Double = 0.0,
    val finalPoints: Double = 0.0,
    val pointsDelta: Double = 0.0,
)

@Serializable
data class StandingsValidationDto(
    val mappingErrors: List<String> = emptyList(),
    val capacityErrors: List<String> = emptyList(),
)

@Serializable
data class StandingsPlayoffDivisionDto(
    val id: String = "",
    val name: String = "",
    val maxParticipants: Int? = null,
)

@Serializable
data class StandingsDivisionDto(
    val divisionId: String = "",
    val divisionName: String = "",
    val standingsConfirmedAt: String? = null,
    val standingsConfirmedBy: String? = null,
    val playoffTeamCount: Int? = null,
    val playoffPlacementDivisionIds: List<String> = emptyList(),
    val standingsOverrides: Map<String, Double>? = null,
    val standings: List<StandingsRowDto> = emptyList(),
    val validation: StandingsValidationDto = StandingsValidationDto(),
    val playoffDivisions: List<StandingsPlayoffDivisionDto> = emptyList(),
)

@Serializable
data class StandingsResponseDto(
    val division: StandingsDivisionDto? = null,
)

@Serializable
data class StandingsPointOverrideDto(
    val teamId: String,
    val points: Double? = null,
)

@Serializable
data class StandingsPatchRequestDto(
    val divisionId: String,
    val pointsOverrides: List<StandingsPointOverrideDto> = emptyList(),
)

@Serializable
data class StandingsConfirmRequestDto(
    val divisionId: String,
    val applyReassignment: Boolean? = null,
)

@Serializable
data class StandingsConfirmResponseDto(
    val division: StandingsDivisionDto? = null,
    val applyReassignment: Boolean? = null,
    val reassignedPlayoffDivisionIds: List<String> = emptyList(),
    val seededTeamIds: List<String> = emptyList(),
)
