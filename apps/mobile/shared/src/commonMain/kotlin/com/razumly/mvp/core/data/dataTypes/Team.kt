package com.razumly.mvp.core.data.dataTypes

data class Team(
    val players: List<UserData?>,
    val tournament: String,
    var matches: List<Match?>,
    val seed: Int,
    val division: String,
    var wins: Int,
    var losses: Int,
    override val id: String,
) : Document()