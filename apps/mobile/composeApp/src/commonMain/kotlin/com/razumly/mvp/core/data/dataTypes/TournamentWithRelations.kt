package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentMatchCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef


data class TournamentWithRelations (
    @Embedded override val event: Tournament,
    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = TournamentUserCrossRef::class,
            parentColumn = "tournamentId",
            entityColumn = "userId"
        )
    )
    override val players: List<UserData> = listOf(),

    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = TournamentTeamCrossRef::class,
            parentColumn = "tournamentId",
            entityColumn = "teamId"
        )
    )
    override val teams: List<Team> = listOf(),

    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = TournamentMatchCrossRef::class,
            parentColumn = "tournamentId",
            entityColumn = "matchId"
        )
    )
    val matches: List<MatchMVP> = listOf(),
) : EventAbsWithRelations