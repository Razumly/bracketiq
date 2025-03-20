package com.razumly.mvp.core.data.dataTypes.crossRef

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament

@Entity(
    tableName = "tournament_team_cross_ref",
    primaryKeys = ["tournamentId", "teamId"],
    foreignKeys = [
        ForeignKey(
            entity = Tournament::class,
            parentColumns = ["id"],
            childColumns = ["tournamentId"]
        ),
        ForeignKey(
            entity = Team::class,
            parentColumns = ["id"],
            childColumns = ["teamId"]
        )
    ],
    indices = [
        Index("tournamentId"),
        Index("teamId")
    ]
)
data class TournamentTeamCrossRef(
    val tournamentId: String,
    val teamId: String
)