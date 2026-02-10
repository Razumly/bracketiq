package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Relation
import kotlinx.serialization.Serializable

@Serializable
data class MatchWithRelations(
    @Embedded
    val match: MatchMVP,

    @Relation(
        parentColumn = "fieldId",
        entityColumn = "id"
    )
    val field: Field?,

    @Relation(
        parentColumn = "team1Id",
        entityColumn = "id"
    )
    val team1: Team?,

    @Relation(
        parentColumn = "team2Id",
        entityColumn = "id"
    )
    val team2: Team?,

    @Relation(
        parentColumn = "teamRefereeId",
        entityColumn = "id"
    )
    val teamReferee: Team?,

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
        parentColumn = "previousLeftId",
        entityColumn = "id",
        entity = MatchMVP::class,
    )
    val previousLeftMatch: MatchMVP?,

    @Relation(
        parentColumn = "previousRightId",
        entityColumn = "id",
        entity = MatchMVP::class,
    )
    val previousRightMatch: MatchMVP?,
)
