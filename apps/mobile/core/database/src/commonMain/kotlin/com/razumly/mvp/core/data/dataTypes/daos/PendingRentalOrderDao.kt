package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_PENDING
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import com.razumly.mvp.core.data.dataTypes.PendingRentalOrder

@Dao
interface PendingRentalOrderDao {
    @Upsert
    suspend fun upsert(order: PendingRentalOrder)

    @Query(
        """
        SELECT * FROM PendingRentalOrder
        WHERE payerUserId = :payerUserId
          AND status IN (:pendingStatus, :awaitingPaymentStatus)
        ORDER BY createdAt ASC
        """,
    )
    suspend fun retryableOrders(
        payerUserId: String,
        pendingStatus: String = PENDING_RENTAL_ORDER_STATUS_PENDING,
        awaitingPaymentStatus: String = PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT,
    ): List<PendingRentalOrder>

    @Query("DELETE FROM PendingRentalOrder WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query(
        """
        UPDATE PendingRentalOrder
        SET attemptCount = attemptCount + 1, lastError = :error, lastAttemptAt = :attemptedAt
        WHERE id = :id
        """,
    )
    suspend fun markFailed(id: String, error: String, attemptedAt: String)

    @Query(
        """
        UPDATE PendingRentalOrder
        SET status = :status, lastError = :error, lastAttemptAt = :attemptedAt
        WHERE id = :id
        """,
    )
    suspend fun markAwaitingPayment(
        id: String,
        error: String,
        attemptedAt: String,
        status: String = PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT,
    )

    @Query(
        """
        UPDATE PendingRentalOrder
        SET status = :status, attemptCount = attemptCount + 1, lastError = :error, lastAttemptAt = :attemptedAt
        WHERE id = :id
        """,
    )
    suspend fun markRejected(
        id: String,
        error: String,
        attemptedAt: String,
        status: String = PENDING_RENTAL_ORDER_STATUS_REJECTED,
    )
}
