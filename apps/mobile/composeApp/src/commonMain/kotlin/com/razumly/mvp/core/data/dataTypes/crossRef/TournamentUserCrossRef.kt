package com.razumly.mvp.core.data.dataTypes.crossRef

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData

@Entity(
    tableName = "user_tournament_cross_ref",
    primaryKeys = ["userId", "tournamentId"],
    foreignKeys = [
        ForeignKey(
            entity = UserData::class,
            parentColumns = ["id"],
            childColumns = ["userId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = Event::class,
            parentColumns = ["id"],
            childColumns = ["tournamentId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("userId"),
        Index("tournamentId")
    ]
)
data class TournamentUserCrossRef(
    val userId: String,
    val tournamentId: String
)