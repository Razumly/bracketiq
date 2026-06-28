package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import kotlinx.coroutines.flow.Flow

@Dao
interface FieldDao {
    @Upsert
    suspend fun upsertField(field: Field)

    @Upsert
    suspend fun upsertFields(fields: List<Field>)

    @Query("SELECT * FROM Field WHERE id IN (:ids)")
    suspend fun getFieldsByIds(ids: List<String>): List<Field>

    @Query("SELECT * FROM Field")
    suspend fun getAllFields(): List<Field>

    @Query("DELETE FROM Field WHERE id IN (:ids)")
    suspend fun deleteFieldsById(ids: List<String>)

    @Delete
    suspend fun deleteField(field: Field)

    @Transaction
    @Query("SELECT * FROM Field WHERE id = :id")
    fun getFieldById(id: String): Flow<FieldWithMatches?>

    @Transaction
    @Query("SELECT * FROM Field WHERE id IN (:ids)")
    fun getFieldsWithMatches(ids: List<String>): Flow<List<FieldWithMatches>>
}
