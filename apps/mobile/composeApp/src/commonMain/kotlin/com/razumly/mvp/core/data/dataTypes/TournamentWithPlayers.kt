package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef


data class TournamentWithPlayers (
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
) : EventAbsWithPlayers