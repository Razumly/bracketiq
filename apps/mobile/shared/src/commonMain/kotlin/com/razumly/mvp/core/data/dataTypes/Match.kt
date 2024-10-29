package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.LocalDateTime

data class Match(
    val matchId: Int,
    val team1: Team?,
    val team2: Team?,
    val tournament: String,
    val refId: Team?,
    var field: Field?,
    val start: LocalDateTime,
    val end: LocalDateTime?,
    val team1Points: List<Int>,
    val team2Points: List<Int>,
    val losersBracket: Boolean,
    val winnerNextMatch: Match?,
    val loserNextMatch: Match?,
    val previousLeftMatch: Match?,
    val previousRightMatch: Match?,
    val setResults: List<Int>,
    override val id: String,
) : Document()