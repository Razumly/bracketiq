package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithPlayers
import kotlinx.coroutines.flow.Flow

interface ITournamentRepository : IMVPRepository {
    fun getTournamentWithRelationsFlow(tournamentId: String): Flow<Result<TournamentWithPlayers>>
    fun getTournamentFlow(tournamentId: String): Flow<Result<Tournament>>
    suspend fun getTournament(tournamentId: String): Result<TournamentWithPlayers>
    fun getTournamentsFlow(query: String): Flow<Result<List<TournamentWithPlayers>>>
    suspend fun getTournaments(query: String): Result<List<Tournament>>
    suspend fun createTournament(newTournament: Tournament): Result<Tournament>
    suspend fun updateTournament(newTournament: Tournament): Result<Tournament>
    suspend fun deleteTournament(tournamentId: String): Result<Unit>
}