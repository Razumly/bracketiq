package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers

@Dao
interface TeamDao {
    @Upsert
    suspend fun upsertTeam(team: Team)

    @Upsert
    suspend fun upsertTeams(teams: List<Team>)

    @Upsert
    suspend fun upsertTeamPlayerCrossRef(crossRef: TeamPlayerCrossRef)

    @Transaction
    @Query("SELECT * FROM Team WHERE id = :teamId")
    suspend fun getTeamWithPlayers(teamId: String): TeamWithPlayers?

    @Transaction
    @Query("SELECT * FROM Team WHERE tournament = :tournamentId")
    suspend fun getTeamsWithPlayers(tournamentId: String): List<TeamWithPlayers>

    // Add player to team
    @Transaction
    suspend fun addPlayerToTeam(teamId: String, userId: String) {
        upsertTeamPlayerCrossRef(TeamPlayerCrossRef(teamId, userId))
    }

    // Remove player from team
    @Delete
    suspend fun removePlayerFromTeam(crossRef: TeamPlayerCrossRef)
}