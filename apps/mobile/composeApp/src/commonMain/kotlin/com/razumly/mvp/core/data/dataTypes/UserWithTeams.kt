package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation

data class UserWithTeams(
    @Embedded val user: UserData,
    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = TeamPlayerCrossRef::class,
            parentColumn = "userId",
            entityColumn = "teamId"
        )
    )
    val teams: List<Team>
)