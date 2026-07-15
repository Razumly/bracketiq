package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_ACKED
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_FAILED
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_PENDING
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_RETRYABLE
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_SYNCING
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_TERMINAL
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry

@Dao
interface MatchOperationOutboxDao {
    @Upsert
    suspend fun upsertOperation(operation: MatchOperationOutboxEntry)

    @Upsert
    suspend fun upsertOperations(operations: List<MatchOperationOutboxEntry>)

    /**
     * Allocates the next install-local sequence and persists the operation in one Room
     * transaction. Callers must provide a stable operation ID before invoking this method; the
     * returned entry is the sole source for the receipt metadata sent to the server.
     */
    @Transaction
    suspend fun allocateAndInsertOperation(operation: MatchOperationOutboxEntry): MatchOperationOutboxEntry {
        val persisted = operation.copy(clientSequence = maxClientSequence() + 1L)
        upsertOperation(persisted)
        return persisted
    }

    @Query(
        """
        SELECT * FROM MatchOperationOutboxEntry
        WHERE status IN (:pendingStatus, :retryableStatus, :syncingStatus, :legacyFailedStatus)
        ORDER BY clientSequence ASC, clientCreatedAt ASC
        """,
    )
    suspend fun getPendingOperations(
        pendingStatus: String = MATCH_OPERATION_STATUS_PENDING,
        retryableStatus: String = MATCH_OPERATION_STATUS_RETRYABLE,
        syncingStatus: String = MATCH_OPERATION_STATUS_SYNCING,
        legacyFailedStatus: String = MATCH_OPERATION_STATUS_FAILED,
    ): List<MatchOperationOutboxEntry>

    @Query(
        """
        SELECT * FROM MatchOperationOutboxEntry
        WHERE matchId = :matchId
          AND status IN (:pendingStatus, :retryableStatus, :syncingStatus, :legacyFailedStatus)
        ORDER BY clientSequence ASC, clientCreatedAt ASC
        """,
    )
    suspend fun getPendingOperationsForMatch(
        matchId: String,
        pendingStatus: String = MATCH_OPERATION_STATUS_PENDING,
        retryableStatus: String = MATCH_OPERATION_STATUS_RETRYABLE,
        syncingStatus: String = MATCH_OPERATION_STATUS_SYNCING,
        legacyFailedStatus: String = MATCH_OPERATION_STATUS_FAILED,
    ): List<MatchOperationOutboxEntry>

    @Query(
        """
        SELECT COUNT(*) FROM MatchOperationOutboxEntry
        WHERE status IN (:pendingStatus, :retryableStatus, :syncingStatus, :legacyFailedStatus)
        """,
    )
    suspend fun pendingOperationCount(
        pendingStatus: String = MATCH_OPERATION_STATUS_PENDING,
        retryableStatus: String = MATCH_OPERATION_STATUS_RETRYABLE,
        syncingStatus: String = MATCH_OPERATION_STATUS_SYNCING,
        legacyFailedStatus: String = MATCH_OPERATION_STATUS_FAILED,
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
          AND status IN (:pendingStatus, :retryableStatus)
        """,
    )
    suspend fun markAttempting(
        id: String,
        attemptedAt: String,
        status: String = MATCH_OPERATION_STATUS_SYNCING,
        pendingStatus: String = MATCH_OPERATION_STATUS_PENDING,
        retryableStatus: String = MATCH_OPERATION_STATUS_RETRYABLE,
    ): Int

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
    suspend fun markRetryable(
        id: String,
        error: String,
        failedAt: String,
        status: String = MATCH_OPERATION_STATUS_RETRYABLE,
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
    suspend fun markTerminal(
        id: String,
        error: String,
        failedAt: String,
        status: String = MATCH_OPERATION_STATUS_TERMINAL,
    )

    /**
     * A process can be killed after claiming an operation. Rows from the legacy FAILED state
     * have the same retry semantics, so recover both before a new serialized drain begins.
     */
    @Query(
        """
        UPDATE MatchOperationOutboxEntry
        SET status = :retryableStatus
        WHERE status IN (:syncingStatus, :legacyFailedStatus)
        """,
    )
    suspend fun recoverInterruptedOperations(
        retryableStatus: String = MATCH_OPERATION_STATUS_RETRYABLE,
        syncingStatus: String = MATCH_OPERATION_STATUS_SYNCING,
        legacyFailedStatus: String = MATCH_OPERATION_STATUS_FAILED,
    ): Int

    @Query("DELETE FROM MatchOperationOutboxEntry WHERE status = :status AND ackedAt < :olderThan")
    suspend fun deleteAckedOlderThan(
        olderThan: String,
        status: String = MATCH_OPERATION_STATUS_ACKED,
    )
}
