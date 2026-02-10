package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.network.dto.BillingEventRefDto
import com.razumly.mvp.core.network.dto.BillingRefundRequestDto
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.PurchaseIntentRequestDto
import com.razumly.mvp.core.network.dto.RefundAllRequestDto
import com.razumly.mvp.core.network.dto.RefundRequestsResponseDto
import com.razumly.mvp.core.network.dto.StripeHostLinkRequestDto
import com.razumly.mvp.core.network.dto.UpdateRefundRequestDto
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

interface IBillingRepository : IMVPRepository {
    suspend fun createPurchaseIntent(
        event: Event,
        teamId: String? = null,
    ): Result<PurchaseIntent?>

    suspend fun createAccount(): Result<String>
    suspend fun getOnboardingLink(): Result<String>
    suspend fun leaveAndRefundEvent(event: Event, reason: String): Result<Unit>
    suspend fun deleteAndRefundEvent(event: Event): Result<Unit>

    suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>>
    suspend fun getRefunds(): Result<List<RefundRequest>>
    suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit>
    suspend fun rejectRefund(refundId: String): Result<Unit>
}

class BillingRepository(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
    private val eventRepository: IEventRepository,
    private val databaseService: DatabaseService,
) : IBillingRepository {
    override suspend fun createPurchaseIntent(
        event: Event,
        teamId: String?,
    ): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email

        val response = api.post<PurchaseIntentRequestDto, PurchaseIntent>(
            path = "api/billing/purchase-intent",
            body = PurchaseIntentRequestDto(
                user = BillingUserRefDto(id = user.id, email = email),
                event = BillingEventRefDto(
                    id = event.id,
                    eventType = event.eventType.name,
                    priceCents = event.priceCents,
                    hostId = event.hostId,
                    organizationId = event.organizationId,
                ),
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        response
    }

    override suspend fun createAccount(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val base = apiBaseUrl.trimEnd('/')

        val onboardingUrl = api.post<StripeHostLinkRequestDto, StripeOnboardingLinkResponseDto>(
            path = "api/billing/host/connect",
            body = StripeHostLinkRequestDto(
                refreshUrl = base,
                returnUrl = base,
                user = BillingUserRefDto(id = user.id, email = email),
            ),
        ).onboardingUrl

        // Server may update `hasStripeAccount`; refresh local user/profile cache.
        runCatching { userRepository.getCurrentAccount().getOrThrow() }

        onboardingUrl
    }

    override suspend fun getOnboardingLink(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val base = apiBaseUrl.trimEnd('/')

        api.post<StripeHostLinkRequestDto, StripeOnboardingLinkResponseDto>(
            path = "api/billing/host/onboarding-link",
            body = StripeHostLinkRequestDto(
                refreshUrl = base,
                returnUrl = base,
                user = BillingUserRefDto(id = user.id, email = email),
            ),
        ).onboardingUrl
    }

    override suspend fun leaveAndRefundEvent(event: Event, reason: String): Result<Unit> =
        runCatching {
            val response = api.post<BillingRefundRequestDto, RefundResponse>(
                path = "api/billing/refund",
                body = BillingRefundRequestDto(
                    payloadEvent = BillingEventRefDto(
                        id = event.id,
                        hostId = event.hostId,
                        organizationId = event.organizationId,
                    ),
                    reason = reason,
                ),
            )

            if (!response.error.isNullOrBlank()) throw Exception(response.error)
            if (response.success == false) throw Exception(response.message ?: "Refund request failed")
        }

    override suspend fun deleteAndRefundEvent(event: Event): Result<Unit> = runCatching {
        // Server-side operation: create refund requests for event participants.
        api.post<RefundAllRequestDto, RefundResponse>(
            path = "api/billing/refund-all",
            body = RefundAllRequestDto(eventId = event.id),
        )

        eventRepository.deleteEvent(event.id).getOrThrow()
    }

    override suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>> =
        runCatching {
            val currentUserId = userRepository.currentUser.value.getOrThrow().id
            val encoded = currentUserId.encodeURLQueryComponent()

            val serverRefunds = api.get<RefundRequestsResponseDto>("api/refund-requests?hostId=$encoded&limit=200").refunds
            databaseService.getRefundRequestDao.upsertRefundRequests(serverRefunds)

            serverRefunds.forEach { refund ->
                userRepository.getUsers(listOf(refund.userId)).onFailure { e ->
                    Napier.e("Failed to cache user for refund ${refund.id}", e)
                }
                eventRepository.getEvent(refund.eventId).onFailure { e ->
                    Napier.e("Failed to cache event for refund ${refund.id}", e)
                }
            }

            databaseService.getRefundRequestDao.getRefundRequestsWithRelations(currentUserId)
        }

    override suspend fun getRefunds(): Result<List<RefundRequest>> = runCatching {
        val currentUserId = userRepository.currentUser.value.getOrThrow().id
        val encoded = currentUserId.encodeURLQueryComponent()

        val serverRefunds = api.get<RefundRequestsResponseDto>("api/refund-requests?hostId=$encoded&limit=200").refunds
        databaseService.getRefundRequestDao.upsertRefundRequests(serverRefunds)
        serverRefunds
    }

    override suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit> = runCatching {
        api.patch<UpdateRefundRequestDto, RefundRequest>(
            path = "api/refund-requests/${refundRequest.id}",
            body = UpdateRefundRequestDto(status = "APPROVED"),
        )

        databaseService.getRefundRequestDao.deleteRefundRequest(refundRequest.id)
    }

    override suspend fun rejectRefund(refundId: String): Result<Unit> = runCatching {
        api.patch<UpdateRefundRequestDto, RefundRequest>(
            path = "api/refund-requests/$refundId",
            body = UpdateRefundRequestDto(status = "REJECTED"),
        )

        databaseService.getRefundRequestDao.deleteRefundRequest(refundId)
    }
}

@Serializable
private data class StripeOnboardingLinkResponseDto(
    val onboardingUrl: String,
    val expiresAt: Long? = null,
)

@Serializable
data class PurchaseIntent(
    val paymentIntent: String? = null,
    val ephemeralKey: String? = null,
    val customer: String? = null,
    val publishableKey: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val error: String? = null,
)

@Serializable
data class FeeBreakdown(
    val eventPrice: Int,
    val stripeFee: Int,
    val processingFee: Int,
    val totalCharge: Int,
    val hostReceives: Int,
    val feePercentage: Float,
)

@Serializable
@OptIn(ExperimentalTime::class)
data class RefundResponse(
    val refundId: String? = null,
    val success: Boolean? = null,
    val emailSent: Boolean? = null,
    val message: String? = null,
    val amount: Int? = null,
    val reason: String? = null,
    val error: String? = null,
)
