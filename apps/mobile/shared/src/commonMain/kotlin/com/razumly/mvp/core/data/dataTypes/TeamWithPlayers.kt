package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation

data class TeamWithPlayers(
    @Embedded val team: Team,
    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = TeamPlayerCrossRef::class,
            parentColumn = "teamId",
            entityColumn = "userId"
        )
    )
    val players: List<UserData>
)
