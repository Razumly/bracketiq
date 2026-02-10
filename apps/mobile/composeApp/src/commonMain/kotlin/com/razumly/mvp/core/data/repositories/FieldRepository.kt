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
    suspend fun createFields(count: Int, organizationId: String? = null): Result<List<Field>>

    fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>>

    suspend fun getFields(ids: List<String>): Result<List<Field>>
}

class FieldRepository(
    private val tablesDb: TablesDB,
    private val databaseService: DatabaseService
) : IFieldRepository {
    override suspend fun createFields(count: Int, organizationId: String?) =
        runCatching {
            val fields = List(count) { Field(fieldNumber = it + 1, organizationId = organizationId) }
            fields.forEach { field ->
                tablesDb.createRow<Field>(
                    databaseId = DbConstants.DATABASE_NAME,
                    tableId = DbConstants.FIELDS_TABLE,
                    rowId = field.id,
                    data = field,
                    nestedType = Field::class
                )
            }
            databaseService.getFieldDao.upsertFields(fields)
            fields
        }

    override fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>> {
        if (ids.isEmpty()) return kotlinx.coroutines.flow.flowOf(emptyList())
        return databaseService.getFieldDao.getFieldsWithMatches(ids)
    }

    override suspend fun getFields(ids: List<String>): Result<List<Field>> =
        multiResponse(
            getRemoteData = {
                if (ids.isEmpty()) return@multiResponse emptyList()
                val docs = tablesDb.listRows<Field>(
                    databaseId = DbConstants.DATABASE_NAME,
                    tableId = DbConstants.FIELDS_TABLE,
                    queries = listOf(Query.equal("\$id", ids)),
                    nestedType = Field::class
                )
                docs.rows.map { it.data.copy(id = it.id) }
            },
            saveData = { fields ->
                databaseService.getFieldDao.upsertFields(fields)
            },
            getLocalData = { databaseService.getFieldDao.getFieldsByIds(ids) },
            deleteData = { databaseService.getFieldDao.deleteFieldsById(it) }
        )
}
