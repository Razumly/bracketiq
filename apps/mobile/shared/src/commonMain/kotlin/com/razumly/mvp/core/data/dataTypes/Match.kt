package com.razumly.mvp.core.data.dataTypes

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
data class Match(
    val matchId: Int,
    var team1: Team?,
    var team2: Team?,
    val tournament: String,
    var refId: Team?,
    var field: Field?,
    var start: Instant,
    var end: Instant?,
    val division: String,
    var team1Points: List<Int>,
    var team2Points: List<Int>,
    val losersBracket: Boolean,
    var winnerNextMatch: Match?,
    var loserNextMatch: Match?,
    var previousLeftMatch: Match?,
    var previousRightMatch: Match?,
    val setResults: List<Int>,
    override val id: String,
) : Document()