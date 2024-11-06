package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class Team(
    val name: String?,
    val players: List<UserData?>,
    val tournament: String,
    var matches: List<Match?>,
    val seed: Int,
    val division: String,
    var wins: Int,
    var losses: Int,
    override val id: String,
) : Document()