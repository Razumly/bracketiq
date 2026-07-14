package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillingEventRefDto
import com.razumly.mvp.core.network.dto.BillingRefundRequestDto
import com.razumly.mvp.core.network.dto.RefundAllRequestDto
import com.razumly.mvp.core.network.dto.RefundRequestsResponseDto
import com.razumly.mvp.core.network.dto.UpdateRefundRequestDto
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent

/** Owns refund request creation, hydration, approval, and rejection. */
internal class BillingRefundCoordinator(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
    private val eventRepository: IEventRepository,
    private val databaseService: DatabaseService,
) {
    suspend fun leaveAndRefundEvent(
        event: Event,
        reason: String,
        targetUserId: String?,
    ): Result<Unit> = runCatching {
        val response = api.post<BillingRefundRequestDto, RefundResponse>(
            path = "api/billing/refund",
            body = BillingRefundRequestDto(
                payloadEvent = BillingEventRefDto(
                    id = event.id,
                    hostId = event.hostId,
                    organizationId = event.organizationId,
                ),
                userId = targetUserId,
                reason = reason,
            ),
        )

        if (!response.error.isNullOrBlank()) throw Exception(response.error)
        if (response.success == false) throw Exception(response.message ?: "Refund request failed")
    }

    suspend fun deleteAndRefundEvent(event: Event): Result<Unit> = runCatching {
        // Server-side operation: create refund requests for event participants.
        api.post<RefundAllRequestDto, RefundResponse>(
            path = "api/billing/refund-all",
            body = RefundAllRequestDto(eventId = event.id),
        )

        eventRepository.deleteEvent(event.id).getOrThrow()
    }

    suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>> = runCatching {
        val currentUserId = userRepository.currentUser.value.getOrThrow().id
        val encoded = currentUserId.encodeURLQueryComponent()

        val serverRefunds = api.get<RefundRequestsResponseDto>("api/refund-requests?hostId=$encoded&limit=200").refunds
        databaseService.getRefundRequestDao.upsertRefundRequests(serverRefunds)

        val refundUserIds = serverRefunds.map { refund -> refund.userId }.distinct()
        if (refundUserIds.isNotEmpty()) {
            userRepository.getUsers(refundUserIds).onFailure { error ->
                Napier.e("Failed to cache users for refund hydration", error)
            }
        }

        val refundEventIds = serverRefunds.map { refund -> refund.eventId }.distinct()
        if (refundEventIds.isNotEmpty()) {
            eventRepository.getEventsByIds(refundEventIds).onFailure { error ->
                Napier.e("Failed to cache events for refund hydration", error)
            }
        }

        databaseService.getRefundRequestDao.getRefundRequestsWithRelations(currentUserId)
    }

    suspend fun getRefunds(): Result<List<RefundRequest>> = runCatching {
        val currentUserId = userRepository.currentUser.value.getOrThrow().id
        val encoded = currentUserId.encodeURLQueryComponent()

        val serverRefunds = api.get<RefundRequestsResponseDto>("api/refund-requests?hostId=$encoded&limit=200").refunds
        databaseService.getRefundRequestDao.upsertRefundRequests(serverRefunds)
        serverRefunds
    }

    suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit> = runCatching {
        api.patch<UpdateRefundRequestDto, RefundRequest>(
            path = "api/refund-requests/${refundRequest.id}",
            body = UpdateRefundRequestDto(status = "APPROVED"),
        )

        databaseService.getRefundRequestDao.deleteRefundRequest(refundRequest.id)
    }

    suspend fun rejectRefund(refundId: String): Result<Unit> = runCatching {
        api.patch<UpdateRefundRequestDto, RefundRequest>(
            path = "api/refund-requests/$refundId",
            body = UpdateRefundRequestDto(status = "REJECTED"),
        )

        databaseService.getRefundRequestDao.deleteRefundRequest(refundId)
    }
}
