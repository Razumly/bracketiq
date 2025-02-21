package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation

class PickupGameWithRelations (
        @Embedded val tournament: PickupGame,
        @Relation(
            parentColumn = "id",
            entityColumn = "id",
            associateBy = Junction(
                value = UserTournamentCrossRef::class,
                parentColumn = "pickupGameId",
                entityColumn = "userId"
            )
        )
        val players: List<UserData>
)