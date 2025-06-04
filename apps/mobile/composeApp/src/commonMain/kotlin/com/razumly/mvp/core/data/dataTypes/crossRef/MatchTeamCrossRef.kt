package com.razumly.mvp.core.data.dataTypes.crossRef

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team


@Entity(
    tableName = "match_team_cross_ref",
    primaryKeys = ["teamId", "matchId"],
    foreignKeys = [
        ForeignKey(
            entity = MatchMVP::class,
            parentColumns = ["id"],
            childColumns = ["matchId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = Team::class,
            parentColumns = ["id"],
            childColumns = ["teamId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("teamId"),
        Index("matchId")
    ]
)
data class MatchTeamCrossRef(
    val teamId: String,
    val matchId: String
)