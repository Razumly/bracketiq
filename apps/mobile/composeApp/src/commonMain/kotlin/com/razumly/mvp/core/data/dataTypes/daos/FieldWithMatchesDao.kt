package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface FieldWithMatchesDao {
    @Transaction
    @Query("SELECT * FROM Field")
    suspend fun getFieldWithMatches(): List<FieldWithMatchesDao>?
}