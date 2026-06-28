package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import kotlinx.serialization.Serializable

@Serializable
data class TeamWithRelations(
    @Embedded val team: Team,
    @Relation(
        parentColumn = "id", entityColumn = "id", associateBy = androidx.room.Junction(
            value = TeamPlayerCrossRef::class, parentColumn = "teamId", entityColumn = "userId"
        )
    ) val players: List<UserData>,
    @Relation(
        parentColumn = "id", entityColumn = "team1Id"
    ) val matchAsTeam1: List<MatchMVP>,

    @Relation(
        parentColumn = "id", entityColumn = "team2Id"
    ) val matchAsTeam2: List<MatchMVP>,
)
