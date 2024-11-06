package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.LocalDateTime
import kotlinx.serialization.Serializable

@Serializable
data class Match(
    val matchId: Int,
    val team1: Team?,
    val team2: Team?,
    val tournament: String,
    val refId: Team?,
    var field: Field?,
    val start: LocalDateTime,
    val end: LocalDateTime?,
    val division: String,
    val team1Points: List<Int>,
    val team2Points: List<Int>,
    val losersBracket: Boolean,
    var winnerNextMatch: Match?,
    var loserNextMatch: Match?,
    var previousLeftMatch: Match?,
    var previousRightMatch: Match?,
    val setResults: List<Int>,
    override val id: String,
) : Document()