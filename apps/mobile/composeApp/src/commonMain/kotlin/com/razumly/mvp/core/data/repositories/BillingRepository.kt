package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.dataTypes.Subscription
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
import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

interface IBillingRepository : IMVPRepository {
    suspend fun createPurchaseIntent(
        event: Event,
        teamId: String? = null,
    ): Result<PurchaseIntent>
    suspend fun getRequiredSignLinks(eventId: String): Result<List<SignStep>>
    suspend fun recordSignature(
        eventId: String,
        templateId: String,
        documentId: String,
        type: String = "TEXT",
    ): Result<Unit>

    suspend fun createAccount(): Result<String>
    suspend fun getOnboardingLink(): Result<String>
    suspend fun listBills(ownerType: String, ownerId: String, limit: Int = 100): Result<List<Bill>>
    suspend fun getBillPayments(billId: String): Result<List<BillPayment>>
    suspend fun createBillingIntent(billId: String, billPaymentId: String): Result<PurchaseIntent>
    suspend fun listSubscriptions(userId: String, limit: Int = 100): Result<List<Subscription>>
    suspend fun cancelSubscription(subscriptionId: String): Result<Boolean>
    suspend fun restartSubscription(subscriptionId: String): Result<Boolean>
    suspend fun getProductsByIds(productIds: List<String>): Result<List<Product>>
    suspend fun listOrganizations(limit: Int = 100): Result<List<Organization>>
    suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>>
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

    override suspend fun getRequiredSignLinks(eventId: String): Result<List<SignStep>> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val response = api.post<EventSignLinksRequestDto, EventSignLinksResponseDto>(
            path = "api/events/$eventId/sign",
            body = EventSignLinksRequestDto(
                userId = user.id,
                userEmail = email,
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }

        response.signLinks.filter { it.templateId.isNotBlank() }
    }

