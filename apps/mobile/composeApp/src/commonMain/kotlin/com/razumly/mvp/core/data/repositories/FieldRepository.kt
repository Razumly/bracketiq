package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.Databases
import kotlinx.coroutines.flow.Flow

class FieldRepository(
    private val database: Databases,
    private val mvpDatabase: MVPDatabase
): IFieldRepository {
    override suspend fun getFieldsInTournamentWithMatchesFlow(tournamentId: String): Flow<List<FieldWithMatches>> {
        TODO("Not yet implemented")
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
                mvpDatabase.getFieldDao.upsertFields(fields)
            },
            getLocalData = { mvpDatabase.getFieldDao.getFields(tournamentId) },
            deleteData = { mvpDatabase.getFieldDao.deleteFieldsById(it) }
        )
}