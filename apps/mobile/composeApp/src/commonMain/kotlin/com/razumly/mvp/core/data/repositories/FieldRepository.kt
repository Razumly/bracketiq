package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.Databases
import kotlinx.coroutines.flow.Flow

interface IFieldRepository : IMVPRepository {
    suspend fun createFields(tournamentId: String, count: Int): Result<Unit>

    fun getFieldsInTournamentWithMatchesFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    suspend fun getFieldsInTournament(tournamentId: String): Result<List<Field>>
}

class FieldRepository(
    private val database: Databases,
    private val databaseService: DatabaseService
) : IFieldRepository {
    override suspend fun createFields(tournamentId: String, count: Int) = runCatching {
        val fields = List(count) { Field(tournamentId = tournamentId, fieldNumber = it + 1) }
        fields.forEach { field ->
            database.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.FIELDS_COLLECTION,
                field.id,
                field,
                nestedType = Field::class
            )
        }
    }

    override fun getFieldsInTournamentWithMatchesFlow(tournamentId: String): Flow<List<FieldWithMatches>> {
        return databaseService.getFieldDao.getFieldsByTournamentId(tournamentId)
    }

    override suspend fun getFieldsInTournament(tournamentId: String): Result<List<Field>> =
        multiResponse(
            getRemoteData = {
                val docs = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.FIELDS_COLLECTION,
                    listOf(Query.contains(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId)),
                    nestedType = Field::class,
                )
                docs.documents.map { it.data.copy(id = it.id) }
            },
            saveData = { fields ->
                databaseService.getFieldDao.upsertFields(fields)
            },
            getLocalData = { databaseService.getFieldDao.getFields(tournamentId) },
            deleteData = { databaseService.getFieldDao.deleteFieldsById(it) }
        )
}