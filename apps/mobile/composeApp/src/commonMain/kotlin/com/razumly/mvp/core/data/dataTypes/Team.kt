package com.razumly.mvp.core.data.dataTypes

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Team(
    @ColumnInfo(name = "name")
    var name: String? = null,
    @ColumnInfo(name = "tournament")
    var tournament: String = "",
    @ColumnInfo(name = "seed")
    var seed: Int = 0,
    @ColumnInfo(name = "division")
    var division: String = "",
    @ColumnInfo(name = "wins")
    var wins: Int = 0,
    @ColumnInfo(name = "losses")
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