package com.razumly.mvp.core.data.dataTypes.crossRef

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.MatchMVP


@Entity(
    tableName = "match_team_cross_ref",
    primaryKeys = ["teamId", "matchId"],
    foreignKeys = [
        ForeignKey(
            entity = MatchMVP::class,
            parentColumns = ["id"],
            childColumns = ["teamId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = EventImp::class,
            parentColumns = ["id"],
            childColumns = ["matchId"],
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