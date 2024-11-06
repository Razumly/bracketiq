package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData

data class TeamDTO(
    val id: String,
    val name: String?,
    val players: List<String>,
    val tournament: String,
    val seed: Int,
    val division: String,
    var wins: Int,
    var losses: Int,
)