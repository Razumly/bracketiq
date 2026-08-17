package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry

/** Keeps the durable operation and its optimistic local projection crash-consistent. */
@Dao
interface MatchOperationTransactionDao {
    @Upsert
    suspend fun upsertOutboxOperation(operation: MatchOperationOutboxEntry)

    @Upsert
    suspend fun upsertOptimisticMatch(match: MatchMVP)

    @Transaction
    suspend fun enqueueOperationAndOptimisticMatch(
        operation: MatchOperationOutboxEntry,
        match: MatchMVP,
    ) {
        upsertOutboxOperation(operation)
        upsertOptimisticMatch(match)
    }
}
