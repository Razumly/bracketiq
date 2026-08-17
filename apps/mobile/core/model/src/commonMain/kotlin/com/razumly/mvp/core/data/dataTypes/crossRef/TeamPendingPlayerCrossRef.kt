package com.razumly.mvp.core.data.dataTypes.crossRef

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.razumly.mvp.core.data.dataTypes.Team

@Entity(
    tableName = "team_pending_player_cross_ref",
    primaryKeys = ["teamId", "userId"],
    foreignKeys = [
        ForeignKey(
            entity = Team::class,
            parentColumns = ["id"],
            childColumns = ["teamId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("teamId"),
        Index("userId")
    ]
)
data class TeamPendingPlayerCrossRef(
    val teamId: String,
    val userId: String
)
