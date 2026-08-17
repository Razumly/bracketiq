package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.RewriteQueriesToDropUnusedColumns
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import kotlinx.coroutines.flow.Flow

@Dao
interface RefundRequestDao {

    @Upsert
    suspend fun upsertRefundRequest(refundRequest: RefundRequest)

    @Upsert
    suspend fun upsertRefundRequests(refundRequests: List<RefundRequest>)

    @Query("SELECT * FROM RefundRequest WHERE id = :refundId")
    suspend fun getRefundRequest(refundId: String): RefundRequest?

    @Query("SELECT * FROM RefundRequest WHERE hostId = :hostId")
    suspend fun getRefundRequestsForHost(hostId: String): List<RefundRequest>

    @Query("SELECT * FROM RefundRequest WHERE hostId = :hostId")
    fun getRefundRequestsForHostFlow(hostId: String): Flow<List<RefundRequest>>

    @Query("DELETE FROM RefundRequest WHERE id = :refundId")
    suspend fun deleteRefundRequest(refundId: String)

    @Query("DELETE FROM RefundRequest WHERE id IN (:refundIds)")
    suspend fun deleteRefundRequests(refundIds: List<String>)

    @Query("DELETE FROM RefundRequest")
    suspend fun deleteAllRefundRequests()

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM RefundRequest WHERE hostId = :hostId")
    suspend fun getRefundRequestsWithRelations(hostId: String): List<RefundRequestWithRelations>

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM RefundRequest WHERE hostId = :hostId")
    fun getRefundRequestsWithRelationsFlow(hostId: String): Flow<List<RefundRequestWithRelations>>

    @RewriteQueriesToDropUnusedColumns
    @Transaction
    @Query("SELECT * FROM RefundRequest WHERE id = :refundId")
    suspend fun getRefundRequestWithRelations(refundId: String): RefundRequestWithRelations?
}
