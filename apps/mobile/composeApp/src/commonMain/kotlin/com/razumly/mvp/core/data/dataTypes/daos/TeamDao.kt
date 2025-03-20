package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import io.github.aakira.napier.Napier
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

    @Query("SELECT * FROM Team WHERE id in (:teamIds)")
    suspend fun getTeams(teamIds: List<String>): List<Team>?

    @Query("DELETE FROM Team WHERE id IN (:ids)")
    suspend fun deleteTeamsByIds(ids: List<String>)

    @Upsert
    suspend fun upsertTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Upsert
    suspend fun upsertTeamPlayerCrossRefs(crossRefs: List<TeamPlayerCrossRef>)

    @Delete
    suspend fun deleteTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeamWithPlayers(teamId: String): TeamWithRelations?

    @Transaction
    @Query("SELECT * FROM Team WHERE id in (:teamIds)")
    suspend fun getTeamsWithPlayers(teamIds: List<String>): List<TeamWithRelations>?

    @Transaction
    @Query("SELECT * FROM Team WHERE tournamentIds = :tournamentId")
    fun getTeamsInTournamentFlow(tournamentId: String): Flow<List<TeamWithRelations>>

    @Transaction
    @Query("SELECT * FROM Team WHERE id In (:ids)")
    fun getTeamsWithPlayersFlowByIds(ids: List<String>): Flow<List<TeamWithRelations>>

    // Add player to team
    @Transaction
    suspend fun upsertTeamsWithPlayers(teams: List<Team>) {
        teams.forEach { team ->
            team.players.forEach { playerId ->
                try {
                    upsertTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, playerId))
                } catch (e: Exception) {
                    Napier.e("Failed to create cross reference for team ${team.id} and player $playerId: $e")
                }
            }
        }
    }

    // Remove player from team
    @Delete
    suspend fun removePlayerFromTeam(crossRef: TeamPlayerCrossRef)
}