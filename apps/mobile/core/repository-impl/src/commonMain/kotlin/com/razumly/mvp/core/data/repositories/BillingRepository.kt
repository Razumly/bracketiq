package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.dataTypes.DiscountCodeCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountOfferCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountTargetCacheEntry
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.ManualPaymentProof
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationStaffMember
import com.razumly.mvp.core.data.dataTypes.resolveOrganizationVerificationReviewStatus
import com.razumly.mvp.core.data.dataTypes.resolveOrganizationVerificationStatus
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.ProductTaxCategory
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.stripeRedirectBaseUrl
import com.razumly.mvp.core.network.dto.BillingEventRefDto
import com.razumly.mvp.core.network.dto.BillingAddressDto
import com.razumly.mvp.core.network.dto.BillingRefundRequestDto
import com.razumly.mvp.core.network.dto.BillingTeamRefDto
import com.razumly.mvp.core.network.dto.BillingTimeSlotRefDto
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.PurchaseIntentRequestDto
import com.razumly.mvp.core.network.dto.RefundAllRequestDto
import com.razumly.mvp.core.network.dto.RefundRequestsResponseDto
import com.razumly.mvp.core.network.dto.RegistrationQuestionAnswerDto
import com.razumly.mvp.core.network.dto.StripeHostLinkRequestDto
import com.razumly.mvp.core.network.dto.UpdateRefundRequestDto
import io.github.aakira.napier.Napier
import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private const val BOLD_SIGN_RATE_LIMIT_FRIENDLY_MESSAGE =
    "You opened the BoldSign document too many times. Please wait a minute before trying again."

private fun toFriendlyBoldSignMessage(rawMessage: String?): String? {
    val normalized = rawMessage?.trim()?.takeIf(String::isNotBlank) ?: return null
    val lowercase = normalized.lowercase()
    val looksLikeBoldSignRateLimit = lowercase.contains("boldsign")
        && (
            lowercase.contains("429")
                || lowercase.contains("too many requests")
                || lowercase.contains("rate limit")
            )

    return if (looksLikeBoldSignRateLimit) {
        BOLD_SIGN_RATE_LIMIT_FRIENDLY_MESSAGE
    } else {
        normalized
    }
}

private fun Throwable.withFriendlyBoldSignMessage(): Throwable {
    val friendlyMessage = toFriendlyBoldSignMessage(message) ?: return this
    if (friendlyMessage == message) {
        return this
    }
    return Exception(friendlyMessage, this)
}

private fun Map<String, String>.toRegistrationQuestionAnswerDtos(): List<RegistrationQuestionAnswerDto> =
    mapNotNull { (questionId, answer) ->
        val normalizedQuestionId = questionId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
        RegistrationQuestionAnswerDto(
            questionId = normalizedQuestionId,
            answer = answer,
        )
    }

enum class SignerContext(val apiValue: String) {
    PARTICIPANT("participant"),
    PARENT_GUARDIAN("parent_guardian"),
    CHILD("child"),
}

enum class ProfileDocumentStatus {
    UNSIGNED,
    SIGNED,
}

enum class ProfileDocumentType {
    PDF,
    TEXT,
}

data class ProfileDocumentCard(
    val id: String,
    val status: ProfileDocumentStatus,
    val eventId: String? = null,
    val eventName: String? = null,
    val teamId: String? = null,
    val teamName: String? = null,
    val organizationId: String? = null,
    val organizationName: String,
    val templateId: String,
    val title: String,
    val type: ProfileDocumentType,
    val requiredSignerType: String,
    val requiredSignerLabel: String,
    val signerContext: SignerContext,
    val signerContextLabel: String,
    val childUserId: String? = null,
    val childEmail: String? = null,
    val consentStatus: String? = null,
    val requiresChildEmail: Boolean = false,
    val statusNote: String? = null,
    val signedAt: String? = null,
    val signedDocumentRecordId: String? = null,
    val viewUrl: String? = null,
    val content: String? = null,
)

data class ProfileDocumentsBundle(
    val unsigned: List<ProfileDocumentCard> = emptyList(),
    val signed: List<ProfileDocumentCard> = emptyList(),
)

data class CreateBillRequest(
    val ownerType: String,
    val ownerId: String,
    val totalAmountCents: Int,
    val eventId: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val organizationId: String? = null,
    val installmentAmounts: List<Int> = emptyList(),
    val installmentDueDates: List<String> = emptyList(),
    val installmentDueRelativeDays: List<Int> = emptyList(),
    val allowSplit: Boolean = false,
    val paymentPlanEnabled: Boolean = false,
)

data class EventTeamBillingUserOption(
    val id: String,
    val displayName: String,
)

data class EventTeamBillingLineItem(
    val id: String? = null,
    val type: String? = null,
    val label: String? = null,
    val amountCents: Int? = null,
    val quantity: Int? = null,
)

data class EventTeamBillingPaymentSnapshot(
    val id: String,
    val billId: String,
    val sequence: Int,
    val status: String? = null,
    val amountCents: Int,
    val paidAmountCents: Int? = null,
    val refundedAmountCents: Int,
    val refundableAmountCents: Int,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val isRefundable: Boolean,
    val manualPaymentProofs: List<ManualPaymentProof> = emptyList(),
)

data class EventTeamBillingBillSnapshot(
    val id: String,
    val ownerType: String,
    val ownerId: String,
    val ownerName: String,
    val totalAmountCents: Int,
    val paidAmountCents: Int,
    val originalAmountCents: Int = totalAmountCents,
    val discountAmountCents: Int = 0,
    val discountedAmountCents: Int = totalAmountCents,
    val discounts: List<BillDiscountSummary> = emptyList(),
    val refundedAmountCents: Int,
    val refundableAmountCents: Int,
    val status: String? = null,
    val allowSplit: Boolean? = null,
    val lineItems: List<EventTeamBillingLineItem> = emptyList(),
    val payments: List<EventTeamBillingPaymentSnapshot> = emptyList(),
)

data class EventTeamBillingTotals(
    val paidAmountCents: Int,
    val refundedAmountCents: Int,
    val refundableAmountCents: Int,
)

data class EventTeamBillingSnapshot(
    val teamId: String,
    val teamName: String? = null,
    val playerIds: List<String> = emptyList(),
    val users: List<EventTeamBillingUserOption> = emptyList(),
    val bills: List<EventTeamBillingBillSnapshot> = emptyList(),
    val totals: EventTeamBillingTotals = EventTeamBillingTotals(
        paidAmountCents = 0,
        refundedAmountCents = 0,
        refundableAmountCents = 0,
    ),
)

data class EventTeamBillCreateRequest(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val allowSplit: Boolean = false,
    val label: String? = null,
)

data class EventTeamPaymentCheckoutRequest(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val divisionId: String? = null,
    val label: String? = null,
)

data class EventTeamPaymentCheckout(
    val checkoutUrl: String,
    val qrCodeUrl: String,
    val amountCents: Int,
    val eventAmountCents: Int,
    val billOwnerType: String,
    val billOwnerId: String,
    val payerUserId: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val checkoutSessionId: String? = null,
)

data class PurchaseIntentTimeSlotContext(
    val id: String? = null,
    val priceCents: Int? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
)

@Serializable
data class RentalOrderSelectionRequest(
    val key: String? = null,
    val scheduledFieldIds: List<String>,
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int> = emptyList(),
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val endDate: String,
    val timeZone: String? = null,
    val repeating: Boolean = false,
)

data class RentalOrderItem(
    val id: String,
    val fieldId: String,
    val start: String,
    val end: String,
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
)

data class RentalOrderResult(
    val bookingId: String,
    val billId: String? = null,
    val eventId: String? = null,
    val totalCents: Int,
    val items: List<RentalOrderItem> = emptyList(),
    val createEventUrl: String? = null,
)

data class RentalResourceOption(
    val id: String,
    val bookingId: String,
    val bookingItemId: String,
    val organizationId: String,
    val organizationName: String? = null,
    val renterOrganizationId: String? = null,
    val field: Field,
    val start: Instant,
    val end: Instant,
    val timeZone: String,
    val priceCents: Int,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
)

data class RecordSignatureResult(
    val operationId: String? = null,
    val syncStatus: String? = null,
)

data class BoldSignOperationStatus(
    val operationId: String,
    val operationType: String? = null,
    val status: String,
    val error: String? = null,
    val templateDocumentId: String? = null,
    val signedDocumentRecordId: String? = null,
    val templateId: String? = null,
    val documentId: String? = null,
    val updatedAt: String? = null,
) {
    fun isConfirmed(): Boolean = status.trim().equals("CONFIRMED", ignoreCase = true)

    fun isFailed(): Boolean {
        val normalized = status.trim().uppercase()
        return normalized == "FAILED" || normalized == "FAILED_RETRYABLE" || normalized == "TIMED_OUT"
    }
}

data class DiscountCode(
    val id: String,
    val discountId: String,
    val code: String,
    val usageLimit: Int? = null,
    val usedCount: Int = 0,
    val status: String = "ACTIVE",
)

data class DiscountOffer(
    val id: String,
    val ownerType: String,
    val ownerId: String,
    val name: String,
    val description: String? = null,
    val status: String = "ACTIVE",
    val targetType: String,
    val targetId: String,
    val originalPriceCents: Int,
    val discountedPriceCents: Int,
    val codes: List<DiscountCode> = emptyList(),
)

data class DiscountTarget(
    val id: String,
    val label: String,
    val description: String? = null,
    val priceCents: Int,
    val itemType: String,
    val targetType: String,
)

private fun DiscountOffer.toCacheEntry(): DiscountOfferCacheEntry = DiscountOfferCacheEntry(
    id = id,
    ownerType = ownerType,
    ownerId = ownerId,
    name = name,
    description = description,
    status = status,
    targetType = targetType,
    targetId = targetId,
    originalPriceCents = originalPriceCents,
    discountedPriceCents = discountedPriceCents,
)

private fun DiscountOfferCacheEntry.toDiscountOffer(codes: List<DiscountCodeCacheEntry>): DiscountOffer =
    DiscountOffer(
        id = id,
        ownerType = ownerType,
        ownerId = ownerId,
        name = name,
        description = description,
        status = status,
        targetType = targetType,
        targetId = targetId,
        originalPriceCents = originalPriceCents,
        discountedPriceCents = discountedPriceCents,
        codes = codes.map(DiscountCodeCacheEntry::toDiscountCode),
    )

private fun DiscountCode.toCacheEntry(): DiscountCodeCacheEntry = DiscountCodeCacheEntry(
    id = id,
    discountId = discountId,
    code = code,
    usageLimit = usageLimit,
    usedCount = usedCount,
    status = status,
)

private fun DiscountCodeCacheEntry.toDiscountCode(): DiscountCode = DiscountCode(
    id = id,
    discountId = discountId,
    code = code,
    usageLimit = usageLimit,
    usedCount = usedCount,
    status = status,
)

private fun DiscountTarget.toCacheEntry(ownerType: String, ownerIdKey: String): DiscountTargetCacheEntry =
    DiscountTargetCacheEntry(
        cacheKey = discountTargetCacheKey(ownerType, ownerIdKey, itemType, id),
        ownerType = ownerType,
        ownerIdKey = ownerIdKey,
        itemType = itemType.trim().uppercase().ifBlank { "EVENT" },
        id = id,
        label = label,
        description = description,
        priceCents = priceCents,
        targetType = targetType,
    )

private fun DiscountTargetCacheEntry.toDiscountTarget(): DiscountTarget = DiscountTarget(
    id = id,
    label = label,
    description = description,
    priceCents = priceCents,
    itemType = itemType,
    targetType = targetType,
)

private fun String?.ownerIdKey(): String = this?.trim()?.takeIf(String::isNotBlank).orEmpty()

private fun discountTargetCacheKey(ownerType: String, ownerIdKey: String, itemType: String, targetId: String): String =
    listOf(ownerType.trim().uppercase(), ownerIdKey, itemType.trim().uppercase(), targetId).joinToString("|")