    override suspend fun recordSignature(
        eventId: String,
        templateId: String,
        documentId: String,
        type: String,
    ): Result<Unit> = runCatching {
        val userId = userRepository.currentUser.value.getOrThrow().id
        val response = api.post<RecordSignatureRequestDto, RecordSignatureResponseDto>(
            path = "api/documents/record-signature",
            body = RecordSignatureRequestDto(
                templateId = templateId,
                documentId = documentId,
                eventId = eventId,
                userId = userId,
                type = type,
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }

        if (response.ok == false) {
            throw Exception("Failed to record signature.")
        }
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

    override suspend fun listBills(ownerType: String, ownerId: String, limit: Int): Result<List<Bill>> =
        runCatching {
            val encodedOwnerType = ownerType.encodeURLQueryComponent()
            val encodedOwnerId = ownerId.encodeURLQueryComponent()
            val response = api.get<BillsResponseDto>(
                path = "api/billing/bills?ownerType=$encodedOwnerType&ownerId=$encodedOwnerId&limit=$limit",
            )
            response.bills.mapNotNull { it.toBillOrNull() }
        }

    override suspend fun getBillPayments(billId: String): Result<List<BillPayment>> = runCatching {
        val encodedBillId = billId.encodeURLQueryComponent()
        val response = api.get<BillPaymentsResponseDto>(path = "api/billing/bills/$encodedBillId/payments")
        response.payments.mapNotNull { it.toBillPaymentOrNull() }
    }

    override suspend fun createBillingIntent(billId: String, billPaymentId: String): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrNull()
        val response = api.post<CreateBillingIntentRequestDto, PurchaseIntent>(
            path = "api/billing/create_billing_intent",
            body = CreateBillingIntentRequestDto(
                billId = billId,
                billPaymentId = billPaymentId,
                user = user?.let { BillingUserRefDto(id = it.id, email = userRepository.currentAccount.value.getOrNull()?.email) },
            ),
        )
        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        response
    }

    override suspend fun listSubscriptions(userId: String, limit: Int): Result<List<Subscription>> = runCatching {
        val encodedUserId = userId.encodeURLQueryComponent()
        val candidatePaths = listOf(
            "api/subscriptions?userId=$encodedUserId&limit=$limit",
            "api/users/$encodedUserId/subscriptions?limit=$limit",
        )

        var lastError: Throwable? = null
        for (path in candidatePaths) {
            val attempt = runCatching { api.get<SubscriptionsResponseDto>(path = path) }
            if (attempt.isSuccess) {
                return@runCatching attempt.getOrThrow().subscriptions.mapNotNull { it.toSubscriptionOrNull() }
            }

            val throwable = attempt.exceptionOrNull()
            if (throwable != null && throwable.isNotFound()) {
                lastError = throwable
                continue
            }

            if (throwable != null) throw throwable
        }

        if (lastError != null) {
            Napier.i("No subscriptions list endpoint available; returning empty memberships.")
        }
        emptyList()
    }

    override suspend fun cancelSubscription(subscriptionId: String): Result<Boolean> = runCatching {
        val encodedId = subscriptionId.encodeURLQueryComponent()
        val result = api.delete<EmptyRequestDto, SubscriptionStatusResponseDto>(
            path = "api/subscriptions/$encodedId",
            body = EmptyRequestDto(),
        )
        if (!result.error.isNullOrBlank()) {
            throw Exception(result.error)
        }
        result.cancelled ?: false
    }

    override suspend fun restartSubscription(subscriptionId: String): Result<Boolean> = runCatching {
        val encodedId = subscriptionId.encodeURLQueryComponent()
        val result = api.patch<EmptyRequestDto, SubscriptionStatusResponseDto>(
            path = "api/subscriptions/$encodedId",
            body = EmptyRequestDto(),
        )
        if (!result.error.isNullOrBlank()) {
            throw Exception(result.error)
        }
        result.restarted ?: false
    }

    override suspend fun getProductsByIds(productIds: List<String>): Result<List<Product>> = runCatching {
        val ids = productIds.distinct().filter(String::isNotBlank)
        if (ids.isEmpty()) return@runCatching emptyList()

        val encodedIds = ids.joinToString(",") { it.encodeURLQueryComponent() }
        val response = api.get<ProductsResponseDto>(path = "api/products?ids=$encodedIds")
        response.products.mapNotNull { it.toProductOrNull() }
    }

    override suspend fun listOrganizations(limit: Int): Result<List<Organization>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 1000)
        val response = api.get<OrganizationsResponseDto>(path = "api/organizations?limit=$normalizedLimit")
        response.organizations.mapNotNull { it.toOrganizationOrNull() }
    }

    override suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> = runCatching {
        val ids = organizationIds.distinct().filter(String::isNotBlank)
        if (ids.isEmpty()) return@runCatching emptyList()

        val encodedIds = ids.joinToString(",") { it.encodeURLQueryComponent() }
        val response = api.get<OrganizationsResponseDto>(path = "api/organizations?ids=$encodedIds&limit=100")
        response.organizations.mapNotNull { it.toOrganizationOrNull() }
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

private fun Throwable.isNotFound(): Boolean {
    return this is ClientRequestException && this.response.status == HttpStatusCode.NotFound
}

@Serializable
private data class StripeOnboardingLinkResponseDto(
    val onboardingUrl: String,
    val expiresAt: Long? = null,
)

@Serializable
private data class EventSignLinksRequestDto(
    val userId: String? = null,
    val userEmail: String? = null,
    val redirectUrl: String? = null,
)

@Serializable
private data class EventSignLinksResponseDto(
    val signLinks: List<SignStep> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class RecordSignatureRequestDto(
    val templateId: String,
    val documentId: String,
    val eventId: String? = null,
    val userId: String? = null,
    val type: String? = null,
)

@Serializable
private data class RecordSignatureResponseDto(
    val ok: Boolean? = null,
    val error: String? = null,
)

@Serializable
private data class EmptyRequestDto(
    val noop: Boolean = true,
)

@Serializable
private data class BillsResponseDto(
    val bills: List<BillApiDto> = emptyList(),
)

@Serializable
private data class BillPaymentsResponseDto(
    val payments: List<BillPaymentApiDto> = emptyList(),
)

@Serializable
private data class SubscriptionsResponseDto(
    val subscriptions: List<SubscriptionApiDto> = emptyList(),
)

@Serializable
private data class ProductsResponseDto(
    val products: List<ProductApiDto> = emptyList(),
)

@Serializable
private data class OrganizationsResponseDto(
    val organizations: List<OrganizationApiDto> = emptyList(),
)

@Serializable
private data class SubscriptionStatusResponseDto(
    val cancelled: Boolean? = null,
    val restarted: Boolean? = null,
    val error: String? = null,
)

@Serializable
private data class CreateBillingIntentRequestDto(
    val billId: String,
    val billPaymentId: String,
    val user: BillingUserRefDto? = null,
)

@Serializable
private data class BillApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val ownerType: String? = null,
    val ownerId: String? = null,
    val organizationId: String? = null,
    val eventId: String? = null,
    val totalAmountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val nextPaymentDue: String? = null,
    val nextPaymentAmountCents: Int? = null,
    val parentBillId: String? = null,
    val allowSplit: Boolean? = null,
    val status: String? = null,
    val paymentPlanEnabled: Boolean? = null,
    val createdBy: String? = null,
) {
    fun toBillOrNull(): Bill? {
        val resolvedId = id ?: legacyId
        val resolvedOwnerType = ownerType
        val resolvedOwnerId = ownerId
        val resolvedTotal = totalAmountCents
        if (resolvedId.isNullOrBlank() || resolvedOwnerType.isNullOrBlank() || resolvedOwnerId.isNullOrBlank() || resolvedTotal == null) {
            return null
        }

        return Bill(
            id = resolvedId,
            ownerType = resolvedOwnerType,
            ownerId = resolvedOwnerId,
            organizationId = organizationId,
            eventId = eventId,
            totalAmountCents = resolvedTotal,
            paidAmountCents = paidAmountCents,
            nextPaymentDue = nextPaymentDue,
            nextPaymentAmountCents = nextPaymentAmountCents,
            parentBillId = parentBillId,
            allowSplit = allowSplit,
            status = status,
            paymentPlanEnabled = paymentPlanEnabled,
            createdBy = createdBy,
        )
    }
}

@Serializable
private data class BillPaymentApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val billId: String? = null,
    val sequence: Int? = null,
    val dueDate: String? = null,
    val amountCents: Int? = null,
    val status: String? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val payerUserId: String? = null,
) {
    fun toBillPaymentOrNull(): BillPayment? {
        val resolvedId = id ?: legacyId
        val resolvedBillId = billId
        val resolvedSequence = sequence
        val resolvedDueDate = dueDate
        val resolvedAmount = amountCents
        if (
            resolvedId.isNullOrBlank() ||
            resolvedBillId.isNullOrBlank() ||
            resolvedSequence == null ||
            resolvedDueDate.isNullOrBlank() ||
            resolvedAmount == null
        ) {
            return null
        }

        return BillPayment(
            id = resolvedId,
            billId = resolvedBillId,
            sequence = resolvedSequence,
            dueDate = resolvedDueDate,
            amountCents = resolvedAmount,
            status = status,
            paidAt = paidAt,
            paymentIntentId = paymentIntentId,
            payerUserId = payerUserId,
        )
    }
}

