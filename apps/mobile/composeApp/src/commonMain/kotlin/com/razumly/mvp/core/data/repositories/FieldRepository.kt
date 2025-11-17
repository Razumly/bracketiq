package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.TablesDB
import kotlinx.coroutines.flow.Flow

interface IFieldRepository : IMVPRepository {
    suspend fun createFields(tournamentId: String, count: Int): Result<Unit>

    fun getFieldsInTournamentWithMatchesFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    suspend fun getFieldsInTournament(tournamentId: String): Result<List<Field>>
}

class FieldRepository(
    private val tablesDb: TablesDB,
    private val databaseService: DatabaseService
) : IFieldRepository {
    override suspend fun createFields(tournamentId: String, count: Int) = runCatching {
        val fields = List(count) { Field(tournamentId = tournamentId, fieldNumber = it + 1) }
        fields.forEach { field ->
            tablesDb.createRow<Field>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.FIELDS_TABLE,
                rowId = field.id,
                data = field,
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
                val docs = tablesDb.listRows<Field>(
                    databaseId = DbConstants.DATABASE_NAME,
                    tableId = DbConstants.FIELDS_TABLE,
                    queries = listOf(Query.contains(DbConstants.EVENT_ID_ATTRIBUTE, tournamentId)),
                    nestedType = Field::class
                )
                docs.rows.map { it.data.copy(id = it.id) }
            },
            saveData = { fields ->
                databaseService.getFieldDao.upsertFields(fields)
            },
            getLocalData = { databaseService.getFieldDao.getFields(tournamentId) },
            deleteData = { databaseService.getFieldDao.deleteFieldsById(it) }
        )
}