interface IBillingRepository : IMVPRepository {
    suspend fun previewEventRegistrationDiscount(
        event: Event,
        teamId: String? = null,
        priceCents: Int? = null,
        occurrence: EventOccurrenceSelection? = null,
        divisionId: String? = null,
        discountCode: String,
    ): Result<DiscountPreview> = Result.failure(UnsupportedOperationException("Discount preview is not supported."))
    suspend fun createPurchaseIntent(
        event: Event,
        teamId: String? = null,
        priceCents: Int? = null,
        timeSlotContext: PurchaseIntentTimeSlotContext? = null,
        occurrence: EventOccurrenceSelection? = null,
        divisionId: String? = null,
        discountCode: String? = null,
    ): Result<PurchaseIntent>
    suspend fun createPurchaseIntent(
        event: Event,
        teamId: String? = null,
        priceCents: Int? = null,
        timeSlotContext: PurchaseIntentTimeSlotContext? = null,
        occurrence: EventOccurrenceSelection? = null,
        divisionId: String? = null,
        answers: Map<String, String>,
        discountCode: String? = null,
    ): Result<PurchaseIntent> = createPurchaseIntent(
        event = event,
        teamId = teamId,
        priceCents = priceCents,
        timeSlotContext = timeSlotContext,
        occurrence = occurrence,
        divisionId = divisionId,
        discountCode = discountCode,
    )
    suspend fun createTeamRegistrationPurchaseIntent(
        team: Team,
        teamRegistration: TeamPlayerRegistration? = null,
        discountCode: String? = null,
    ): Result<PurchaseIntent>
    suspend fun getRequiredSignLinks(eventId: String): Result<List<SignStep>>
    suspend fun getRequiredSignLinks(
        eventId: String,
        signerContext: SignerContext,
        childUserId: String? = null,
        childUserEmail: String? = null,
    ): Result<List<SignStep>> = getRequiredSignLinks(eventId)
    suspend fun getRequiredTeamSignLinks(teamId: String): Result<List<SignStep>>
    suspend fun getRequiredTeamSignLinks(
        teamId: String,
        signerContext: SignerContext,
        childUserId: String? = null,
        childUserEmail: String? = null,
    ): Result<List<SignStep>> = getRequiredTeamSignLinks(teamId)
    suspend fun getRequiredRentalSignLinks(
        templateIds: List<String>,
        eventId: String? = null,
        organizationId: String? = null,
    ): Result<List<SignStep>>
    suspend fun createRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String? = null,
        renterOrganizationId: String? = null,
        sportId: String? = null,
    ): Result<RentalOrderResult> = Result.failure(UnsupportedOperationException("Rental orders are not supported."))
    suspend fun listRentalResourceOptions(
        eventId: String? = null,
        organizationId: String? = null,
    ): Result<List<RentalResourceOption>> = Result.success(emptyList())
    suspend fun recordSignature(
        eventId: String,
        templateId: String,
        documentId: String,
        type: String = "TEXT",
        signerContext: SignerContext = SignerContext.PARTICIPANT,
        childUserId: String? = null,
    ): Result<RecordSignatureResult>
    suspend fun recordTeamSignature(
        teamId: String,
        templateId: String,
        documentId: String,
        type: String = "TEXT",
        signerContext: SignerContext = SignerContext.PARTICIPANT,
        childUserId: String? = null,
    ): Result<RecordSignatureResult>
    suspend fun pollBoldSignOperation(
        operationId: String,
        timeoutMillis: Long = 120_000,
        intervalMillis: Long = 5_000,
    ): Result<BoldSignOperationStatus>

    suspend fun createAccount(): Result<String>
    suspend fun getOnboardingLink(): Result<String>
    suspend fun listBills(ownerType: String, ownerId: String, limit: Int = 100): Result<List<Bill>>
    suspend fun createBill(request: CreateBillRequest): Result<Bill>
    suspend fun getBillPayments(billId: String): Result<List<BillPayment>>
    suspend fun getEventTeamBillingSnapshot(eventId: String, teamId: String): Result<EventTeamBillingSnapshot>
    suspend fun createEventTeamBill(
        eventId: String,
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Bill>
    suspend fun createEventTeamPaymentCheckout(
        eventId: String,
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout>
    suspend fun refundEventTeamBillPayment(
        eventId: String,
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit>
    suspend fun createBillingIntent(billId: String, billPaymentId: String): Result<PurchaseIntent>
    suspend fun markBillingPaymentProcessing(
        billId: String,
        billPaymentId: String,
        paymentIntent: String,
    ): Result<Bill>
    suspend fun cancelBillPayment(billId: String, billPaymentId: String): Result<Bill>
    suspend fun submitManualPaymentProof(
        billId: String,
        billPaymentId: String,
        fileId: String,
    ): Result<ManualPaymentProof>
    suspend fun reviewManualPaymentProof(
        billId: String,
        billPaymentId: String,
        proofId: String,
        decision: String,
        amountAcceptedCents: Int? = null,
        reviewNote: String? = null,
    ): Result<Bill>
    suspend fun getBillingAddress(): Result<BillingAddressProfile>
    suspend fun updateBillingAddress(address: BillingAddressDraft): Result<BillingAddressProfile>
    suspend fun listSubscriptions(userId: String, limit: Int = 100): Result<List<Subscription>>
    suspend fun cancelSubscription(subscriptionId: String): Result<Boolean>
    suspend fun restartSubscription(subscriptionId: String): Result<Boolean>
    suspend fun getProductsByIds(productIds: List<String>): Result<List<Product>>
    suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>>
    suspend fun createProductPurchaseIntent(productId: String): Result<PurchaseIntent>
    suspend fun createProductPurchaseIntent(productId: String, discountCode: String?): Result<PurchaseIntent> =
        createProductPurchaseIntent(productId)
    suspend fun createProductSubscriptionIntent(productId: String): Result<PurchaseIntent>
    suspend fun createProductSubscriptionIntent(productId: String, discountCode: String?): Result<PurchaseIntent> =
        createProductSubscriptionIntent(productId)
    fun observeDiscounts(ownerType: String = "USER", ownerId: String? = null): Flow<List<DiscountOffer>> =
        flowOf(emptyList())
    suspend fun listDiscounts(ownerType: String = "USER", ownerId: String? = null): Result<List<DiscountOffer>>
    fun observeDiscountTargets(
        ownerType: String = "USER",
        ownerId: String? = null,
        itemType: String,
    ): Flow<List<DiscountTarget>> = flowOf(emptyList())
    suspend fun listDiscountTargets(
        ownerType: String = "USER",
        ownerId: String? = null,
        itemType: String,
        query: String? = null,
    ): Result<List<DiscountTarget>>
    suspend fun createDiscount(
        ownerType: String = "USER",
        ownerId: String? = null,
        name: String,
        description: String? = null,
        targetType: String,
        targetId: String,
        discountedPriceCents: Int,
    ): Result<DiscountOffer>
    suspend fun generateDiscountCode(
        discountId: String,
        code: String? = null,
        usageLimit: Int? = null,
    ): Result<DiscountCode>
    suspend fun updateDiscountCodeStatus(
        discountId: String,
        codeId: String,
        status: String,
    ): Result<DiscountCode>
    suspend fun deleteDiscountCode(
        discountId: String,
        codeId: String,
    ): Result<Unit>
    suspend fun createProductSubscription(
        productId: String,
        organizationId: String? = null,
        priceCents: Int? = null,
        startDate: String? = null,
    ): Result<Subscription>
    suspend fun listOrganizations(limit: Int = 100): Result<List<Organization>>
    suspend fun searchOrganizations(query: String, limit: Int = 10): Result<List<Organization>> =
        listOrganizations(limit = limit)
    suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>>
    suspend fun listOrganizationTemplates(organizationId: String): Result<List<OrganizationTemplateDocument>>
    suspend fun leaveAndRefundEvent(event: Event, reason: String, targetUserId: String? = null): Result<Unit>
    suspend fun deleteAndRefundEvent(event: Event): Result<Unit>
    suspend fun listProfileDocuments(): Result<ProfileDocumentsBundle>

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
    suspend fun createTeamRegistrationPurchaseIntent(team: Team): Result<PurchaseIntent> =
        createTeamRegistrationPurchaseIntent(team, null)

    override suspend fun createPurchaseIntent(
        event: Event,
        teamId: String?,
        priceCents: Int?,
        timeSlotContext: PurchaseIntentTimeSlotContext?,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        discountCode: String?,
    ): Result<PurchaseIntent> = createPurchaseIntent(
        event = event,
        teamId = teamId,
        priceCents = priceCents,
        timeSlotContext = timeSlotContext,
        occurrence = occurrence,
        divisionId = divisionId,
        answers = emptyMap(),
        discountCode = discountCode,
    )

    override suspend fun createPurchaseIntent(
        event: Event,
        teamId: String?,
        priceCents: Int?,
        timeSlotContext: PurchaseIntentTimeSlotContext?,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        answers: Map<String, String>,
        discountCode: String?,
    ): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val effectivePriceCents = (priceCents ?: timeSlotContext?.priceCents)
            ?.takeIf { value -> value >= 0 }
            ?: throw IllegalArgumentException("Set a price for this division before checkout.")
        val normalizedTeamId = teamId
            ?.trim()
            ?.takeIf(String::isNotBlank)
        val normalizedDivisionId = divisionId
            ?.trim()
            ?.takeIf(String::isNotBlank)

        val response = api.post<PurchaseIntentRequestDto, PurchaseIntent>(
            path = "api/billing/purchase-intent",
            body = PurchaseIntentRequestDto(
                user = BillingUserRefDto(id = user.id, email = email),
                event = BillingEventRefDto(
                    id = event.id,
                    eventType = event.eventType.name,
                    priceCents = effectivePriceCents,
                    hostId = event.hostId,
                    organizationId = event.organizationId,
                ),
                team = normalizedTeamId?.let { BillingTeamRefDto(id = it) },
                divisionId = normalizedDivisionId,
                timeSlot = timeSlotContext?.let { context ->
                    val normalizedScheduledFieldIds = context.scheduledFieldIds
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .distinct()
                    val normalizedScheduledFieldId = context.scheduledFieldId
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                        ?: normalizedScheduledFieldIds.firstOrNull()
                    BillingTimeSlotRefDto(
                        id = context.id?.trim()?.takeIf(String::isNotBlank),
                        priceCents = context.priceCents,
                        startDate = context.startDate?.trim()?.takeIf(String::isNotBlank),
                        endDate = context.endDate?.trim()?.takeIf(String::isNotBlank),
                        scheduledFieldId = normalizedScheduledFieldId,
                        scheduledFieldIds = normalizedScheduledFieldIds,
                        hostRequiredTemplateIds = context.hostRequiredTemplateIds
                            .map(String::trim)
                            .filter(String::isNotBlank)
                            .distinct(),
                    )
                },
                slotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                discountCode = discountCode?.trim()?.takeIf(String::isNotBlank),
                answers = answers.toRegistrationQuestionAnswerDtos(),
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            buildMap {
                put("checkout_type", timeSlotContext?.let { "rental" } ?: "event_registration")
                put("event_id", event.id)
                put("event_type", event.eventType.name)
                put("amount_cents", effectivePriceCents.toString())
                normalizedTeamId?.let { put("team_id", it) }
                normalizedDivisionId?.let { put("division_id", it) }
                event.organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
            },
        )
        response
    }

    override suspend fun previewEventRegistrationDiscount(
        event: Event,
        teamId: String?,
        priceCents: Int?,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        discountCode: String,
    ): Result<DiscountPreview> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val effectivePriceCents = priceCents
            ?.takeIf { value -> value >= 0 }
            ?: throw IllegalArgumentException("Set a price for this division before previewing a discount.")
        val normalizedCode = discountCode.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("Enter a discount code to apply.")
        val normalizedTeamId = teamId
            ?.trim()
            ?.takeIf(String::isNotBlank)
        val normalizedDivisionId = divisionId
            ?.trim()
            ?.takeIf(String::isNotBlank)

        val response = api.post<PurchaseIntentRequestDto, DiscountPreview>(
            path = "api/billing/discount-preview",
            body = PurchaseIntentRequestDto(
                user = BillingUserRefDto(id = user.id, email = email),
                event = BillingEventRefDto(
                    id = event.id,
                    eventType = event.eventType.name,
                    priceCents = effectivePriceCents,
                    hostId = event.hostId,
                    organizationId = event.organizationId,
                ),
                team = normalizedTeamId?.let { BillingTeamRefDto(id = it) },
                divisionId = normalizedDivisionId,
                slotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                discountCode = normalizedCode,
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        response
    }

    override suspend fun createTeamRegistrationPurchaseIntent(
        team: Team,
        teamRegistration: TeamPlayerRegistration?,
        discountCode: String?,
    ): Result<PurchaseIntent> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val normalizedTeamId = team.id.trim().takeIf(String::isNotBlank)
            ?: error("Team id is required for registration checkout.")

        val response = api.post<PurchaseIntentRequestDto, PurchaseIntent>(
            path = "api/billing/purchase-intent",
            body = PurchaseIntentRequestDto(
                purchaseType = "team_registration",
                user = BillingUserRefDto(id = user.id, email = email),
                team = BillingTeamRefDto(
                    id = normalizedTeamId,
                    name = team.name,
                ),
                teamRegistration = teamRegistration
                    ?.toTeamRegistrationCheckoutTarget(normalizedTeamId)
                    ?: BillingTeamRefDto(teamId = normalizedTeamId),
                discountCode = discountCode?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            mapOf(
                "checkout_type" to "team_registration",
                "team_id" to normalizedTeamId,
            ),
        )
        response
    }

    override suspend fun getRequiredSignLinks(eventId: String): Result<List<SignStep>> {
        return getRequiredSignLinks(
            eventId = eventId,
            signerContext = SignerContext.PARTICIPANT,
            childUserId = null,
            childUserEmail = null,
        )
    }

    override suspend fun getRequiredSignLinks(
        eventId: String,
        signerContext: SignerContext,
        childUserId: String?,
        childUserEmail: String?,
    ): Result<List<SignStep>> = runCatching {
        try {
            val user = userRepository.currentUser.value.getOrThrow()
            val email = userRepository.currentAccount.value.getOrNull()?.email
            val response = api.post<EventSignLinksRequestDto, EventSignLinksResponseDto>(
                path = "api/events/$eventId/sign",
                body = EventSignLinksRequestDto(
                    userId = user.id,
                    userEmail = email,
                    signerContext = signerContext.apiValue,
                    childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
                    childEmail = childUserEmail?.trim()?.takeIf(String::isNotBlank),
                    redirectUrl = buildEmbeddedSigningRedirectUrl(eventId),
                ),
            )

            response.error
                ?.let(::toFriendlyBoldSignMessage)
                ?.takeIf(String::isNotBlank)
                ?.let { errorMessage ->
                    throw Exception(errorMessage)
                }

            response.signLinks.filter { it.templateId.isNotBlank() }
        } catch (throwable: Throwable) {
            throw throwable.withFriendlyBoldSignMessage()
        }
    }

    override suspend fun getRequiredTeamSignLinks(teamId: String): Result<List<SignStep>> {
        return getRequiredTeamSignLinks(
            teamId = teamId,
            signerContext = SignerContext.PARTICIPANT,
            childUserId = null,
            childUserEmail = null,
        )
    }

    override suspend fun getRequiredTeamSignLinks(
        teamId: String,
        signerContext: SignerContext,
        childUserId: String?,
        childUserEmail: String?,
    ): Result<List<SignStep>> = runCatching {
        try {
            val user = userRepository.currentUser.value.getOrThrow()
            val email = userRepository.currentAccount.value.getOrNull()?.email
            val response = api.post<EventSignLinksRequestDto, EventSignLinksResponseDto>(
                path = "api/teams/$teamId/sign",
                body = EventSignLinksRequestDto(
                    userId = user.id,
                    userEmail = email,
                    signerContext = signerContext.apiValue,
                    childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
                    childEmail = childUserEmail?.trim()?.takeIf(String::isNotBlank),
                    redirectUrl = null,
                ),
            )

            response.error
                ?.let(::toFriendlyBoldSignMessage)
                ?.takeIf(String::isNotBlank)
                ?.let { errorMessage ->
                    throw Exception(errorMessage)
                }

            response.signLinks.filter { it.templateId.isNotBlank() }
        } catch (throwable: Throwable) {
            throw throwable.withFriendlyBoldSignMessage()
        }
    }

    override suspend fun getRequiredRentalSignLinks(
        templateIds: List<String>,
        eventId: String?,
        organizationId: String?,
    ): Result<List<SignStep>> = runCatching {
        val normalizedTemplateIds = templateIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        if (normalizedTemplateIds.isEmpty()) {
            return@runCatching emptyList()
        }

        try {
            val user = userRepository.currentUser.value.getOrThrow()
            val email = userRepository.currentAccount.value.getOrNull()?.email
            val normalizedEventId = eventId?.trim()?.takeIf(String::isNotBlank)
            val response = api.post<RentalSignLinksRequestDto, EventSignLinksResponseDto>(
                path = "api/rentals/sign",
                body = RentalSignLinksRequestDto(
                    userId = user.id,
                    userEmail = email,
                    eventId = normalizedEventId,
                    organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
                    templateIds = normalizedTemplateIds,
                    redirectUrl = normalizedEventId?.let(::buildEmbeddedSigningRedirectUrl),
                ),
            )

            response.error
                ?.let(::toFriendlyBoldSignMessage)
                ?.takeIf(String::isNotBlank)
                ?.let { errorMessage ->
                    throw Exception(errorMessage)
                }

            response.signLinks.filter { it.templateId.isNotBlank() }
        } catch (throwable: Throwable) {
            throw throwable.withFriendlyBoldSignMessage()
        }
    }

    override suspend fun createRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String?,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<RentalOrderResult> = runCatching {
        val normalizedSlug = publicSlug.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("This organization needs a public rental checkout before resources can be reserved.")
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("Rental booking id is required.")
        val normalizedSelections = selections
            .mapNotNull { selection ->
                val fieldIds = selection.scheduledFieldIds
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinct()
                if (fieldIds.isEmpty()) return@mapNotNull null
                selection.copy(
                    key = selection.key?.trim()?.takeIf(String::isNotBlank),
                    scheduledFieldIds = fieldIds,
                    daysOfWeek = selection.daysOfWeek.distinct(),
                    timeZone = selection.timeZone?.trim()?.takeIf(String::isNotBlank),
                )
            }
        if (normalizedSelections.isEmpty()) {
            throw IllegalArgumentException("Select at least one rental slot.")
        }

        val response = api.post<CreateRentalOrderRequestDto, RentalOrderResponseDto>(
            path = "api/public/organizations/${normalizedSlug.encodeURLQueryComponent()}/rental-orders",
            body = CreateRentalOrderRequestDto(
                eventId = normalizedEventId,
                selections = normalizedSelections,
                sportId = sportId?.trim()?.takeIf(String::isNotBlank),
                paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
                renterOrganizationId = renterOrganizationId?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        response.error?.trim()?.takeIf(String::isNotBlank)?.let { errorMessage ->
            throw Exception(errorMessage)
        }
        response.toRentalOrderResultOrNull()
            ?: throw Exception("Unable to create rental order.")
    }

    override suspend fun listRentalResourceOptions(
        eventId: String?,
        organizationId: String?,
    ): Result<List<RentalResourceOption>> = runCatching {
        val query = buildList {
            eventId?.trim()?.takeIf(String::isNotBlank)?.let { id ->
                add("eventId=${id.encodeURLQueryComponent()}")
            }
            organizationId?.trim()?.takeIf(String::isNotBlank)?.let { id ->
                add("organizationId=${id.encodeURLQueryComponent()}")
            }
        }.joinToString("&")
        val path = if (query.isBlank()) {
            "api/rentals/bookings"
        } else {
            "api/rentals/bookings?$query"
        }
        api.get<RentalBookingsResponseDto>(path).toRentalResourceOptions()
    }

    override suspend fun recordSignature(
        eventId: String,
        templateId: String,
        documentId: String,
        type: String,
        signerContext: SignerContext,
        childUserId: String?,
    ): Result<RecordSignatureResult> = runCatching {
        val userId = userRepository.currentUser.value.getOrThrow().id
        val response = api.post<RecordSignatureRequestDto, RecordSignatureResponseDto>(
            path = "api/documents/record-signature",
            body = RecordSignatureRequestDto(
                templateId = templateId,
                documentId = documentId,
                eventId = eventId,
                userId = userId,
                type = type,
                signerContext = signerContext.apiValue,
                childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }

        if (response.ok == false) {
            throw Exception("Failed to record signature.")
        }

        RecordSignatureResult(
            operationId = response.operationId?.trim()?.takeIf(String::isNotBlank),
            syncStatus = response.syncStatus?.trim()?.takeIf(String::isNotBlank),
        )
    }

    override suspend fun recordTeamSignature(
        teamId: String,
        templateId: String,
        documentId: String,
        type: String,
        signerContext: SignerContext,
        childUserId: String?,
    ): Result<RecordSignatureResult> = runCatching {
        val userId = userRepository.currentUser.value.getOrThrow().id
        val response = api.post<RecordSignatureRequestDto, RecordSignatureResponseDto>(
            path = "api/documents/record-signature",
            body = RecordSignatureRequestDto(
                templateId = templateId,
                documentId = documentId,
                teamId = teamId,
                userId = userId,
                type = type,
                signerContext = signerContext.apiValue,
                childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }

        if (response.ok == false) {
            throw Exception("Failed to record signature.")
        }

        RecordSignatureResult(
            operationId = response.operationId?.trim()?.takeIf(String::isNotBlank),
            syncStatus = response.syncStatus?.trim()?.takeIf(String::isNotBlank),
        )
    }

    override suspend fun pollBoldSignOperation(
        operationId: String,
        timeoutMillis: Long,
        intervalMillis: Long,
    ): Result<BoldSignOperationStatus> = runCatching {
        val normalizedOperationId = operationId.trim()
        require(normalizedOperationId.isNotBlank()) { "Operation id is required." }

        val effectiveTimeoutMillis = timeoutMillis.coerceAtLeast(1_000)
        val baseIntervalMillis = intervalMillis.coerceIn(2_000, 30_000)
        val startedAt = kotlin.time.Clock.System.now().toEpochMilliseconds()
        var lastStatus: BoldSignOperationStatus? = null
        var currentIntervalMillis = baseIntervalMillis
        var attempt = 0

        while (kotlin.time.Clock.System.now().toEpochMilliseconds() - startedAt <= effectiveTimeoutMillis) {
            if (attempt > 0) {
                delay(currentIntervalMillis)
            }

            val dto = api.get<BoldSignOperationStatusDto>(
                path = "api/boldsign/operations/${normalizedOperationId.encodeURLQueryComponent()}",
            )
            val mapped = dto.toOperationStatus()
            lastStatus = mapped

            if (mapped.isConfirmed()) {
                return@runCatching mapped
            }
            if (mapped.isFailed()) {
                val failureMessage = toFriendlyBoldSignMessage(mapped.error)
                    ?: "Document synchronization failed (${mapped.status})."
                throw Exception(failureMessage)
            }
            attempt += 1
            currentIntervalMillis = (currentIntervalMillis + baseIntervalMillis).coerceAtMost(30_000)
        }

        if (lastStatus != null) {
            val delayedMessage = toFriendlyBoldSignMessage(lastStatus.error)
                ?: "Document synchronization is delayed. Please try again shortly."
            throw Exception(delayedMessage)
        }
        throw Exception("Document synchronization is delayed. Please try again shortly.")
    }

    override suspend fun listProfileDocuments(): Result<ProfileDocumentsBundle> = runCatching {
        val response = api.get<ProfileDocumentsResponseDto>("api/profile/documents")
        response.error?.takeIf(String::isNotBlank)?.let { errorMessage ->
            throw Exception(errorMessage)
        }

        ProfileDocumentsBundle(
            unsigned = response.unsigned.mapNotNull { document ->
                document.toProfileDocumentCardOrNull(defaultStatus = ProfileDocumentStatus.UNSIGNED)
            },
            signed = response.signed.mapNotNull { document ->
                document.toProfileDocumentCardOrNull(defaultStatus = ProfileDocumentStatus.SIGNED)
            },
        )
    }

    override suspend fun createAccount(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val redirectBase = stripeRedirectBaseUrl.trimEnd('/')
        Napier.i(
            "Stripe host request: endpoint=/api/billing/host/connect redirectBase=$redirectBase userId=${user.id}",
            tag = "Stripe",
        )

        val onboardingUrl = api.post<StripeHostLinkRequestDto, StripeOnboardingLinkResponseDto>(
            path = "api/billing/host/connect",
            body = StripeHostLinkRequestDto(
                refreshUrl = redirectBase,
                returnUrl = redirectBase,
                user = BillingUserRefDto(id = user.id, email = email),
            ),
        ).onboardingUrl
        Napier.i("Stripe host response: endpoint=/api/billing/host/connect onboardingUrl=$onboardingUrl", tag = "Stripe")

        // Server may update `hasStripeAccount`; refresh local user/profile cache.
        runCatching { userRepository.getCurrentAccount().getOrThrow() }

        onboardingUrl
    }

    override suspend fun getOnboardingLink(): Result<String> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email
        val redirectBase = stripeRedirectBaseUrl.trimEnd('/')
        Napier.i(
            "Stripe host request: endpoint=/api/billing/host/onboarding-link redirectBase=$redirectBase userId=${user.id}",
            tag = "Stripe",
        )

        api.post<StripeHostLinkRequestDto, StripeOnboardingLinkResponseDto>(
            path = "api/billing/host/onboarding-link",
            body = StripeHostLinkRequestDto(
                refreshUrl = redirectBase,
                returnUrl = redirectBase,
                user = BillingUserRefDto(id = user.id, email = email),
            ),
        ).onboardingUrl.also { onboardingUrl ->
            Napier.i(
                "Stripe host response: endpoint=/api/billing/host/onboarding-link onboardingUrl=$onboardingUrl",
                tag = "Stripe",
            )
        }
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

    override suspend fun createBill(request: CreateBillRequest): Result<Bill> = runCatching {
        val ownerType = request.ownerType.trim().uppercase()
        if (ownerType != "USER" && ownerType != "TEAM") {
            throw IllegalArgumentException("Bill ownerType must be USER or TEAM.")
        }

        val ownerId = request.ownerId.trim()
        if (ownerId.isEmpty()) {
            throw IllegalArgumentException("Bill ownerId is required.")
        }

        if (request.totalAmountCents <= 0) {
            throw IllegalArgumentException("Bill totalAmountCents must be greater than 0.")
        }

        val currentUser = userRepository.currentUser.value.getOrNull()
        val currentAccount = userRepository.currentAccount.value.getOrNull()
        val response = api.post<CreateBillRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills",
            body = CreateBillRequestDto(
                ownerType = ownerType,
                ownerId = ownerId,
                totalAmountCents = request.totalAmountCents,
                eventId = request.eventId?.trim()?.takeIf(String::isNotBlank),
                slotId = request.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = request.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                organizationId = request.organizationId?.trim()?.takeIf(String::isNotBlank),
                installmentAmounts = request.installmentAmounts.takeIf { it.isNotEmpty() },
                installmentDueDates = request.installmentDueDates.takeIf { it.isNotEmpty() },
                installmentDueRelativeDays = request.installmentDueRelativeDays.takeIf { it.isNotEmpty() },
                allowSplit = request.allowSplit,
                paymentPlanEnabled = request.paymentPlanEnabled,
                event = request.eventId?.trim()?.takeIf(String::isNotBlank)?.let { eventId ->
                    BillingEventRefDto(
                        id = eventId,
                        legacyId = eventId,
                        priceCents = request.totalAmountCents,
                        organizationId = request.organizationId?.trim()?.takeIf(String::isNotBlank),
                    )
                },
                user = currentUser?.let { user ->
                    BillingUserRefDto(
                        id = user.id,
                        legacyId = user.id,
                        email = currentAccount?.email,
                    )
                },
            ),
        )

        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: error("Create bill response missing bill")
    }

    override suspend fun getBillPayments(billId: String): Result<List<BillPayment>> = runCatching {
        val encodedBillId = billId.encodeURLQueryComponent()
        val response = api.get<BillPaymentsResponseDto>(path = "api/billing/bills/$encodedBillId/payments")
        response.payments.mapNotNull { it.toBillPaymentOrNull() }
    }

    override suspend fun getEventTeamBillingSnapshot(
        eventId: String,
        teamId: String,
    ): Result<EventTeamBillingSnapshot> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.get<EventTeamBillingSnapshotResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing",
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.toSnapshotOrNull() ?: error("Billing snapshot response missing required fields")
    }

    override suspend fun createEventTeamBill(
        eventId: String,
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Bill> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }

        val ownerType = request.ownerType.trim().uppercase()
        if (ownerType != "USER" && ownerType != "TEAM") {
            throw IllegalArgumentException("Bill ownerType must be USER or TEAM.")
        }

        val ownerId = request.ownerId?.trim()?.takeIf(String::isNotBlank)
        if (ownerType == "USER" && ownerId == null) {
            throw IllegalArgumentException("ownerId is required for USER bills.")
        }
        if (request.eventAmountCents <= 0) {
            throw IllegalArgumentException("eventAmountCents must be greater than 0.")
        }
        if (request.taxAmountCents < 0) {
            throw IllegalArgumentException("taxAmountCents must be zero or greater.")
        }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.post<EventTeamBillCreateRequestDto, CreateBillResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing/bills",
            body = EventTeamBillCreateRequestDto(
                ownerType = ownerType,
                ownerId = ownerId,
                eventAmountCents = request.eventAmountCents,
                taxAmountCents = request.taxAmountCents,
                allowSplit = request.allowSplit,
                label = request.label?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: error("Create team bill response missing bill")
    }

    override suspend fun createEventTeamPaymentCheckout(
        eventId: String,
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }

        val ownerType = request.ownerType.trim().uppercase()
        if (ownerType != "USER" && ownerType != "TEAM") {
            throw IllegalArgumentException("Bill ownerType must be USER or TEAM.")
        }

        val ownerId = request.ownerId?.trim()?.takeIf(String::isNotBlank)
        if (ownerType == "USER" && ownerId == null) {
            throw IllegalArgumentException("ownerId is required for USER payments.")
        }
        if (request.eventAmountCents <= 0) {
            throw IllegalArgumentException("eventAmountCents must be greater than 0.")
        }
        if (request.taxAmountCents < 0) {
            throw IllegalArgumentException("taxAmountCents must be zero or greater.")
        }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.post<EventTeamPaymentCheckoutRequestDto, EventTeamPaymentCheckoutResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing/checkout",
            body = EventTeamPaymentCheckoutRequestDto(
                ownerType = ownerType,
                ownerId = ownerId,
                eventAmountCents = request.eventAmountCents,
                taxAmountCents = request.taxAmountCents,
                divisionId = request.divisionId?.trim()?.takeIf(String::isNotBlank),
                label = request.label?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.toPaymentCheckoutOrNull() ?: error("Create payment checkout response missing checkout URL")
    }

    override suspend fun refundEventTeamBillPayment(
        eventId: String,
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit> = runCatching {
        val normalizedEventId = eventId.trim()
        val normalizedTeamId = teamId.trim()
        val normalizedBillPaymentId = billPaymentId.trim()
        require(normalizedEventId.isNotBlank()) { "Event id is required." }
        require(normalizedTeamId.isNotBlank()) { "Team id is required." }
        require(normalizedBillPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(amountCents > 0) { "Refund amount must be greater than 0." }

        val encodedEventId = normalizedEventId.encodeURLQueryComponent()
        val encodedTeamId = normalizedTeamId.encodeURLQueryComponent()
        val response = api.post<EventTeamBillRefundRequestDto, EventTeamBillRefundResponseDto>(
            path = "api/events/$encodedEventId/teams/$encodedTeamId/billing/refunds",
            body = EventTeamBillRefundRequestDto(
                billPaymentId = normalizedBillPaymentId,
                amountCents = amountCents,
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
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
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            mapOf(
                "checkout_type" to "bill_payment",
                "bill_id" to billId,
                "bill_payment_id" to billPaymentId,
            ),
        )
        response
    }

    override suspend fun markBillingPaymentProcessing(
        billId: String,
        billPaymentId: String,
        paymentIntent: String,
    ): Result<Bill> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        val normalizedPaymentIntent = paymentIntent.trim()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(normalizedPaymentIntent.isNotBlank()) { "Payment intent is required." }

        val response = api.post<MarkBillPaymentProcessingRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/processing",
            body = MarkBillPaymentProcessingRequestDto(paymentIntent = normalizedPaymentIntent),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: throw Exception("Payment status response is missing bill.")
    }

    override suspend fun cancelBillPayment(billId: String, billPaymentId: String): Result<Bill> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }

        val response = api.post<EmptyRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/cancel",
            body = EmptyRequestDto(),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: throw Exception("Cancel response is missing bill.")
    }

    override suspend fun submitManualPaymentProof(
        billId: String,
        billPaymentId: String,
        fileId: String,
    ): Result<ManualPaymentProof> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        val normalizedFileId = fileId.trim()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(normalizedFileId.isNotBlank()) { "Proof image is required." }

        val response = api.post<ManualPaymentProofSubmitRequestDto, ManualPaymentProofResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/proof",
            body = ManualPaymentProofSubmitRequestDto(fileId = normalizedFileId),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.proof?.toManualPaymentProofOrNull()
            ?: throw Exception("Proof upload response is missing proof.")
    }

    override suspend fun reviewManualPaymentProof(
        billId: String,
        billPaymentId: String,
        proofId: String,
        decision: String,
        amountAcceptedCents: Int?,
        reviewNote: String?,
    ): Result<Bill> = runCatching {
        val normalizedBillId = billId.trim()
        val normalizedPaymentId = billPaymentId.trim()
        val normalizedProofId = proofId.trim()
        val normalizedDecision = decision.trim().uppercase()
        require(normalizedBillId.isNotBlank()) { "Bill id is required." }
        require(normalizedPaymentId.isNotBlank()) { "Bill payment id is required." }
        require(normalizedProofId.isNotBlank()) { "Proof id is required." }
        require(normalizedDecision == "ACCEPT" || normalizedDecision == "REJECT") {
            "Proof decision must be ACCEPT or REJECT."
        }
        if (normalizedDecision == "ACCEPT") {
            require((amountAcceptedCents ?: 0) > 0) { "Accepted amount must be greater than 0." }
        }

        val response = api.post<ManualPaymentProofReviewRequestDto, CreateBillResponseDto>(
            path = "api/billing/bills/${normalizedBillId.encodeURLQueryComponent()}/payments/${normalizedPaymentId.encodeURLQueryComponent()}/proofs/${normalizedProofId.encodeURLQueryComponent()}/review",
            body = ManualPaymentProofReviewRequestDto(
                decision = normalizedDecision,
                amountAcceptedCents = amountAcceptedCents?.coerceAtLeast(0),
                reviewNote = reviewNote?.trim()?.takeIf(String::isNotBlank),
            ),
        )
        response.error?.takeIf(String::isNotBlank)?.let { throw Exception(it) }
        response.bill?.toBillOrNull() ?: throw Exception("Proof review response is missing bill.")
    }

    override suspend fun getBillingAddress(): Result<BillingAddressProfile> = runCatching {
        val response = api.get<BillingAddressResponseDto>(path = "api/profile/billing-address")
        response.toBillingAddressProfile()
    }

    override suspend fun updateBillingAddress(address: BillingAddressDraft): Result<BillingAddressProfile> = runCatching {
        val normalizedAddress = address.normalized()
        if (!normalizedAddress.isCompleteForUsTax()) {
            throw IllegalArgumentException("A complete US billing address is required.")
        }

        val response = api.patch<UpdateBillingAddressRequestDto, BillingAddressResponseDto>(
            path = "api/profile/billing-address",
            body = UpdateBillingAddressRequestDto(
                billingAddress = BillingAddressDto.fromDraft(normalizedAddress),
            ),
        )
        response.toBillingAddressProfile()
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

    override suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>> = runCatching {
        val normalizedId = organizationId.trim()
        if (normalizedId.isEmpty()) return@runCatching emptyList()

        val encodedId = normalizedId.encodeURLQueryComponent()
        val response = api.get<ProductsResponseDto>(path = "api/products?organizationId=$encodedId")
        response.products.mapNotNull { it.toProductOrNull() }
    }

    override suspend fun createProductPurchaseIntent(productId: String): Result<PurchaseIntent> =
        createProductPurchaseIntent(productId, null)

    override suspend fun createProductPurchaseIntent(
        productId: String,
        discountCode: String?,
    ): Result<PurchaseIntent> = runCatching {
        val normalizedId = productId.trim()
        if (normalizedId.isEmpty()) {
            throw Exception("Product id is required.")
        }

        val user = userRepository.currentUser.value.getOrThrow()
        val email = userRepository.currentAccount.value.getOrNull()?.email

        val response = api.post<PurchaseIntentRequestDto, PurchaseIntent>(
            path = "api/billing/purchase-intent",
            body = PurchaseIntentRequestDto(
                user = BillingUserRefDto(id = user.id, email = email),
                productId = normalizedId,
                discountCode = discountCode?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            mapOf(
                "checkout_type" to "product_purchase",
                "product_id" to normalizedId,
            ),
        )
        response
    }

    override suspend fun createProductSubscriptionIntent(productId: String): Result<PurchaseIntent> =
        createProductSubscriptionIntent(productId, null)

    override suspend fun createProductSubscriptionIntent(
        productId: String,
        discountCode: String?,
    ): Result<PurchaseIntent> = runCatching {
        val normalizedId = productId.trim()
        if (normalizedId.isEmpty()) {
            throw Exception("Product id is required.")
        }

        val response = api.post<ProductSubscriptionCheckoutRequestDto, PurchaseIntent>(
            path = "api/products/$normalizedId/subscriptions",
            body = ProductSubscriptionCheckoutRequestDto(
                discountCode = discountCode?.trim()?.takeIf(String::isNotBlank),
            ),
        )

        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        AnalyticsTracker.capture(
            AnalyticsEvent.CheckoutStarted,
            mapOf(
                "checkout_type" to "product_subscription",
                "product_id" to normalizedId,
            ),
        )
        response
    }

    override suspend fun createProductSubscription(
        productId: String,
        organizationId: String?,
        priceCents: Int?,
        startDate: String?,
    ): Result<Subscription> = runCatching {
        val normalizedId = productId.trim()
        if (normalizedId.isEmpty()) {
            throw Exception("Product id is required.")
        }

        val response = api.post<CreateProductSubscriptionRequestDto, SubscriptionApiDto>(
            path = "api/products/$normalizedId/subscriptions",
            body = CreateProductSubscriptionRequestDto(
                organizationId = organizationId,
                priceCents = priceCents,
                startDate = startDate,
            ),
        )

        response.toSubscriptionOrNull() ?: error("Create subscription response missing subscription")
    }

    override fun observeDiscounts(ownerType: String, ownerId: String?): Flow<List<DiscountOffer>> {
        val normalizedOwnerType = ownerType.trim().uppercase().ifBlank { "USER" }
        val normalizedOwnerId = ownerId?.trim()?.takeIf(String::isNotBlank)
        return databaseService.getDiscountDao
            .getDiscountOffersFlow(normalizedOwnerType)
            .combine(databaseService.getDiscountDao.getDiscountCodesFlow()) { discounts, codes ->
                val codesByDiscountId = codes.groupBy { it.discountId }
                discounts
                    .asSequence()
                    .filter { discount -> normalizedOwnerId?.let { discount.ownerId == it } ?: true }
                    .map { discount -> discount.toDiscountOffer(codesByDiscountId[discount.id].orEmpty()) }
                    .toList()
            }
    }

    override suspend fun listDiscounts(ownerType: String, ownerId: String?): Result<List<DiscountOffer>> = runCatching {
        val normalizedOwnerType = ownerType.trim().uppercase().ifBlank { "USER" }
        val params = buildList {
            add("ownerType=${normalizedOwnerType.encodeURLQueryComponent()}")
            ownerId?.trim()?.takeIf(String::isNotBlank)?.let { id ->
                add("ownerId=${id.encodeURLQueryComponent()}")
            }
        }.joinToString("&")
        val response = api.get<DiscountsResponseDto>(path = "api/discounts?$params")
        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        val discounts = response.discounts.map { it.toDiscountOffer() }
        databaseService.getDiscountDao.replaceDiscountOffers(
            ownerType = normalizedOwnerType,
            discounts = discounts.map(DiscountOffer::toCacheEntry),
            codes = discounts.flatMap { discount -> discount.codes.map(DiscountCode::toCacheEntry) },
        )
        discounts
    }

    override fun observeDiscountTargets(
        ownerType: String,
        ownerId: String?,
        itemType: String,
    ): Flow<List<DiscountTarget>> {
        val normalizedOwnerType = ownerType.trim().uppercase().ifBlank { "USER" }
        val normalizedItemType = itemType.trim().uppercase().ifBlank { "EVENT" }
        return databaseService.getDiscountDao
            .getDiscountTargetsFlow(
                ownerType = normalizedOwnerType,
                ownerIdKey = ownerId.ownerIdKey(),
                itemType = normalizedItemType,
            )
            .map { targets -> targets.map(DiscountTargetCacheEntry::toDiscountTarget) }
    }

    override suspend fun listDiscountTargets(
        ownerType: String,
        ownerId: String?,
        itemType: String,
        query: String?,
    ): Result<List<DiscountTarget>> = runCatching {
        val normalizedOwnerType = ownerType.trim().uppercase().ifBlank { "USER" }
        val normalizedItemType = itemType.trim().uppercase().ifBlank { "EVENT" }
        val params = buildList {
            add("ownerType=${normalizedOwnerType.encodeURLQueryComponent()}")
            add("itemType=${normalizedItemType.encodeURLQueryComponent()}")
            ownerId?.trim()?.takeIf(String::isNotBlank)?.let { id ->
                add("ownerId=${id.encodeURLQueryComponent()}")
            }
            query?.trim()?.takeIf(String::isNotBlank)?.let { search ->
                add("query=${search.encodeURLQueryComponent()}")
            }
        }.joinToString("&")
        val response = api.get<DiscountTargetsResponseDto>(path = "api/discounts/targets?$params")
        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        val targets = response.targets.map { it.toDiscountTarget() }
        if (query.isNullOrBlank()) {
            val ownerIdKey = ownerId.ownerIdKey()
            databaseService.getDiscountDao.replaceDiscountTargets(
                ownerType = normalizedOwnerType,
                ownerIdKey = ownerIdKey,
                itemType = normalizedItemType,
                targets = targets.map { target ->
                    target.toCacheEntry(
                        ownerType = normalizedOwnerType,
                        ownerIdKey = ownerIdKey,
                    )
                },
            )
        }
        targets
    }

    override suspend fun createDiscount(
        ownerType: String,
        ownerId: String?,
        name: String,
        description: String?,
        targetType: String,
        targetId: String,
        discountedPriceCents: Int,
    ): Result<DiscountOffer> = runCatching {
        val response = api.post<CreateDiscountRequestDto, DiscountResponseDto>(
            path = "api/discounts",
            body = CreateDiscountRequestDto(
                ownerType = ownerType.trim().uppercase().ifBlank { "USER" },
                ownerId = ownerId?.trim()?.takeIf(String::isNotBlank),
                name = name.trim(),
                description = description?.trim()?.takeIf(String::isNotBlank),
                targetType = targetType.trim().uppercase(),
                targetId = targetId.trim(),
                discountedPriceCents = discountedPriceCents.coerceAtLeast(0),
            ),
        )
        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        val discount = response.discount?.toDiscountOffer()
            ?: throw Exception("Discount response was invalid.")
        databaseService.getDiscountDao.upsertDiscountOffers(listOf(discount.toCacheEntry()))
        databaseService.getDiscountDao.upsertDiscountCodes(discount.codes.map(DiscountCode::toCacheEntry))
        discount
    }

    override suspend fun generateDiscountCode(
        discountId: String,
        code: String?,
        usageLimit: Int?,
    ): Result<DiscountCode> = runCatching {
        val normalizedDiscountId = discountId.trim()
        if (normalizedDiscountId.isEmpty()) {
            throw Exception("Discount id is required.")
        }
        val response = api.post<GenerateDiscountCodeRequestDto, DiscountCodeResponseDto>(
            path = "api/discounts/${normalizedDiscountId.encodeURLQueryComponent()}/codes",
            body = GenerateDiscountCodeRequestDto(
                code = code?.trim()?.takeIf(String::isNotBlank),
                usageLimit = usageLimit?.takeIf { it > 0 },
            ),
        )
        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        val discountCode = response.code?.toDiscountCode()
            ?: throw Exception("Discount code response was invalid.")
        databaseService.getDiscountDao.upsertDiscountCodes(listOf(discountCode.toCacheEntry()))
        discountCode
    }

    override suspend fun updateDiscountCodeStatus(
        discountId: String,
        codeId: String,
        status: String,
    ): Result<DiscountCode> = runCatching {
        val normalizedDiscountId = discountId.trim()
        val normalizedCodeId = codeId.trim()
        val normalizedStatus = status.trim().uppercase()
        if (normalizedDiscountId.isEmpty() || normalizedCodeId.isEmpty()) {
            throw Exception("Discount code id is required.")
        }
        val response = api.patch<UpdateDiscountCodeRequestDto, DiscountCodeResponseDto>(
            path = "api/discounts/${normalizedDiscountId.encodeURLQueryComponent()}/codes/${normalizedCodeId.encodeURLQueryComponent()}",
            body = UpdateDiscountCodeRequestDto(status = normalizedStatus),
        )
        if (!response.error.isNullOrBlank()) {
            throw Exception(response.error)
        }
        val discountCode = response.code?.toDiscountCode()
            ?: throw Exception("Discount code response was invalid.")
        databaseService.getDiscountDao.upsertDiscountCodes(listOf(discountCode.toCacheEntry()))
        discountCode
    }

    override suspend fun deleteDiscountCode(
        discountId: String,
        codeId: String,
    ): Result<Unit> = runCatching {
        val normalizedDiscountId = discountId.trim()
        val normalizedCodeId = codeId.trim()
        if (normalizedDiscountId.isEmpty() || normalizedCodeId.isEmpty()) {
            throw Exception("Discount code id is required.")
        }
        api.deleteNoResponse(
            "api/discounts/${normalizedDiscountId.encodeURLQueryComponent()}/codes/${normalizedCodeId.encodeURLQueryComponent()}",
        )
        databaseService.getDiscountDao.deleteDiscountCodeById(normalizedCodeId)
    }

    override suspend fun listOrganizations(limit: Int): Result<List<Organization>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 1000)
        val response = api.get<OrganizationsResponseDto>(path = "api/organizations?limit=$normalizedLimit")
        response.organizations.mapNotNull { it.toOrganizationOrNull() }
    }

    override suspend fun searchOrganizations(query: String, limit: Int): Result<List<Organization>> = runCatching {
        val normalizedQuery = query.trim()
        if (normalizedQuery.isEmpty()) return@runCatching emptyList()

        val normalizedLimit = limit.coerceIn(1, 100)
        val encodedQuery = normalizedQuery.encodeURLQueryComponent()
        val response = api.get<OrganizationsResponseDto>(
            path = "api/organizations?query=$encodedQuery&limit=$normalizedLimit",
        )
        response.organizations.mapNotNull { it.toOrganizationOrNull() }
    }

    override suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> = runCatching {
        val ids = organizationIds.distinct().filter(String::isNotBlank)
        if (ids.isEmpty()) return@runCatching emptyList()
        if (ids.size == 1) {
            val encodedId = ids.first().encodeURLQueryComponent()
            val response = api.get<OrganizationApiDto>(path = "api/organizations/$encodedId")
            return@runCatching listOfNotNull(response.toOrganizationOrNull())
        }

        val encodedIds = ids.joinToString(",") { it.encodeURLQueryComponent() }
        val response = api.get<OrganizationsResponseDto>(path = "api/organizations?ids=$encodedIds&limit=100")
        response.organizations.mapNotNull { it.toOrganizationOrNull() }
    }

    override suspend fun listOrganizationTemplates(
        organizationId: String,
    ): Result<List<OrganizationTemplateDocument>> = runCatching {
        val normalizedId = organizationId.trim()
        if (normalizedId.isEmpty()) return@runCatching emptyList()

        val encodedId = normalizedId.encodeURLQueryComponent()
        val response = api.get<OrganizationTemplatesResponseDto>(
            path = "api/organizations/$encodedId/templates",
        )
        response.error?.takeIf(String::isNotBlank)?.let { errorMessage ->
            throw Exception(errorMessage)
        }
        response.templates.mapNotNull { row -> row.toOrganizationTemplateOrNull() }
    }

    override suspend fun leaveAndRefundEvent(event: Event, reason: String, targetUserId: String?): Result<Unit> =
        runCatching {
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

            val refundUserIds = serverRefunds.map { refund -> refund.userId }.distinct()
            if (refundUserIds.isNotEmpty()) {
                userRepository.getUsers(refundUserIds).onFailure { e ->
                    Napier.e("Failed to cache users for refund hydration", e)
                }
            }

            val refundEventIds = serverRefunds.map { refund -> refund.eventId }.distinct()
            if (refundEventIds.isNotEmpty()) {
                eventRepository.getEventsByIds(refundEventIds).onFailure { e ->
                    Napier.e("Failed to cache events for refund hydration", e)
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

private fun buildEmbeddedSigningRedirectUrl(eventId: String): String? {
    val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return null
    return "https://bracket-iq.com/events/$normalizedEventId"
}

private fun Throwable.isNotFound(): Boolean {
    return when (this) {
        is ClientRequestException -> this.response.status == HttpStatusCode.NotFound
        is ApiException -> this.statusCode == HttpStatusCode.NotFound.value
        else -> false
    }
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
    val signerContext: String? = null,
    val childUserId: String? = null,
    val childEmail: String? = null,
    val redirectUrl: String? = null,
)

@Serializable
private data class RentalSignLinksRequestDto(
    val userId: String? = null,
    val userEmail: String? = null,
    val eventId: String? = null,
    val organizationId: String? = null,
    val templateIds: List<String> = emptyList(),
    val redirectUrl: String? = null,
)

@Serializable
private data class EventSignLinksResponseDto(
    val signLinks: List<SignStep> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class ProfileDocumentsResponseDto(
    val unsigned: List<ProfileDocumentCardDto> = emptyList(),
    val signed: List<ProfileDocumentCardDto> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class ProfileDocumentCardDto(
    val id: String? = null,
    val status: String? = null,
    val eventId: String? = null,
    val eventName: String? = null,
    val teamId: String? = null,
    val teamName: String? = null,
    val organizationId: String? = null,
    val organizationName: String? = null,
    val templateId: String? = null,
    val title: String? = null,
    val type: String? = null,
    val requiredSignerType: String? = null,
    val requiredSignerLabel: String? = null,
    val signerContext: String? = null,
    val signerContextLabel: String? = null,
    val childUserId: String? = null,
    val childEmail: String? = null,
    val consentStatus: String? = null,
    val requiresChildEmail: Boolean? = null,
    val statusNote: String? = null,
    val signedAt: String? = null,
    val signedDocumentRecordId: String? = null,
    val viewUrl: String? = null,
    val content: String? = null,
)

private fun ProfileDocumentCardDto.toProfileDocumentCardOrNull(
    defaultStatus: ProfileDocumentStatus,
): ProfileDocumentCard? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedTemplateId = templateId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedSignerType = requiredSignerType?.trim()?.takeIf(String::isNotBlank) ?: "PARTICIPANT"
    val resolvedSignerLabel = requiredSignerLabel?.trim()?.takeIf(String::isNotBlank) ?: resolvedSignerType

    return ProfileDocumentCard(
        id = resolvedId,
        status = parseProfileDocumentStatus(status, defaultStatus),
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        eventName = eventName?.trim()?.takeIf(String::isNotBlank),
        teamId = teamId?.trim()?.takeIf(String::isNotBlank),
        teamName = teamName?.trim()?.takeIf(String::isNotBlank),
        organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
        organizationName = organizationName?.trim()?.takeIf(String::isNotBlank) ?: "Organization",
        templateId = resolvedTemplateId,
        title = title?.trim()?.takeIf(String::isNotBlank) ?: "Document",
        type = parseProfileDocumentType(type),
        requiredSignerType = resolvedSignerType,
        requiredSignerLabel = resolvedSignerLabel,
        signerContext = parseSignerContext(signerContext),
        signerContextLabel = signerContextLabel?.trim()?.takeIf(String::isNotBlank) ?: resolvedSignerLabel,
        childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
        childEmail = childEmail?.trim()?.takeIf(String::isNotBlank),
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
        requiresChildEmail = requiresChildEmail ?: false,
        statusNote = statusNote?.trim()?.takeIf(String::isNotBlank),
        signedAt = signedAt?.trim()?.takeIf(String::isNotBlank),
        signedDocumentRecordId = signedDocumentRecordId?.trim()?.takeIf(String::isNotBlank),
        viewUrl = viewUrl?.trim()?.takeIf(String::isNotBlank),
        content = content?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun parseProfileDocumentStatus(
    raw: String?,
    defaultStatus: ProfileDocumentStatus,
): ProfileDocumentStatus {
    return when (raw?.trim()?.uppercase()) {
        "UNSIGNED" -> ProfileDocumentStatus.UNSIGNED
        "SIGNED" -> ProfileDocumentStatus.SIGNED
        else -> defaultStatus
    }
}

private fun parseProfileDocumentType(raw: String?): ProfileDocumentType {
    return when (raw?.trim()?.uppercase()) {
        "TEXT" -> ProfileDocumentType.TEXT
        else -> ProfileDocumentType.PDF
    }
}

private fun parseSignerContext(raw: String?): SignerContext {
    return when (raw?.trim()?.lowercase()) {
        "parent_guardian" -> SignerContext.PARENT_GUARDIAN
        "child" -> SignerContext.CHILD
        else -> SignerContext.PARTICIPANT
    }
}

@Serializable
private data class RecordSignatureRequestDto(
    val templateId: String,
    val documentId: String,
    val eventId: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val type: String? = null,
    val signerContext: String? = null,
    val childUserId: String? = null,
)

@Serializable
private data class RecordSignatureResponseDto(
    val ok: Boolean? = null,
    val operationId: String? = null,
    val syncStatus: String? = null,
    val error: String? = null,
)

@Serializable
private data class BoldSignOperationStatusDto(
    val operationId: String? = null,
    val operationType: String? = null,
    val status: String? = null,
    val error: String? = null,
    val templateDocumentId: String? = null,
    val signedDocumentRecordId: String? = null,
    val templateId: String? = null,
    val documentId: String? = null,
    val updatedAt: String? = null,
)

private fun BoldSignOperationStatusDto.toOperationStatus(): BoldSignOperationStatus {
    val normalizedOperationId = operationId?.trim()?.takeIf(String::isNotBlank)
        ?: throw Exception("Operation status response is missing operationId.")
    val normalizedStatus = status?.trim()?.takeIf(String::isNotBlank) ?: "PENDING_WEBHOOK"

    return BoldSignOperationStatus(
        operationId = normalizedOperationId,
        operationType = operationType?.trim()?.takeIf(String::isNotBlank),
        status = normalizedStatus,
        error = error?.trim()?.takeIf(String::isNotBlank),
        templateDocumentId = templateDocumentId?.trim()?.takeIf(String::isNotBlank),
        signedDocumentRecordId = signedDocumentRecordId?.trim()?.takeIf(String::isNotBlank),
        templateId = templateId?.trim()?.takeIf(String::isNotBlank),
        documentId = documentId?.trim()?.takeIf(String::isNotBlank),
        updatedAt = updatedAt?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun TeamPlayerRegistration.toTeamRegistrationCheckoutTarget(teamId: String): BillingTeamRefDto {
    val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank) ?: teamId
    return BillingTeamRefDto(
        teamId = normalizedTeamId,
        registrantId = registrantId.trim().takeIf(String::isNotBlank) ?: userId.trim().takeIf(String::isNotBlank),
        userId = userId.trim().takeIf(String::isNotBlank),
        parentId = parentId?.trim()?.takeIf(String::isNotBlank),
        registrantType = registrantType.trim().takeIf(String::isNotBlank),
        rosterRole = rosterRole?.trim()?.takeIf(String::isNotBlank),
        consentDocumentId = consentDocumentId?.trim()?.takeIf(String::isNotBlank),
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
    )
}

@Serializable
private data class EmptyRequestDto(
    val noop: Boolean = true,
)

@Serializable
private data class ProductSubscriptionCheckoutRequestDto(
    val discountCode: String? = null,
)

@Serializable
private data class DiscountsResponseDto(
    val discounts: List<DiscountOfferDto> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class DiscountResponseDto(
    val discount: DiscountOfferDto? = null,
    val error: String? = null,
)

@Serializable
private data class DiscountOfferDto(
    val id: String? = null,
    val ownerType: String? = null,
    val ownerId: String? = null,
    val name: String? = null,
    val description: String? = null,
    val status: String? = null,
    val targetType: String? = null,
    val targetId: String? = null,
    val originalPriceCents: Int? = null,
    val originalPriceCentsSnapshot: Int? = null,
    val discountedPriceCents: Int? = null,
    val codes: List<DiscountCodeDto> = emptyList(),
) {
    fun toDiscountOffer(): DiscountOffer = DiscountOffer(
        id = id.orEmpty(),
        ownerType = ownerType?.trim()?.takeIf(String::isNotBlank) ?: "USER",
        ownerId = ownerId.orEmpty(),
        name = name?.trim()?.takeIf(String::isNotBlank) ?: "Discount",
        description = description?.trim()?.takeIf(String::isNotBlank),
        status = status?.trim()?.takeIf(String::isNotBlank) ?: "ACTIVE",
        targetType = targetType?.trim()?.takeIf(String::isNotBlank) ?: "EVENT",
        targetId = targetId.orEmpty(),
        originalPriceCents = (originalPriceCents ?: originalPriceCentsSnapshot ?: 0).coerceAtLeast(0),
        discountedPriceCents = (discountedPriceCents ?: 0).coerceAtLeast(0),
        codes = codes.map { it.toDiscountCode() },
    )
}

@Serializable
private data class DiscountCodeResponseDto(
    val code: DiscountCodeDto? = null,
    val error: String? = null,
)

@Serializable
private data class DiscountCodeDto(
    val id: String? = null,
    val discountId: String? = null,
    val code: String? = null,
    val usageLimit: Int? = null,
    val usedCount: Int? = null,
    val status: String? = null,
) {
    fun toDiscountCode(): DiscountCode = DiscountCode(
        id = id.orEmpty(),
        discountId = discountId.orEmpty(),
        code = code?.trim()?.takeIf(String::isNotBlank) ?: "CODE",
        usageLimit = usageLimit?.takeIf { it > 0 },
        usedCount = (usedCount ?: 0).coerceAtLeast(0),
        status = status?.trim()?.takeIf(String::isNotBlank) ?: "ACTIVE",
    )
}

@Serializable
private data class DiscountTargetsResponseDto(
    val targets: List<DiscountTargetDto> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class DiscountTargetDto(
    val id: String? = null,
    val label: String? = null,
    val description: String? = null,
    val priceCents: Int? = null,
    val itemType: String? = null,
    val targetType: String? = null,
) {
    fun toDiscountTarget(): DiscountTarget = DiscountTarget(
        id = id.orEmpty(),
        label = label?.trim()?.takeIf(String::isNotBlank) ?: "Item",
        description = description?.trim()?.takeIf(String::isNotBlank),
        priceCents = (priceCents ?: 0).coerceAtLeast(0),
        itemType = itemType?.trim()?.takeIf(String::isNotBlank) ?: "EVENT",
        targetType = targetType?.trim()?.takeIf(String::isNotBlank) ?: "EVENT",
    )
}

@Serializable
private data class CreateDiscountRequestDto(
    val ownerType: String,
    val ownerId: String? = null,
    val name: String,
    val description: String? = null,
    val targetType: String,
    val targetId: String,
    val discountedPriceCents: Int,
)

@Serializable
private data class GenerateDiscountCodeRequestDto(
    val code: String? = null,
    val usageLimit: Int? = null,
)

@Serializable
private data class UpdateDiscountCodeRequestDto(
    val status: String,
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
private data class CreateRentalOrderRequestDto(
    val eventId: String,
    val selections: List<RentalOrderSelectionRequest>,
    val sportId: String? = null,
    val paymentIntentId: String? = null,
    val renterOrganizationId: String? = null,
)

@Serializable
private data class RentalOrderItemDto(
    val id: String? = null,
    val fieldId: String? = null,
    val start: String? = null,
    val end: String? = null,
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
)

@Serializable
private data class RentalOrderResponseDto(
    val bookingId: String? = null,
    val billId: String? = null,
    val eventId: String? = null,
    val totalCents: Int? = null,
    val items: List<RentalOrderItemDto> = emptyList(),
    val createEventUrl: String? = null,
    val error: String? = null,
)

@Serializable
private data class RentalBookingsResponseDto(
    val bookings: List<RentalBookingDto> = emptyList(),
)

@Serializable
private data class RentalBookingDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val organizationId: String? = null,
    val renterOrganizationId: String? = null,
    val eventId: String? = null,
    val status: String? = null,
    val totalAmountCents: Int? = null,
    val organization: RentalBookingOrganizationDto? = null,
    val items: List<RentalBookingItemDto> = emptyList(),
)

@Serializable
private data class RentalBookingOrganizationDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val coordinates: List<Double>? = null,
)

@Serializable
private data class RentalBookingItemDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val bookingId: String? = null,
    val organizationId: String? = null,
    val facilityId: String? = null,
    val fieldId: String? = null,
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
    val start: String? = null,
    val end: String? = null,
    val timeZone: String? = null,
    val priceCents: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val field: RentalFieldDto? = null,
    val facility: RentalFacilityDto? = null,
)

@Serializable
private data class RentalFieldDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val fieldNumber: Int? = null,
    val divisions: List<String> = emptyList(),
    val lat: Double? = null,
    val long: Double? = null,
    val heading: Double? = null,
    val inUse: Boolean? = null,
    val name: String? = null,
    val rentalSlotIds: List<String> = emptyList(),
    val location: String? = null,
    val organizationId: String? = null,
    val facilityId: String? = null,
    val facility: RentalFacilityDto? = null,
)

@Serializable
private data class RentalFacilityDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
)

@Serializable
private data class OrganizationTemplatesResponseDto(
    val templates: List<OrganizationTemplateApiDto> = emptyList(),
    val error: String? = null,
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
private data class MarkBillPaymentProcessingRequestDto(
    val paymentIntent: String,
)

@Serializable
private data class ManualPaymentProofSubmitRequestDto(
    val fileId: String,
)

@Serializable
private data class ManualPaymentProofReviewRequestDto(
    val decision: String,
    val amountAcceptedCents: Int? = null,
    val reviewNote: String? = null,
)

@Serializable
private data class ManualPaymentProofResponseDto(
    val proof: ManualPaymentProofApiDto? = null,
    val error: String? = null,
)

@Serializable
private data class UpdateBillingAddressRequestDto(
    val billingAddress: BillingAddressDto,
)

@Serializable
private data class BillingAddressResponseDto(
    val billingAddress: BillingAddressDto? = null,
    val email: String? = null,
) {
    fun toBillingAddressProfile(): BillingAddressProfile = BillingAddressProfile(
        billingAddress = billingAddress?.toBillingAddressDraft(),
        email = email?.trim()?.takeIf(String::isNotBlank),
    )
}

@Serializable
private data class CreateBillRequestDto(
    val ownerType: String,
    val ownerId: String,
    val totalAmountCents: Int,
    val eventId: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val organizationId: String? = null,
    val installmentAmounts: List<Int>? = null,
    val installmentDueDates: List<String>? = null,
    val installmentDueRelativeDays: List<Int>? = null,
    val allowSplit: Boolean = false,
    val paymentPlanEnabled: Boolean = false,
    val event: BillingEventRefDto? = null,
    val user: BillingUserRefDto? = null,
)

@Serializable
private data class EventTeamBillCreateRequestDto(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val allowSplit: Boolean = false,
    val label: String? = null,
)

@Serializable
private data class EventTeamPaymentCheckoutRequestDto(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val divisionId: String? = null,
    val label: String? = null,
)

@Serializable
private data class EventTeamPaymentCheckoutResponseDto(
    val checkoutUrl: String? = null,
    val qrCodeUrl: String? = null,
    val amountCents: Int? = null,
    val eventAmountCents: Int? = null,
    val billOwnerType: String? = null,
    val billOwnerId: String? = null,
    val payerUserId: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val checkoutSessionId: String? = null,
    val error: String? = null,
)

@Serializable
private data class CreateBillResponseDto(
    val bill: BillApiDto? = null,
    val error: String? = null,
)

@Serializable
private data class EventTeamBillRefundRequestDto(
    val billPaymentId: String,
    val amountCents: Int,
)

@Serializable
private data class EventTeamBillRefundResponseDto(
    val error: String? = null,
)

@Serializable
private data class EventTeamBillingSnapshotResponseDto(
    val team: EventTeamBillingTeamDto? = null,
    val users: List<EventTeamBillingUserDto> = emptyList(),
    val bills: List<EventTeamBillingBillDto> = emptyList(),
    val totals: EventTeamBillingTotalsDto? = null,
    val error: String? = null,
)

@Serializable
private data class EventTeamBillingTeamDto(
    val id: String? = null,
    val name: String? = null,
    val playerIds: List<String> = emptyList(),
)

@Serializable
private data class EventTeamBillingUserDto(
    val id: String? = null,
    val displayName: String? = null,
)

@Serializable
private data class EventTeamBillingLineItemDto(
    val id: String? = null,
    val type: String? = null,
    val label: String? = null,
    val amountCents: Int? = null,
    val quantity: Int? = null,
)

@Serializable
private data class ManualPaymentProofApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val status: String? = null,
    val fileId: String? = null,
    val fileUrl: String? = null,
    val amountAcceptedCents: Int? = null,
) {
    fun toManualPaymentProofOrNull(): ManualPaymentProof? {
        val resolvedId = id?.trim()?.takeIf(String::isNotBlank)
            ?: legacyId?.trim()?.takeIf(String::isNotBlank)
            ?: return null
        val resolvedFileId = fileId?.trim()?.takeIf(String::isNotBlank) ?: return null
        return ManualPaymentProof(
            id = resolvedId,
            status = status?.trim()?.takeIf(String::isNotBlank),
            fileId = resolvedFileId,
            fileUrl = fileUrl?.trim()?.takeIf(String::isNotBlank),
            amountAcceptedCents = amountAcceptedCents,
        )
    }
}

@Serializable
private data class EventTeamBillingPaymentDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val billId: String? = null,
    val sequence: Int? = null,
    val status: String? = null,
    val amountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val refundedAmountCents: Int? = null,
    val refundableAmountCents: Int? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val isRefundable: Boolean? = null,
    val manualPaymentProofs: List<ManualPaymentProofApiDto> = emptyList(),
)

@Serializable
private data class BillDiscountSummaryDto(
    val id: String? = null,
    val discountId: String? = null,
    val discountCodeId: String? = null,
    val code: String? = null,
    val name: String? = null,
    val originalAmountCents: Int? = null,
    val discountedAmountCents: Int? = null,
    val discountAmountCents: Int? = null,
    val paymentIntentId: String? = null,
    val registrationId: String? = null,
)

@Serializable
private data class EventTeamBillingBillDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val ownerType: String? = null,
    val ownerId: String? = null,
    val ownerName: String? = null,
    val totalAmountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val originalAmountCents: Int? = null,
    val discountAmountCents: Int? = null,
    val discountedAmountCents: Int? = null,
    val discounts: List<BillDiscountSummaryDto> = emptyList(),
    val refundedAmountCents: Int? = null,
    val refundableAmountCents: Int? = null,
    val status: String? = null,
    val allowSplit: Boolean? = null,
    val lineItems: List<EventTeamBillingLineItemDto> = emptyList(),
    val payments: List<EventTeamBillingPaymentDto> = emptyList(),
)

@Serializable
private data class EventTeamBillingTotalsDto(
    val paidAmountCents: Int? = null,
    val refundedAmountCents: Int? = null,
    val refundableAmountCents: Int? = null,
)

@Serializable
private data class CreateProductSubscriptionRequestDto(
    val organizationId: String? = null,
    val priceCents: Int? = null,
    val startDate: String? = null,
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
    val originalAmountCents: Int? = null,
    val discountAmountCents: Int? = null,
    val discountedAmountCents: Int? = null,
    val discounts: List<BillDiscountSummaryDto> = emptyList(),
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
            originalAmountCents = originalAmountCents,
            discountAmountCents = discountAmountCents,
            discountedAmountCents = discountedAmountCents,
            discounts = discounts.mapNotNull { discount -> discount.toBillDiscountSummaryOrNull() },
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

private fun EventTeamBillingSnapshotResponseDto.toSnapshotOrNull(): EventTeamBillingSnapshot? {
    val teamDto = team ?: return null
    val resolvedTeamId = teamDto.id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val bills = bills.mapNotNull { bill -> bill.toBillOrNull() }
    val totalsDto = totals
    val totals = EventTeamBillingTotals(
        paidAmountCents = totalsDto?.paidAmountCents ?: 0,
        refundedAmountCents = totalsDto?.refundedAmountCents ?: 0,
        refundableAmountCents = totalsDto?.refundableAmountCents ?: 0,
    )
    return EventTeamBillingSnapshot(
        teamId = resolvedTeamId,
        teamName = teamDto.name?.trim()?.takeIf(String::isNotBlank),
        playerIds = teamDto.playerIds.mapNotNull { id -> id.trim().takeIf(String::isNotBlank) },
        users = users.mapNotNull { user -> user.toUserOptionOrNull() },
        bills = bills,
        totals = totals,
    )
}

private fun EventTeamPaymentCheckoutResponseDto.toPaymentCheckoutOrNull(): EventTeamPaymentCheckout? {
    val resolvedCheckoutUrl = checkoutUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedQrCodeUrl = qrCodeUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedAmountCents = amountCents ?: return null
    val resolvedEventAmountCents = eventAmountCents ?: resolvedAmountCents
    val resolvedBillOwnerType = billOwnerType?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedBillOwnerId = billOwnerId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventTeamPaymentCheckout(
        checkoutUrl = resolvedCheckoutUrl,
        qrCodeUrl = resolvedQrCodeUrl,
        amountCents = resolvedAmountCents,
        eventAmountCents = resolvedEventAmountCents,
        billOwnerType = resolvedBillOwnerType,
        billOwnerId = resolvedBillOwnerId,
        payerUserId = payerUserId?.trim()?.takeIf(String::isNotBlank),
        feeBreakdown = feeBreakdown,
        checkoutSessionId = checkoutSessionId?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun RentalOrderResponseDto.toRentalOrderResultOrNull(): RentalOrderResult? {
    val resolvedBookingId = bookingId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return RentalOrderResult(
        bookingId = resolvedBookingId,
        billId = billId?.trim()?.takeIf(String::isNotBlank),
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        totalCents = totalCents ?: 0,
        items = items.mapNotNull { item -> item.toRentalOrderItemOrNull() },
        createEventUrl = createEventUrl?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun RentalOrderItemDto.toRentalOrderItemOrNull(): RentalOrderItem? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedFieldId = fieldId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedStart = start?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedEnd = end?.trim()?.takeIf(String::isNotBlank) ?: return null
    return RentalOrderItem(
        id = resolvedId,
        fieldId = resolvedFieldId,
        start = resolvedStart,
        end = resolvedEnd,
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        eventTimeSlotId = eventTimeSlotId?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun RentalBookingsResponseDto.toRentalResourceOptions(): List<RentalResourceOption> {
    return bookings.flatMap { booking -> booking.toRentalResourceOptions() }
        .sortedBy { option -> option.start }
}

private fun RentalBookingDto.toRentalResourceOptions(): List<RentalResourceOption> {
    val resolvedBookingId = (id ?: legacyId)?.trim()?.takeIf(String::isNotBlank) ?: return emptyList()
    val resolvedOrganizationId = organizationId?.trim()?.takeIf(String::isNotBlank) ?: return emptyList()
    val organizationName = organization?.name?.trim()?.takeIf(String::isNotBlank)
    return items.mapNotNull { item ->
        item.toRentalResourceOptionOrNull(
            bookingId = resolvedBookingId,
            bookingOrganizationId = resolvedOrganizationId,
            organizationName = organizationName,
            renterOrganizationId = renterOrganizationId?.trim()?.takeIf(String::isNotBlank),
        )
    }
}

private fun RentalBookingItemDto.toRentalResourceOptionOrNull(
    bookingId: String,
    bookingOrganizationId: String,
    organizationName: String?,
    renterOrganizationId: String?,
): RentalResourceOption? {
    val resolvedItemId = (id ?: legacyId)?.trim()?.takeIf(String::isNotBlank) ?: return null
    val fallbackFacility = facility?.toFacilityOrNull()
    val resolvedField = field?.toFieldOrNull(
        fallbackFieldId = fieldId,
        fallbackOrganizationId = organizationId ?: bookingOrganizationId,
        fallbackFacilityId = facilityId,
        fallbackFacility = fallbackFacility,
    )
        ?: return null
    val resolvedStart = start?.trim()?.takeIf(String::isNotBlank)?.let { value ->
        runCatching { Instant.parse(value) }.getOrNull()
    } ?: return null
    val resolvedEnd = end?.trim()?.takeIf(String::isNotBlank)?.let { value ->
        runCatching { Instant.parse(value) }.getOrNull()
    } ?: return null
    if (resolvedEnd <= resolvedStart) {
        return null
    }
    return RentalResourceOption(
        id = "$bookingId:$resolvedItemId",
        bookingId = bookingId,
        bookingItemId = resolvedItemId,
        organizationId = bookingOrganizationId,
        organizationName = organizationName,
        renterOrganizationId = renterOrganizationId,
        field = resolvedField,
        start = resolvedStart,
        end = resolvedEnd,
        timeZone = timeZone?.trim()?.takeIf(String::isNotBlank) ?: "UTC",
        priceCents = priceCents ?: 0,
        requiredTemplateIds = requiredTemplateIds.normalizeStringList(),
        hostRequiredTemplateIds = hostRequiredTemplateIds.normalizeStringList(),
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        eventTimeSlotId = eventTimeSlotId?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun RentalFieldDto.toFieldOrNull(
    fallbackFieldId: String?,
    fallbackOrganizationId: String?,
    fallbackFacilityId: String? = null,
    fallbackFacility: Facility? = null,
): Field? {
    val resolvedId = (id ?: legacyId ?: fallbackFieldId)?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedFacility = facility?.toFacilityOrNull() ?: fallbackFacility
    return Field(
        fieldNumber = fieldNumber ?: 0,
        divisions = divisions.normalizeStringList(),
        lat = lat,
        long = long,
        heading = heading,
        inUse = inUse,
        name = name,
        rentalSlotIds = rentalSlotIds.normalizeStringList(),
        location = location,
        organizationId = organizationId?.trim()?.takeIf(String::isNotBlank)
            ?: fallbackOrganizationId?.trim()?.takeIf(String::isNotBlank),
        id = resolvedId,
    ).also { field ->
        field.facilityId = facilityId?.trim()?.takeIf(String::isNotBlank)
            ?: fallbackFacilityId?.trim()?.takeIf(String::isNotBlank)
            ?: resolvedFacility?.resolvedId?.takeIf(String::isNotBlank)
        field.facility = resolvedFacility
    }
}

private fun RentalFacilityDto.toFacilityOrNull(): Facility? {
    val resolvedId = (id ?: legacyId)?.trim().orEmpty()
    val resolvedName = name?.trim()?.takeIf(String::isNotBlank)
    val resolvedLocation = location?.trim()?.takeIf(String::isNotBlank)
    val resolvedAddress = address?.trim()?.takeIf(String::isNotBlank)
    if (resolvedId.isBlank() && resolvedName == null && resolvedLocation == null && resolvedAddress == null) {
        return null
    }
    return Facility(
        id = resolvedId,
        legacyId = legacyId?.trim()?.takeIf(String::isNotBlank),
        name = resolvedName,
        location = resolvedLocation,
        address = resolvedAddress,
    )
}

private fun List<String>.normalizeStringList(): List<String> =
    map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

private fun EventTeamBillingUserDto.toUserOptionOrNull(): EventTeamBillingUserOption? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDisplayName = displayName?.trim()?.takeIf(String::isNotBlank) ?: resolvedId
    return EventTeamBillingUserOption(
        id = resolvedId,
        displayName = resolvedDisplayName,
    )
}

private fun EventTeamBillingBillDto.toBillOrNull(): EventTeamBillingBillSnapshot? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank)
        ?: legacyId?.trim()?.takeIf(String::isNotBlank)
        ?: return null
    val resolvedOwnerType = ownerType?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOwnerId = ownerId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOwnerName = ownerName?.trim()?.takeIf(String::isNotBlank) ?: resolvedOwnerId
    val resolvedTotalAmount = totalAmountCents ?: return null
    val resolvedPaid = paidAmountCents ?: 0
    val resolvedRefunded = refundedAmountCents ?: 0
    val resolvedRefundable = refundableAmountCents ?: 0

    return EventTeamBillingBillSnapshot(
        id = resolvedId,
        ownerType = resolvedOwnerType,
        ownerId = resolvedOwnerId,
        ownerName = resolvedOwnerName,
        totalAmountCents = resolvedTotalAmount,
        paidAmountCents = resolvedPaid,
        originalAmountCents = originalAmountCents ?: resolvedTotalAmount,
        discountAmountCents = discountAmountCents ?: 0,
        discountedAmountCents = discountedAmountCents ?: resolvedTotalAmount,
        discounts = discounts.mapNotNull { discount -> discount.toBillDiscountSummaryOrNull() },
        refundedAmountCents = resolvedRefunded,
        refundableAmountCents = resolvedRefundable,
        status = status?.trim()?.takeIf(String::isNotBlank),
        allowSplit = allowSplit,
        lineItems = lineItems.map { lineItem ->
            EventTeamBillingLineItem(
                id = lineItem.id?.trim()?.takeIf(String::isNotBlank),
                type = lineItem.type?.trim()?.takeIf(String::isNotBlank),
                label = lineItem.label?.trim()?.takeIf(String::isNotBlank),
                amountCents = lineItem.amountCents,
                quantity = lineItem.quantity,
            )
        },
        payments = payments.mapNotNull { payment -> payment.toPaymentOrNull() },
    )
}

private fun BillDiscountSummaryDto.toBillDiscountSummaryOrNull(): BillDiscountSummary? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountId = discountId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountCodeId = discountCodeId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedCode = code?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOriginal = originalAmountCents ?: return null
    val resolvedDiscounted = discountedAmountCents ?: return null
    return BillDiscountSummary(
        id = resolvedId,
        discountId = resolvedDiscountId,
        discountCodeId = resolvedDiscountCodeId,
        code = resolvedCode,
        name = name?.trim()?.takeIf(String::isNotBlank),
        originalAmountCents = resolvedOriginal.coerceAtLeast(0),
        discountedAmountCents = resolvedDiscounted.coerceAtLeast(0),
        discountAmountCents = (discountAmountCents ?: (resolvedOriginal - resolvedDiscounted)).coerceAtLeast(0),
        paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
        registrationId = registrationId?.trim()?.takeIf(String::isNotBlank),
    )
}

private fun EventTeamBillingPaymentDto.toPaymentOrNull(): EventTeamBillingPaymentSnapshot? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank)
        ?: legacyId?.trim()?.takeIf(String::isNotBlank)
        ?: return null
    val resolvedBillId = billId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedSequence = sequence ?: return null
    val resolvedAmountCents = amountCents ?: return null
    val resolvedRefunded = refundedAmountCents ?: 0
    val resolvedRefundable = refundableAmountCents ?: 0
    return EventTeamBillingPaymentSnapshot(
        id = resolvedId,
        billId = resolvedBillId,
        sequence = resolvedSequence,
        status = status?.trim()?.takeIf(String::isNotBlank),
        amountCents = resolvedAmountCents,
        paidAmountCents = paidAmountCents,
        refundedAmountCents = resolvedRefunded,
        refundableAmountCents = resolvedRefundable,
        paidAt = paidAt?.trim()?.takeIf(String::isNotBlank),
        paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
        isRefundable = isRefundable ?: false,
        manualPaymentProofs = manualPaymentProofs.mapNotNull { proof -> proof.toManualPaymentProofOrNull() },
    )
}

@Serializable
private data class BillPaymentApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val billId: String? = null,
    val sequence: Int? = null,
    val dueDate: String? = null,
    val amountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val status: String? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val payerUserId: String? = null,
    val manualPaymentProofs: List<ManualPaymentProofApiDto> = emptyList(),
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
            paidAmountCents = paidAmountCents,
            status = status,
            paidAt = paidAt,
            paymentIntentId = paymentIntentId,
            payerUserId = payerUserId,
            manualPaymentProofs = manualPaymentProofs.mapNotNull { proof -> proof.toManualPaymentProofOrNull() },
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
    val taxCategory: ProductTaxCategory = ProductTaxCategory.ONE_TIME_PRODUCT,
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
            taxCategory = taxCategory,
        )
    }
}

@Serializable
private data class OrganizationApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val description: String? = null,
    val logoId: String? = null,
    val ownerId: String? = null,
    val website: String? = null,
    val sports: List<String>? = null,
    val hasStripeAccount: Boolean? = null,
    val verificationStatus: String? = null,
    val verifiedAt: String? = null,
    val verificationReviewStatus: String? = null,
    val verificationReviewNotes: String? = null,
    val verificationReviewUpdatedAt: String? = null,
    val coordinates: List<Double>? = null,
    val fieldIds: List<String>? = null,
    val productIds: List<String>? = null,
    val teamIds: List<String>? = null,
    val publicSlug: String? = null,
    val publicPageEnabled: Boolean? = null,
    val staffMembers: List<OrganizationStaffMember>? = null,
    val staffInvites: List<Invite>? = null,
    val staffEmailsByUserId: Map<String, String>? = null,
    val viewerPermissions: List<String>? = null,
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
            address = address,
            description = description,
            logoId = logoId,
            ownerId = resolvedOwnerId,
            website = website,
            sports = sports
                ?.map(String::trim)
                ?.filter(String::isNotBlank)
                ?: emptyList(),
            hasStripeAccount = hasStripeAccount ?: false,
            verificationStatus = resolveOrganizationVerificationStatus(
                verificationStatus = verificationStatus,
                hasStripeAccount = hasStripeAccount,
            ),
            verifiedAt = verifiedAt?.trim()?.takeIf(String::isNotBlank),
            verificationReviewStatus = resolveOrganizationVerificationReviewStatus(
                reviewStatus = verificationReviewStatus,
            ),
            verificationReviewNotes = verificationReviewNotes?.trim()?.takeIf(String::isNotBlank),
            verificationReviewUpdatedAt = verificationReviewUpdatedAt?.trim()?.takeIf(String::isNotBlank),
            coordinates = coordinates,
            fieldIds = fieldIds ?: emptyList(),
            productIds = productIds ?: emptyList(),
            teamIds = teamIds ?: emptyList(),
            publicSlug = publicSlug?.trim()?.takeIf(String::isNotBlank),
            publicPageEnabled = publicPageEnabled ?: false,
            staffMembers = staffMembers ?: emptyList(),
            staffInvites = staffInvites ?: emptyList(),
            staffEmailsByUserId = staffEmailsByUserId ?: emptyMap(),
            viewerPermissions = viewerPermissions
                ?.map(String::trim)
                ?.filter(String::isNotBlank)
                ?: emptyList(),
        )
    }
}

@Serializable
private data class OrganizationTemplateApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val title: String? = null,
    val type: String? = null,
    val requiredSignerType: String? = null,
) {
    fun toOrganizationTemplateOrNull(): OrganizationTemplateDocument? {
        val resolvedId = (legacyId ?: id)?.trim()?.takeIf(String::isNotBlank) ?: return null
        val resolvedTitle = title?.trim()?.takeIf(String::isNotBlank) ?: "Untitled Template"
        val resolvedType = when (type?.trim()?.uppercase()) {
            "TEXT" -> "TEXT"
            else -> "PDF"
        }
        val resolvedSignerType = when (
            requiredSignerType?.trim()?.uppercase()?.replace('-', '_')?.replace(' ', '_')
                ?.replace('/', '_')
        ) {
            "PARENT_GUARDIAN" -> "PARENT_GUARDIAN"
            "CHILD" -> "CHILD"
            "PARENT_GUARDIAN_CHILD", "PARENT_GUARDIAN_AND_CHILD" -> "PARENT_GUARDIAN_CHILD"
            else -> "PARTICIPANT"
        }
        return OrganizationTemplateDocument(
            id = resolvedId,
            title = resolvedTitle,
            type = resolvedType,
            requiredSignerType = resolvedSignerType,
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
    val requiredSignerType: String? = null,
    val requiredSignerLabel: String? = null,
    val url: String? = null,
    val signingUrl: String? = null,
    val boldSignUrl: String? = null,
    val documentSigningUrl: String? = null,
    val documentId: String? = null,
    @SerialName("documentID") val legacyDocumentId: String? = null,
    val operationId: String? = null,
    val syncStatus: String? = null,
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
    val checkoutMode: String? = null,
    val checkoutUrl: String? = null,
    val checkoutSessionId: String? = null,
    val registrationId: String? = null,
    val registrationHoldExpiresAt: String? = null,
    val registrationHoldTtlSeconds: Int? = null,
    val taxCalculationId: String? = null,
    val taxCategory: String? = null,
    val taxMode: String? = null,
    val taxReasonCode: String? = null,
    val taxJurisdictionState: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val billId: String? = null,
    val billPaymentId: String? = null,
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
data class DiscountPreview(
    val code: String? = null,
    val applied: Boolean = false,
    val originalAmountCents: Int = 0,
    val discountAmountCents: Int = 0,
    val discountedAmountCents: Int = 0,
    val discountId: String? = null,
    val discountCodeId: String? = null,
    val error: String? = null,
)

@Serializable
data class FeeBreakdown(
    val eventPrice: Int,
    val stripeFee: Int,
    val stripeProcessingFee: Int? = null,
    val stripeTaxServiceFee: Int? = null,
    val processingFee: Int,
    val mvpFee: Int? = null,
    val taxAmount: Int? = null,
    val purchaseType: String? = null,
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
