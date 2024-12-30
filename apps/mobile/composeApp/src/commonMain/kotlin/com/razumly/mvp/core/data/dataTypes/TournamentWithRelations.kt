package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation


data class TournamentWithRelations (
    @Embedded val tournament: Tournament,
    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = UserTournamentCrossRef::class,
            parentColumn = "tournamentId",
            entityColumn = "userId"
        )
    )
    val players: List<UserData>
)