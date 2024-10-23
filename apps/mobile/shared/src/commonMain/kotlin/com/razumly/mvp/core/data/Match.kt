package com.razumly.mvp.core.data

import kotlinx.datetime.LocalDateTime

interface Match {
    val matchId: Int
    val team1: Team?
    val team2: Team?
    val tournament: Tournament
    val refId: Team?
    val field: Field?
    val start: LocalDateTime
    val end: LocalDateTime?
    val team1Points: List<Int>
    val team2Points: List<Int>
    val losersBracket: Boolean
    val winnerNextMatch: Match?
    val loserNextMatch: Match?
    val previousLeftMatch: Match?
    val previousRightMatch: Match?
    val setResults: List<Int>
}