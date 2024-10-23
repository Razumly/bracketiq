package com.razumly.mvp.core.data

data class Tournament(
    val name: String,
    val start: String,
    val end: String?,
    val description: String,
    val doubleElimination: Boolean,
    val matches: List<String>,
    val teams: List<String>,
    val divisions: List<String>,
    val fields: List<String>,
    val players: List<String>,
    val winnerSetCount: Int,
    val loserSetCount: Int,
    val winnerBracketPointsToVictory: List<Int>,
    val loserBracketPointsToVictory: List<Int>,
    val winnerScoreLimitsPerSet: List<Int>,
    val loserScoreLimitsPerSet: List<Int>,
)