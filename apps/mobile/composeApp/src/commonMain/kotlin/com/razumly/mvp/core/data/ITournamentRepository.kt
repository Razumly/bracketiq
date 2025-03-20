package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import kotlinx.coroutines.flow.Flow

interface ITournamentRepository {
    fun getTournamentWithRelations(tournamentId: String): Flow<Result<TournamentWithRelations>>
    suspend fun createTournament(newTournament: Tournament): Result<Tournament>
    suspend fun updateTournament(newTournament: Tournament): Result<Tournament>
    suspend fun deleteTournament(tournamentId: String): Result<Unit>
}