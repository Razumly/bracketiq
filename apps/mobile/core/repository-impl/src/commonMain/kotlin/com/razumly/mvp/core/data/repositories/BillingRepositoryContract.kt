package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.ManualPaymentProof
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

private const val BOLD_SIGN_RATE_LIMIT_FRIENDLY_MESSAGE =
    "You opened the BoldSign document too many times. Please wait a minute before trying again."
private const val MAX_INCLUSIVE_PRICE_CENTS = 100_000_000
private const val CATALOG_RESOURCE_ORGANIZATIONS = "organizations"
private const val CATALOG_RESOURCE_PRODUCTS = "products"
private const val ORGANIZATION_PROJECTION_DETAIL = "detail"
private const val ORGANIZATION_PROJECTION_PUBLIC = "public"
private const val PRODUCT_PROJECTION_FULL = "full"
// The review mutation routes return getOrganizationReviewsPayload() with the backend's default 50.
private const val MUTATED_REVIEW_FIRST_PAGE_LIMIT = 50

/** The payment succeeded, but the server has rejected its idempotent rental booking mutation. */
interface IBillingRepository : IMVPRepository {
    suspend fun quoteInclusivePrice(
        direction: InclusivePriceQuoteDirection,
        amountCents: Int,
        eventType: String? = null,
    ): Result<InclusivePriceQuote> =
        Result.failure(UnsupportedOperationException("Inclusive price quotes are not supported."))
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
        payerUserId: String? = null,
        renterOrganizationId: String? = null,
        sportId: String? = null,
    ): Result<RentalOrderResult> = Result.failure(UnsupportedOperationException("Rental orders are not supported."))
    suspend fun prepareRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String,
        payerUserId: String,
        renterOrganizationId: String? = null,
        sportId: String? = null,
    ): Result<String> = Result.failure(UnsupportedOperationException("Rental orders are not supported."))
    suspend fun discardPreparedRentalOrder(orderId: String): Result<Unit> = Result.success(Unit)
    suspend fun syncPendingRentalOrders(): Result<Int> = Result.success(0)
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
    suspend fun listBillsPage(
        ownerType: String,
        ownerId: String,
        limit: Int = 100,
        offset: Int = 0,
    ): Result<RepositoryPage<Bill>> {
        val normalizedLimit = limit.coerceAtLeast(1)
        val normalizedOffset = offset.coerceAtLeast(0)
        val prefixLimit = (normalizedOffset.toLong() + normalizedLimit.toLong())
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()
        return listBills(ownerType = ownerType, ownerId = ownerId, limit = prefixLimit).map { prefix ->
            val items = prefix.drop(normalizedOffset).take(normalizedLimit)
            RepositoryPage(
                items = items,
                pagination = RepositoryPagination(
                    limit = normalizedLimit,
                    offset = normalizedOffset,
                    nextOffset = normalizedOffset + items.size,
                    hasMore = prefix.size >= prefixLimit,
                ),
            )
        }
    }
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
    suspend fun listOrganizations(
        limit: Int = 100,
        includeAffiliateRentals: Boolean = false,
        tagSlugs: Set<String> = emptySet(),
    ): Result<List<Organization>>
    suspend fun listOrganizationsPage(
        limit: Int = 100,
        offset: Int = 0,
        includeAffiliateRentals: Boolean = false,
        tagSlugs: Set<String> = emptySet(),
    ): Result<RepositoryPage<Organization>> =
        listOrganizations(limit = limit, includeAffiliateRentals = includeAffiliateRentals, tagSlugs = tagSlugs)
            .map { organizations ->
                RepositoryPage(
                    items = organizations,
                    pagination = RepositoryPagination(
                        limit = limit,
                        offset = offset,
                        nextOffset = offset + organizations.size,
                        hasMore = organizations.size >= limit,
                    ),
                )
            }
    suspend fun listOrganizationsPage(
        limit: Int,
        offset: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
        price: Pair<Double, Double>?,
        divisionGenders: Set<String>,
        skillDivisionTypeIds: Set<String>,
        ageDivisionTypeIds: Set<String>,
    ): Result<RepositoryPage<Organization>> = listOrganizationsPage(
        limit = limit,
        offset = offset,
        includeAffiliateRentals = includeAffiliateRentals,
        tagSlugs = tagSlugs,
    )
    suspend fun searchOrganizations(
        query: String,
        limit: Int = 10,
        includeAffiliateRentals: Boolean = false,
        tagSlugs: Set<String> = emptySet(),
    ): Result<List<Organization>> =
        listOrganizations(limit = limit, includeAffiliateRentals = includeAffiliateRentals, tagSlugs = tagSlugs)
    suspend fun getOrganizationTags(query: String? = null, filterOnly: Boolean = false): Result<List<EventTag>> =
        Result.success(emptyList())
    suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>>
    suspend fun getOrganizationReviews(
        organizationId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): Result<OrganizationReviewsPayload> =
        Result.failure(UnsupportedOperationException("Organization reviews are not available."))
    suspend fun saveOrganizationReview(
        organizationId: String,
        rating: Int,
        body: String?,
    ): Result<OrganizationReviewsPayload> =
        Result.failure(UnsupportedOperationException("Organization reviews are not available."))
    suspend fun deleteOrganizationReview(
        organizationId: String,
        reviewId: String,
    ): Result<OrganizationReviewsPayload> =
        Result.failure(UnsupportedOperationException("Organization reviews are not available."))
    suspend fun reportOrganizationReview(reviewId: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("Organization review reporting is not available."))
    suspend fun listOrganizationTemplates(organizationId: String): Result<List<OrganizationTemplateDocument>>
    suspend fun leaveAndRefundEvent(event: Event, reason: String, targetUserId: String? = null): Result<Unit>
    suspend fun deleteAndRefundEvent(event: Event): Result<Unit>
    suspend fun listProfileDocuments(): Result<ProfileDocumentsBundle>

    suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>>
    suspend fun getRefunds(): Result<List<RefundRequest>>
    suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit>
    suspend fun rejectRefund(refundId: String): Result<Unit>
}
