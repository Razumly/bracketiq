package com.razumly.mvp.core.data.dataTypes

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Team(
    var name: String? = null,
    var tournament: String = "",
    var seed: Int = 0,
    var division: String = "",
    var wins: Int = 0,
    var losses: Int = 0,
    @Ignore
    var players: List<String> = emptyList(),
    @PrimaryKey
    override var id: String = ""
) : Document() {
    constructor() : this(
        name = null,
        tournament = "",
        seed = 0,
        division = "",
        wins = 0,
        losses = 0,
        players = emptyList(),
        id = ""
    )
}