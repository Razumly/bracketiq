package com.razumly.mvp.core.data.dataTypes.dtos

data class MatchDTO(
    val id: String,
    val matchId: Int,
    val team1: String?,
    val team2: String?,
    val tournament: String,
    val refId: String?,
    val field: String?,
    val start: String,
    val end: String?,
    val division: String,
    val team1Points: List<Int>,
    val team2Points: List<Int>,
    val losersBracket: Boolean,
    val winnerNextMatchId: String?,
    val loserNextMatchId: String?,
    val previousLeftId: String?,
    val previousRightId: String?,
    val setResults: List<Int>,
)