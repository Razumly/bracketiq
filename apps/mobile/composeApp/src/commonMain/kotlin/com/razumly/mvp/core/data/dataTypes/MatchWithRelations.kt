package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentMatchCrossRef
import kotlinx.serialization.Serializable

@Serializable
data class MatchWithRelations(
    @Embedded
    val match: MatchMVP,

    @Relation(
        parentColumn = "tournamentId",
        entity = Tournament::class,
        entityColumn = "id",
        associateBy = Junction(
            value = TournamentMatchCrossRef::class,
            parentColumn = "matchId",
            entityColumn = "tournamentId"
        )
    )
    val tournament: Tournament,

    @Relation(
        parentColumn = "team1",
        entity = Team::class,
        entityColumn = "id"
    )
    val team1: Team?,

    @Relation(
        parentColumn = "team2",
        entity = Team::class,
        entityColumn = "id"
    )
    val team2: Team?,

    @Relation(
        parentColumn = "refId",
        entity = Team::class,
        entityColumn = "id"
    )
    val ref: Team?,

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