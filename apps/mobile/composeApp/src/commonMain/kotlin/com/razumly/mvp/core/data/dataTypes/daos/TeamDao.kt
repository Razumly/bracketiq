package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.MatchTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentTeamCrossRef
import kotlinx.coroutines.flow.Flow

@Dao
interface TeamDao {
    @Upsert
    suspend fun upsertTeam(team: Team)

    @Upsert
    suspend fun upsertTeams(teams: List<Team>)

    @Query("SELECT * FROM Team WHERE tournamentIds = :tournamentId")
    suspend fun getTeamsInTournament(tournamentId: String): List<Team>

    @Query("SELECT * FROM Team WHERE eventIds = :eventId")
    suspend fun getTeamsInEvent(eventId: String): List<Team>

    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeam(teamId: String): Team

    @Query("SELECT * FROM Team WHERE id in (:teamIds)")
    suspend fun getTeams(teamIds: List<String>): List<Team>

    @Query("DELETE FROM Team WHERE id IN (:ids)")
    suspend fun deleteTeamsByIds(ids: List<String>)

    @Upsert
    suspend fun upsertTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Upsert
    suspend fun upsertTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>)

    @Upsert
    suspend fun upsertMatchTeamCrossRefs(crossRefs: List<MatchTeamCrossRef>)

    @Upsert
    suspend fun upsertEventTeamCrossRefs(crossRefs: List<EventTeamCrossRef>)

    @Upsert
    suspend fun upsertTournamentTeamCrossRefs(crossRefs: List<TournamentTeamCrossRef>)

    @Delete
    suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeamWithPlayers(teamId: String): TeamWithRelations?

    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    fun getTeamWithPlayersFlow(teamId: String): Flow<TeamWithRelations>

    @Transaction
    @Query("SELECT * FROM Team WHERE id in (:teamIds)")
    suspend fun getTeamsWithPlayers(teamIds: List<String>): List<TeamWithRelations>

    @Transaction
    @Query("SELECT * FROM Team WHERE tournamentIds = :tournamentId")
    fun getTeamsInTournamentFlow(tournamentId: String): Flow<List<TeamWithRelations>>

    @Query("SELECT * FROM Team WHERE eventIds = :eventId")
    fun getTeamsInEventFlow(eventId: String): Flow<List<TeamWithRelations>>

    @Transaction
    @Query("SELECT * FROM Team WHERE id In (:ids)")
    fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<TeamWithRelations>>

    @Transaction
    suspend fun upsertTeamWithRelations(team: Team) {
        deleteUsersFromTeam(team)
        deleteTeamFromEvents(team)
        deleteTeamFromTournaments(team)
        upsertTeamPlayerCrossRefs(team.players.map { playerId ->
            TeamPlayerCrossRef(team.id, playerId)
        })
        upsertEventTeamCrossRefs(team.eventIds.map {eventId ->
            EventTeamCrossRef(team.id, eventId)
        })
        upsertTournamentTeamCrossRefs(team.tournamentIds.map {tournamentId ->
            TournamentTeamCrossRef(team.id, tournamentId)
        })
    }

    // Add player to team
    @Transaction
    suspend fun upsertTeamsWithRelations(teams: List<Team>) {
        teams.forEach { team ->
            upsertTeamWithRelations(team)
        }
    }

    @Transaction
    suspend fun deleteTeamFromEvents(team: Team) {
        team.eventIds.forEach { eventId ->
            deleteEventTeamCrossRef(EventTeamCrossRef(eventId, team.id))
        }
    }

    @Transaction
    suspend fun deleteTeamFromTournaments(team: Team) {
        team.tournamentIds.forEach { tournamentId ->
            deleteTournamentTeamCrossRef(TournamentTeamCrossRef(tournamentId, team.id))
        }
    }

    @Transaction
    suspend fun deleteUsersFromTeam(team: Team) {
        team.players.forEach { playerId ->
            removePlayerFromTeam(TeamPlayerCrossRef(team.id, playerId))
        }
    }

    @Delete
    suspend fun deleteEventTeamCrossRef(crossRef: EventTeamCrossRef)

    @Delete
    suspend fun deleteTournamentTeamCrossRef(crossRef: TournamentTeamCrossRef)

    @Delete
    suspend fun removePlayerFromTeam(crossRef: TeamPlayerCrossRef)
}