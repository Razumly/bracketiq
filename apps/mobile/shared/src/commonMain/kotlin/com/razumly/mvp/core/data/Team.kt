package com.razumly.mvp.core.data

interface Team {
    val players: List<UserData?>
    val tournament: Tournament?
    val matches: List<Match?>
    val seed: Int
    val division: String
    val wins: Int
    val losses: Int
}