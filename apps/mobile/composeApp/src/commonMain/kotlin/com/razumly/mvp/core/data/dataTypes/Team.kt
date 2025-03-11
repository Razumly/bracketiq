package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.enums.Divisions
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class Team(
    var tournament: String,
    var seed: Int,
    var division: Divisions,
    var wins: Int,
    var losses: Int,
    var name: String? = null,
    @Ignore
    var players: List<String> = emptyList(),
    @PrimaryKey
    @Transient
    override var id: String = ""
) : MVPDocument {
    // Provide an explicit no-arg constructor for Room.
    constructor() : this(
        tournament = "",
        seed = 0,
        division = Divisions.NOVICE,
        wins = 0,
        losses = 0,
        name = null,
        players = emptyList(),
        id = ""
    )
}