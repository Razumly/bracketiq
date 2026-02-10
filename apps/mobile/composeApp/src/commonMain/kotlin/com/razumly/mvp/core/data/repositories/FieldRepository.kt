package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.FieldsResponseDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

interface IFieldRepository : IMVPRepository {
    suspend fun createFields(count: Int, organizationId: String? = null): Result<List<Field>>
    fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>>
    suspend fun getFields(ids: List<String>): Result<List<Field>>
}

class FieldRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) : IFieldRepository {
    override suspend fun createFields(count: Int, organizationId: String?): Result<List<Field>> =
        runCatching {
            val fields = List(count) { Field(fieldNumber = it + 1, organizationId = organizationId) }
            val created = fields.map { field ->
                api.post<Field, Field>(path = "api/fields", body = field)
            }
            databaseService.getFieldDao.upsertFields(created)
            created
        }

    override fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>> {
        if (ids.isEmpty()) return flowOf(emptyList())
        return databaseService.getFieldDao.getFieldsWithMatches(ids)
    }

    override suspend fun getFields(ids: List<String>): Result<List<Field>> =
        multiResponse(
            getRemoteData = {
                val fieldIds = ids.distinct().filter(String::isNotBlank)
                if (fieldIds.isEmpty()) return@multiResponse emptyList()
                val encodedIds = fieldIds.joinToString(",") { it.trim() }.encodeURLQueryComponent()
                api.get<FieldsResponseDto>("api/fields?ids=$encodedIds").fields
            },
            saveData = { fields -> databaseService.getFieldDao.upsertFields(fields) },
            getLocalData = { databaseService.getFieldDao.getFieldsByIds(ids) },
            deleteData = { staleIds -> databaseService.getFieldDao.deleteFieldsById(staleIds) },
        )
}

