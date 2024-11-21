package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation

data class MatchWithRelations(
    @Embedded
    val match: MatchMVP,

    @Relation(
        parentColumn = "team1",
        entity = Team::class,
        entityColumn = "id"
    )
    val team1: TeamWithPlayers?,

    @Relation(
        parentColumn = "team2",
        entity = Team::class,
        entityColumn = "id"
    )
    val team2: TeamWithPlayers?,

    @Relation(
        parentColumn = "refId",
        entity = UserData::class,  // Changed from Team to UserData
        entityColumn = "id"
    )
    val ref: UserWithTeams?,  // Changed from TeamWithPlayers

    @Relation(
        parentColumn = "field",
        entity = Field::class,
        entityColumn = "id"
    )
    val field: Field?,  // Simplified to avoid circular reference

    @Relation(
        parentColumn = "winnerNextMatchId",
        entityColumn = "id",
        entity = MatchMVP::class,
    )
    val winnerNextMatch: MatchMVP?,

    @Relation(
        parentColumn = "loserNextMatchId",
        entityColumn = "id",
        entity = MatchMVP::class,
    )
    val loserNextMatch: MatchMVP?,

    @Relation(
        parentColumn = "previousLeftMatchId",
        entityColumn = "id",
        entity = MatchMVP::class,
    )
    val previousLeftMatch: MatchMVP?,

    @Relation(
        parentColumn = "previousRightMatchId",
        entityColumn = "id",
        entity = MatchMVP::class,
    )
    val previousRightMatch: MatchMVP?,
)