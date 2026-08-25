package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.ProfileDocumentCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface ProfileDocumentDao {
    @Query(
        """
        SELECT * FROM profile_document_cache
        WHERE viewerKey = :viewerKey
        ORDER BY CASE status
            WHEN 'UNSIGNED' THEN 0
            WHEN 'SIGNED' THEN 1
            WHEN 'VOID' THEN 2
            ELSE 3
        END, sortOrder ASC
        """,
    )
    fun observeDocuments(viewerKey: String): Flow<List<ProfileDocumentCacheEntry>>

    @Query("DELETE FROM profile_document_cache WHERE viewerKey = :viewerKey")
    suspend fun deleteForViewer(viewerKey: String)

    @Upsert
    suspend fun upsertDocuments(entries: List<ProfileDocumentCacheEntry>)

    @Transaction
    suspend fun replaceDocuments(viewerKey: String, entries: List<ProfileDocumentCacheEntry>) {
        deleteForViewer(viewerKey)
        upsertDocuments(entries)
    }
}
