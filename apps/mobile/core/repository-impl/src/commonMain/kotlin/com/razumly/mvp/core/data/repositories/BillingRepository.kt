package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
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
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import kotlinx.coroutines.flow.Flow

class BillingRepository(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
    private val eventRepository: IEventRepository,
    private val databaseService: DatabaseService,
) : IBillingRepository {
    private val checkoutCoordinator = BillingCheckoutCoordinator(
        api = api,
        userRepository = userRepository,
    )
    private val signingCoordinator = BillingSigningCoordinator(
        api = api,
        userRepository = userRepository,
    )
    private val rentalOrderCoordinator = BillingRentalOrderCoordinator(
        api = api,
        userRepository = userRepository,
        databaseService = databaseService,
    )
    private val paymentCoordinator = BillingPaymentCoordinator(
        api = api,
        userRepository = userRepository,
    )
    private val productCoordinator = BillingProductCoordinator(
        api = api,
        userRepository = userRepository,
        databaseService = databaseService,
    )
    private val discountCoordinator = BillingDiscountCoordinator(
        api = api,
        databaseService = databaseService,
    )
    private val organizationCoordinator = BillingOrganizationCoordinator(
        api = api,
        databaseService = databaseService,
    )
    private val refundCoordinator = BillingRefundCoordinator(
        api = api,
        userRepository = userRepository,
        eventRepository = eventRepository,
        databaseService = databaseService,
    )

    override suspend fun quoteInclusivePrice(
        direction: InclusivePriceQuoteDirection,
        amountCents: Int,
        eventType: String?,
    ): Result<InclusivePriceQuote> = checkoutCoordinator.quoteInclusivePrice(direction, amountCents, eventType)

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
    ): Result<PurchaseIntent> = checkoutCoordinator.createPurchaseIntent(
        event = event,
        teamId = teamId,
        priceCents = priceCents,
        timeSlotContext = timeSlotContext,
        occurrence = occurrence,
        divisionId = divisionId,
        answers = answers,
        discountCode = discountCode,
    )

    override suspend fun previewEventRegistrationDiscount(
        event: Event,
        teamId: String?,
        priceCents: Int?,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        discountCode: String,
    ): Result<DiscountPreview> = checkoutCoordinator.previewEventRegistrationDiscount(
        event = event,
        teamId = teamId,
        priceCents = priceCents,
        occurrence = occurrence,
        divisionId = divisionId,
        discountCode = discountCode,
    )

    override suspend fun createTeamRegistrationPurchaseIntent(
        team: Team,
        teamRegistration: TeamPlayerRegistration?,
        discountCode: String?,
    ): Result<PurchaseIntent> = checkoutCoordinator.createTeamRegistrationPurchaseIntent(
        team = team,
        teamRegistration = teamRegistration,
        discountCode = discountCode,
    )

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
    ): Result<List<SignStep>> = signingCoordinator.getRequiredEventSignLinks(
        eventId = eventId,
        signerContext = signerContext,
        childUserId = childUserId,
        childUserEmail = childUserEmail,
    )

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
    ): Result<List<SignStep>> = signingCoordinator.getRequiredTeamSignLinks(
        teamId = teamId,
        signerContext = signerContext,
        childUserId = childUserId,
        childUserEmail = childUserEmail,
    )

    override suspend fun getRequiredRentalSignLinks(
        templateIds: List<String>,
        eventId: String?,
        organizationId: String?,
    ): Result<List<SignStep>> = signingCoordinator.getRequiredRentalSignLinks(
        templateIds = templateIds,
        eventId = eventId,
        organizationId = organizationId,
    )

    override suspend fun prepareRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String,
        payerUserId: String,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<String> = rentalOrderCoordinator.prepareRentalOrder(
        publicSlug = publicSlug,
        eventId = eventId,
        selections = selections,
        paymentIntentId = paymentIntentId,
        payerUserId = payerUserId,
        renterOrganizationId = renterOrganizationId,
        sportId = sportId,
    )

    override suspend fun discardPreparedRentalOrder(orderId: String): Result<Unit> =
        rentalOrderCoordinator.discardPreparedRentalOrder(orderId)

    override suspend fun createRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String?,
        payerUserId: String?,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<RentalOrderResult> = rentalOrderCoordinator.createRentalOrder(
        publicSlug = publicSlug,
        eventId = eventId,
        selections = selections,
        paymentIntentId = paymentIntentId,
        payerUserId = payerUserId,
        renterOrganizationId = renterOrganizationId,
        sportId = sportId,
    )

    override suspend fun syncPendingRentalOrders(): Result<Int> = rentalOrderCoordinator.syncPendingRentalOrders()

    override suspend fun listRentalResourceOptions(
        eventId: String?,
        organizationId: String?,
    ): Result<List<RentalResourceOption>> = rentalOrderCoordinator.listRentalResourceOptions(
        eventId = eventId,
        organizationId = organizationId,
    )

    override suspend fun recordSignature(
        eventId: String,
        templateId: String,
        documentId: String,
        type: String,
        signerContext: SignerContext,
        childUserId: String?,
    ): Result<RecordSignatureResult> = signingCoordinator.recordSignature(
        eventId = eventId,
        teamId = null,
        templateId = templateId,
        documentId = documentId,
        type = type,
        signerContext = signerContext,
        childUserId = childUserId,
    )

    override suspend fun recordTeamSignature(
        teamId: String,
        templateId: String,
        documentId: String,
        type: String,
        signerContext: SignerContext,
        childUserId: String?,
    ): Result<RecordSignatureResult> = signingCoordinator.recordSignature(
        eventId = null,
        teamId = teamId,
        templateId = templateId,
        documentId = documentId,
        type = type,
        signerContext = signerContext,
        childUserId = childUserId,
    )

    override suspend fun pollBoldSignOperation(
        operationId: String,
        timeoutMillis: Long,
        intervalMillis: Long,
    ): Result<BoldSignOperationStatus> =
        signingCoordinator.pollBoldSignOperation(operationId, timeoutMillis, intervalMillis)

    override suspend fun listProfileDocuments(): Result<ProfileDocumentsBundle> =
        signingCoordinator.listProfileDocuments()

    override suspend fun createAccount(): Result<String> = signingCoordinator.createAccount()

    override suspend fun getOnboardingLink(): Result<String> = signingCoordinator.getOnboardingLink()

    override suspend fun listBills(ownerType: String, ownerId: String, limit: Int): Result<List<Bill>> =
        paymentCoordinator.listBills(ownerType = ownerType, ownerId = ownerId, limit = limit)

    override suspend fun listBillsPage(
        ownerType: String,
        ownerId: String,
        limit: Int,
        offset: Int,
    ): Result<RepositoryPage<Bill>> = paymentCoordinator.listBillsPage(
        ownerType = ownerType,
        ownerId = ownerId,
        limit = limit,
        offset = offset,
    )

    override suspend fun createBill(request: CreateBillRequest): Result<Bill> =
        paymentCoordinator.createBill(request)

    override suspend fun getBillPayments(billId: String): Result<List<BillPayment>> =
        paymentCoordinator.getBillPayments(billId)

    override suspend fun getEventTeamBillingSnapshot(
        eventId: String,
        teamId: String,
    ): Result<EventTeamBillingSnapshot> = paymentCoordinator.getEventTeamBillingSnapshot(
        eventId = eventId,
        teamId = teamId,
    )

    override suspend fun createEventTeamBill(
        eventId: String,
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Bill> = paymentCoordinator.createEventTeamBill(
        eventId = eventId,
        teamId = teamId,
        request = request,
    )

    override suspend fun createEventTeamPaymentCheckout(
        eventId: String,
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout> = paymentCoordinator.createEventTeamPaymentCheckout(
        eventId = eventId,
        teamId = teamId,
        request = request,
    )

    override suspend fun refundEventTeamBillPayment(
        eventId: String,
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit> = paymentCoordinator.refundEventTeamBillPayment(
        eventId = eventId,
        teamId = teamId,
        billPaymentId = billPaymentId,
        amountCents = amountCents,
    )

    override suspend fun createBillingIntent(
        billId: String,
        billPaymentId: String,
    ): Result<PurchaseIntent> = paymentCoordinator.createBillingIntent(
        billId = billId,
        billPaymentId = billPaymentId,
    )

    override suspend fun markBillingPaymentProcessing(
        billId: String,
        billPaymentId: String,
        paymentIntent: String,
    ): Result<Bill> = paymentCoordinator.markBillingPaymentProcessing(
        billId = billId,
        billPaymentId = billPaymentId,
        paymentIntent = paymentIntent,
    )

    override suspend fun cancelBillPayment(
        billId: String,
        billPaymentId: String,
    ): Result<Bill> = paymentCoordinator.cancelBillPayment(
        billId = billId,
        billPaymentId = billPaymentId,
    )

    override suspend fun submitManualPaymentProof(
        billId: String,
        billPaymentId: String,
        fileId: String,
    ): Result<ManualPaymentProof> = paymentCoordinator.submitManualPaymentProof(
        billId = billId,
        billPaymentId = billPaymentId,
        fileId = fileId,
    )

    override suspend fun reviewManualPaymentProof(
        billId: String,
        billPaymentId: String,
        proofId: String,
        decision: String,
        amountAcceptedCents: Int?,
        reviewNote: String?,
    ): Result<Bill> = paymentCoordinator.reviewManualPaymentProof(
        billId = billId,
        billPaymentId = billPaymentId,
        proofId = proofId,
        decision = decision,
        amountAcceptedCents = amountAcceptedCents,
        reviewNote = reviewNote,
    )

    override suspend fun getBillingAddress(): Result<BillingAddressProfile> =
        paymentCoordinator.getBillingAddress()

    override suspend fun updateBillingAddress(address: BillingAddressDraft): Result<BillingAddressProfile> =
        paymentCoordinator.updateBillingAddress(address)

    override suspend fun listSubscriptions(userId: String, limit: Int): Result<List<Subscription>> =
        paymentCoordinator.listSubscriptions(userId = userId, limit = limit)

    override suspend fun cancelSubscription(subscriptionId: String): Result<Boolean> =
        paymentCoordinator.cancelSubscription(subscriptionId)

    override suspend fun restartSubscription(subscriptionId: String): Result<Boolean> =
        paymentCoordinator.restartSubscription(subscriptionId)

    override suspend fun getProductsByIds(productIds: List<String>): Result<List<Product>> =
        productCoordinator.getProductsByIds(productIds)

    override suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>> =
        productCoordinator.listProductsByOrganization(organizationId)

    override suspend fun createProductPurchaseIntent(productId: String): Result<PurchaseIntent> =
        productCoordinator.createProductPurchaseIntent(productId = productId, discountCode = null)

    override suspend fun createProductPurchaseIntent(
        productId: String,
        discountCode: String?,
    ): Result<PurchaseIntent> = productCoordinator.createProductPurchaseIntent(
        productId = productId,
        discountCode = discountCode,
    )

    override suspend fun createProductSubscriptionIntent(productId: String): Result<PurchaseIntent> =
        productCoordinator.createProductSubscriptionIntent(productId = productId, discountCode = null)

    override suspend fun createProductSubscriptionIntent(
        productId: String,
        discountCode: String?,
    ): Result<PurchaseIntent> = productCoordinator.createProductSubscriptionIntent(
        productId = productId,
        discountCode = discountCode,
    )

    override suspend fun createProductSubscription(
        productId: String,
        organizationId: String?,
        priceCents: Int?,
        startDate: String?,
    ): Result<Subscription> = productCoordinator.createProductSubscription(
        productId = productId,
        organizationId = organizationId,
        priceCents = priceCents,
        startDate = startDate,
    )

    override fun observeDiscounts(ownerType: String, ownerId: String?): Flow<List<DiscountOffer>> =
        discountCoordinator.observeDiscounts(ownerType, ownerId)

    override suspend fun listDiscounts(ownerType: String, ownerId: String?): Result<List<DiscountOffer>> =
        discountCoordinator.listDiscounts(ownerType, ownerId)

    override fun observeDiscountTargets(
        ownerType: String,
        ownerId: String?,
        itemType: String,
    ): Flow<List<DiscountTarget>> = discountCoordinator.observeDiscountTargets(ownerType, ownerId, itemType)

    override suspend fun listDiscountTargets(
        ownerType: String,
        ownerId: String?,
        itemType: String,
        query: String?,
    ): Result<List<DiscountTarget>> = discountCoordinator.listDiscountTargets(ownerType, ownerId, itemType, query)

    override suspend fun createDiscount(
        ownerType: String,
        ownerId: String?,
        name: String,
        description: String?,
        targetType: String,
        targetId: String,
        discountedPriceCents: Int,
    ): Result<DiscountOffer> = discountCoordinator.createDiscount(
        ownerType,
        ownerId,
        name,
        description,
        targetType,
        targetId,
        discountedPriceCents,
    )

    override suspend fun generateDiscountCode(
        discountId: String,
        code: String?,
        usageLimit: Int?,
    ): Result<DiscountCode> = discountCoordinator.generateDiscountCode(discountId, code, usageLimit)

    override suspend fun updateDiscountCodeStatus(
        discountId: String,
        codeId: String,
        status: String,
    ): Result<DiscountCode> = discountCoordinator.updateDiscountCodeStatus(discountId, codeId, status)

    override suspend fun deleteDiscountCode(
        discountId: String,
        codeId: String,
    ): Result<Unit> = discountCoordinator.deleteDiscountCode(discountId, codeId)

    override suspend fun listOrganizations(
        limit: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
    ): Result<List<Organization>> =
        organizationCoordinator.listOrganizations(limit, includeAffiliateRentals, tagSlugs)

    override suspend fun listOrganizationsPage(
        limit: Int,
        offset: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
    ): Result<RepositoryPage<Organization>> =
        organizationCoordinator.listOrganizationsPage(limit, offset, includeAffiliateRentals, tagSlugs)

    override suspend fun searchOrganizations(
        query: String,
        limit: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
    ): Result<List<Organization>> =
        organizationCoordinator.searchOrganizations(query, limit, includeAffiliateRentals, tagSlugs)

    override suspend fun getOrganizationTags(query: String?, filterOnly: Boolean): Result<List<EventTag>> =
        organizationCoordinator.getOrganizationTags(query, filterOnly)

    override suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> =
        organizationCoordinator.getOrganizationsByIds(organizationIds)

    override suspend fun getOrganizationReviews(
        organizationId: String,
        cursor: String?,
        limit: Int,
    ): Result<OrganizationReviewsPayload> =
        organizationCoordinator.getOrganizationReviews(organizationId, cursor, limit)

    override suspend fun saveOrganizationReview(
        organizationId: String,
        rating: Int,
        body: String?,
    ): Result<OrganizationReviewsPayload> =
        organizationCoordinator.saveOrganizationReview(organizationId, rating, body)

    override suspend fun deleteOrganizationReview(
        organizationId: String,
        reviewId: String,
    ): Result<OrganizationReviewsPayload> =
        organizationCoordinator.deleteOrganizationReview(organizationId, reviewId)

    override suspend fun reportOrganizationReview(reviewId: String): Result<Unit> =
        organizationCoordinator.reportOrganizationReview(reviewId)

    override suspend fun listOrganizationTemplates(
        organizationId: String,
    ): Result<List<OrganizationTemplateDocument>> =
        organizationCoordinator.listOrganizationTemplates(organizationId)

    override suspend fun leaveAndRefundEvent(event: Event, reason: String, targetUserId: String?): Result<Unit> =
        refundCoordinator.leaveAndRefundEvent(event, reason, targetUserId)

    override suspend fun deleteAndRefundEvent(event: Event): Result<Unit> =
        refundCoordinator.deleteAndRefundEvent(event)

    override suspend fun getRefundsWithRelations(): Result<List<RefundRequestWithRelations>> =
        refundCoordinator.getRefundsWithRelations()

    override suspend fun getRefunds(): Result<List<RefundRequest>> = refundCoordinator.getRefunds()

    override suspend fun approveRefund(refundRequest: RefundRequest): Result<Unit> =
        refundCoordinator.approveRefund(refundRequest)

    override suspend fun rejectRefund(refundId: String): Result<Unit> =
        refundCoordinator.rejectRefund(refundId)
}