@Serializable
private data class SubscriptionApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val productId: String? = null,
    val userId: String? = null,
    val organizationId: String? = null,
    val startDate: String? = null,
    val priceCents: Int? = null,
    val period: String? = null,
    val status: String? = null,
    val stripeSubscriptionId: String? = null,
) {
    fun toSubscriptionOrNull(): Subscription? {
        val resolvedId = id ?: legacyId
        val resolvedProductId = productId
        val resolvedUserId = userId
        val resolvedStartDate = startDate
        val resolvedPriceCents = priceCents
        val resolvedPeriod = period
        if (
            resolvedId.isNullOrBlank() ||
            resolvedProductId.isNullOrBlank() ||
            resolvedUserId.isNullOrBlank() ||
            resolvedStartDate.isNullOrBlank() ||
            resolvedPriceCents == null ||
            resolvedPeriod.isNullOrBlank()
        ) {
            return null
        }

        return Subscription(
            id = resolvedId,
            productId = resolvedProductId,
            userId = resolvedUserId,
            organizationId = organizationId,
            startDate = resolvedStartDate,
            priceCents = resolvedPriceCents,
            period = resolvedPeriod,
            status = status,
            stripeSubscriptionId = stripeSubscriptionId,
        )
    }
}

@Serializable
private data class ProductApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val description: String? = null,
    val priceCents: Int? = null,
    val period: String? = null,
    val organizationId: String? = null,
    val createdBy: String? = null,
    val isActive: Boolean? = null,
    val createdAt: String? = null,
    val stripeProductId: String? = null,
    val stripePriceId: String? = null,
) {
    fun toProductOrNull(): Product? {
        val resolvedId = id ?: legacyId
        val resolvedName = name
        val resolvedPrice = priceCents
        val resolvedPeriod = period
        val resolvedOrganizationId = organizationId
        if (
            resolvedId.isNullOrBlank() ||
            resolvedName.isNullOrBlank() ||
            resolvedPrice == null ||
            resolvedPeriod.isNullOrBlank() ||
            resolvedOrganizationId.isNullOrBlank()
        ) {
            return null
        }

        return Product(
            id = resolvedId,
            name = resolvedName,
            description = description,
            priceCents = resolvedPrice,
            period = resolvedPeriod,
            organizationId = resolvedOrganizationId,
            createdBy = createdBy,
            isActive = isActive,
            createdAt = createdAt,
            stripeProductId = stripeProductId,
            stripePriceId = stripePriceId,
        )
    }
}

