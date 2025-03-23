package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.flow.Flow

interface ITeamRepository : IMVPRepository {
    suspend fun getTeamsOfTournament(tournamentId: String): Result<List<Team>>
    suspend fun getTeamsOfEvent(eventId: String): Result<List<Team>>
    suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit>
    suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit>
    suspend fun createTeam(): Result<Team>
    suspend fun updateTeam(newTeam: Team): Result<Team>
    suspend fun getTeamsWithPlayersFlow(ids: List<String>): Flow<Result<List<TeamWithRelations>>>
}