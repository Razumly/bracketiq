package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.Field

@Dao
interface FieldDao {
    @Upsert
    suspend fun upsertField(field: Field)

    @Upsert
    suspend fun upsertFields(fields: List<Field>)

    @Delete
    suspend fun deleteField(field: Field)

    @Query("SELECT * FROM Field WHERE id = :id")
    suspend fun getFieldById(id: String): Field?

    @Query("SELECT * FROM Field WHERE tournament = :tournament")
    suspend fun getFieldsByTournamentId(tournament: String): List<Field>
}