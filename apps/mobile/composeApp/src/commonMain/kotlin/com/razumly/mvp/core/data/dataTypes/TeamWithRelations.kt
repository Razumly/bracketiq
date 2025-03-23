package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.MatchTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentTeamCrossRef
import kotlinx.serialization.Serializable

@Serializable
data class TeamWithRelations(
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
    val players: List<UserData>,

    @Relation(
        parentColumn = "id",
        entityColumn = "team1",
        associateBy = Junction(
            value = MatchTeamCrossRef::class,
            parentColumn = "teamId",
            entityColumn = "matchId"
        )
    )
    val matchAsTeam1: List<MatchMVP>,

    @Relation(
        parentColumn = "id",
        entityColumn = "team2",
        associateBy = Junction(
            value = MatchTeamCrossRef::class,
            parentColumn = "teamId",
            entityColumn = "matchId"
        )
    )
    val matchAsTeam2: List<MatchMVP>,

    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = EventUserCrossRef::class,
            parentColumn = "userId",
            entityColumn = "eventId"
        )
    )
    val event: EventImp,

    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = TournamentTeamCrossRef::class,
            parentColumn = "userId",
            entityColumn = "tournamentId"
        )
    )
    val tournament: Tournament
)
