package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import kotlinx.coroutines.flow.Flow

interface IFieldRepository {
    suspend fun getFieldsInTournamentWithMatchesFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    suspend fun getFieldsInTournament(tournamentId: String): List<Field>
}