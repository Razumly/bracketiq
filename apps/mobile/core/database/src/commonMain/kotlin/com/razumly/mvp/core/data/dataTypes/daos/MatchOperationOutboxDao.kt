package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_ACKED
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_FAILED
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_PENDING
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_SYNCING
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry

@Dao
interface MatchOperationOutboxDao {
    @Upsert
    suspend fun upsertOperation(operation: MatchOperationOutboxEntry)

    @Upsert
    suspend fun upsertOperations(operations: List<MatchOperationOutboxEntry>)

    @Query(
        """
        SELECT * FROM MatchOperationOutboxEntry
        WHERE status IN (:pendingStatus, :failedStatus, :syncingStatus)
        ORDER BY clientSequence ASC, clientCreatedAt ASC
        """,
    )
    suspend fun getPendingOperations(
        pendingStatus: String = MATCH_OPERATION_STATUS_PENDING,
        failedStatus: String = MATCH_OPERATION_STATUS_FAILED,
        syncingStatus: String = MATCH_OPERATION_STATUS_SYNCING,
    ): List<MatchOperationOutboxEntry>

    @Query(
        """
        SELECT * FROM MatchOperationOutboxEntry
        WHERE matchId = :matchId
          AND status IN (:pendingStatus, :failedStatus, :syncingStatus)
        ORDER BY clientSequence ASC, clientCreatedAt ASC
        """,
    )
    suspend fun getPendingOperationsForMatch(
        matchId: String,
        pendingStatus: String = MATCH_OPERATION_STATUS_PENDING,
        failedStatus: String = MATCH_OPERATION_STATUS_FAILED,
        syncingStatus: String = MATCH_OPERATION_STATUS_SYNCING,
    ): List<MatchOperationOutboxEntry>

    @Query(
        """
        SELECT COUNT(*) FROM MatchOperationOutboxEntry
        WHERE status IN (:pendingStatus, :failedStatus, :syncingStatus)
        """,
    )
    suspend fun pendingOperationCount(
        pendingStatus: String = MATCH_OPERATION_STATUS_PENDING,
        failedStatus: String = MATCH_OPERATION_STATUS_FAILED,
        syncingStatus: String = MATCH_OPERATION_STATUS_SYNCING,
    ): Int

    @Query("SELECT * FROM MatchOperationOutboxEntry WHERE id IN (:ids)")
    suspend fun getOperationsByIds(ids: List<String>): List<MatchOperationOutboxEntry>

    @Query("SELECT COALESCE(MAX(clientSequence), 0) FROM MatchOperationOutboxEntry")
    suspend fun maxClientSequence(): Long

    @Query(
        """
        UPDATE MatchOperationOutboxEntry
        SET status = :status,
            lastAttemptAt = :attemptedAt,
            attemptCount = attemptCount + 1,
            lastError = NULL
        WHERE id = :id
        """,
    )
    suspend fun markAttempting(
        id: String,
        attemptedAt: String,
        status: String = MATCH_OPERATION_STATUS_SYNCING,
    )

    @Query(
        """
        UPDATE MatchOperationOutboxEntry
        SET status = :status,
            ackedAt = :ackedAt,
            lastError = NULL
        WHERE id = :id
        """,
    )
    suspend fun markAcked(
        id: String,
        ackedAt: String,
        status: String = MATCH_OPERATION_STATUS_ACKED,
    )

    @Query(
        """
        UPDATE MatchOperationOutboxEntry
        SET status = :status,
            lastError = :error,
            lastAttemptAt = :failedAt
        WHERE id = :id
        """,
    )
    suspend fun markFailed(
        id: String,
        error: String,
        failedAt: String,
        status: String = MATCH_OPERATION_STATUS_FAILED,
    )

    @Query("DELETE FROM MatchOperationOutboxEntry WHERE status = :status AND ackedAt < :olderThan")
    suspend fun deleteAckedOlderThan(
        olderThan: String,
        status: String = MATCH_OPERATION_STATUS_ACKED,
    )
}
