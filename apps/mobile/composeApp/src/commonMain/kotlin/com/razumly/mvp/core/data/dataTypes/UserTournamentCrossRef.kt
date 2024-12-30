package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "user_tournament_cross_ref",
    primaryKeys = ["userId", "tournamentId"],
    foreignKeys = [
        ForeignKey(
            entity = UserData::class,
            parentColumns = ["id"],
            childColumns = ["userId"]
        ),
        ForeignKey(
            entity = Tournament::class,
            parentColumns = ["id"],
            childColumns = ["tournamentId"]
        )
    ],
    indices = [
        Index("userId"),
        Index("tournamentId")
    ]
)
data class UserTournamentCrossRef(
    val userId: String,
    val tournamentId: String
)