@Serializable
private data class OrganizationApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val location: String? = null,
    val description: String? = null,
    val logoId: String? = null,
    val ownerId: String? = null,
    val website: String? = null,
    val refIds: List<String>? = null,
    val hasStripeAccount: Boolean? = null,
    val coordinates: List<Double>? = null,
    val fieldIds: List<String>? = null,
    val productIds: List<String>? = null,
) {
    fun toOrganizationOrNull(): Organization? {
        val resolvedId = id ?: legacyId
        val resolvedName = name
        val resolvedOwnerId = ownerId ?: ""
        if (resolvedId.isNullOrBlank() || resolvedName.isNullOrBlank()) {
            return null
        }

        return Organization(
            id = resolvedId,
            name = resolvedName,
            location = location,
            description = description,
            logoId = logoId,
            ownerId = resolvedOwnerId,
            website = website,
            refIds = refIds ?: emptyList(),
            hasStripeAccount = hasStripeAccount ?: false,
            coordinates = coordinates,
            fieldIds = fieldIds ?: emptyList(),
            productIds = productIds ?: emptyList(),
        )
    }
}

@Serializable
data class SignStep(
    val templateId: String,
    val type: String = "TEXT",
    val title: String? = null,
    val content: String? = null,
    val signOnce: Boolean = false,
    val url: String? = null,
    val signingUrl: String? = null,
    val boldSignUrl: String? = null,
    val documentSigningUrl: String? = null,
    val documentId: String? = null,
    @SerialName("documentID") val legacyDocumentId: String? = null,
) {
    fun isTextStep(): Boolean {
        return type.equals("TEXT", ignoreCase = true) || resolvedSigningUrl().isNullOrBlank()
    }

    fun resolvedSigningUrl(): String? = listOf(
        url,
        signingUrl,
        boldSignUrl,
        documentSigningUrl,
    ).firstOrNull { !it.isNullOrBlank() }

    fun resolvedDocumentId(): String? = listOf(
        documentId,
        legacyDocumentId,
    ).firstOrNull { !it.isNullOrBlank() }
}

@Serializable
data class PurchaseIntent(
    val paymentIntent: String? = null,
    val ephemeralKey: String? = null,
    val customer: String? = null,
    val publishableKey: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val boldSignUrl: String? = null,
    val boldsignUrl: String? = null,
    val documentSigningUrl: String? = null,
    val documentSignUrl: String? = null,
    val signingUrl: String? = null,
    val signatureUrl: String? = null,
    val requiresSignature: Boolean? = null,
    val signatureRequired: Boolean? = null,
    val documentSigningRequired: Boolean? = null,
    val documentSigned: Boolean? = null,
    val signatureCompleted: Boolean? = null,
    val signed: Boolean? = null,
    val error: String? = null,
) {
    fun resolvedSigningUrl(): String? = listOf(
        boldSignUrl,
        boldsignUrl,
        documentSigningUrl,
        documentSignUrl,
        signingUrl,
        signatureUrl,
    ).firstOrNull { !it.isNullOrBlank() }

    fun isSignatureRequired(): Boolean {
        return requiresSignature
            ?: signatureRequired
            ?: documentSigningRequired
            ?: !resolvedSigningUrl().isNullOrBlank()
    }

    fun isSignatureCompleted(): Boolean {
        return documentSigned
            ?: signatureCompleted
            ?: signed
            ?: false
    }
}

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
