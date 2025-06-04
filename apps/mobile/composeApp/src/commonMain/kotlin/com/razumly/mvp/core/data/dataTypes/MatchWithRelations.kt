package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.FieldMatchCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.MatchTeamCrossRef
import kotlinx.serialization.Serializable

@Serializable
data class MatchWithRelations(
    @Embedded
    val match: MatchMVP,

    @Relation(
        parentColumn = "field",
        entityColumn = "id",
        associateBy = Junction(
            value = FieldMatchCrossRef::class,
            parentColumn = "matchId",
            entityColumn = "fieldId"
        )
    )
    val field: Field?,

    @Relation(
        parentColumn = "team1",
        entityColumn = "id",
        associateBy = Junction(
            value = MatchTeamCrossRef::class,
            parentColumn = "matchId",
            entityColumn = "teamId"
        )
    )
    val team1: Team?,

    @Relation(
        parentColumn = "team2",
        entityColumn = "id",
        associateBy = Junction(
            value = MatchTeamCrossRef::class,
            parentColumn = "matchId",
            entityColumn = "teamId"
        )
    )
    val team2: Team?,

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