package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Team
import kotlinx.datetime.LocalDateTime

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
    val team1Points: List<Int>,
    val team2Points: List<Int>,
    val losersBracket: Boolean,
    val winnerNextMatch: String?,
    val loserNextMatch: String?,
    val previousLeftMatch: String?,
    val previousRightMatch: String?,
    val setResults: List<Int>,
)