package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import kotlinx.coroutines.flow.Flow

interface IFieldRepository : IMVPRepository {
    suspend fun getFieldsInTournamentWithMatchesFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    suspend fun getFieldsInTournament(tournamentId: String): Result<List<Field>>
}