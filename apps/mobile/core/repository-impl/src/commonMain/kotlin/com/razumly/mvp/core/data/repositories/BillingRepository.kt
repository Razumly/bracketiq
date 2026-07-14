package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.dataTypes.DiscountCodeCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountOfferCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountTargetCacheEntry
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.ManualPaymentProof
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationCacheEntry
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsCacheEntry
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.normalizedEventTags
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundRequestWithRelations
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillingEventRefDto
import com.razumly.mvp.core.network.dto.BillingRefundRequestDto
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.OrganizationApiDto
import com.razumly.mvp.core.network.dto.OrganizationsResponseDto
import com.razumly.mvp.core.network.dto.RefundAllRequestDto
import com.razumly.mvp.core.network.dto.RefundRequestsResponseDto
import com.razumly.mvp.core.network.dto.UpdateRefundRequestDto
import com.razumly.mvp.core.util.jsonMVP
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

private const val CATALOG_RESOURCE_ORGANIZATIONS = "organizations"
private const val ORGANIZATION_PROJECTION_DETAIL = "detail"
private const val ORGANIZATION_PROJECTION_PUBLIC = "public"
// The review mutation routes return getOrganizationReviewsPayload() with the backend's default 50.
private const val MUTATED_REVIEW_FIRST_PAGE_LIMIT = 50

private fun Organization.toCacheEntry(
    scope: CatalogCacheScope,
    projectionKey: String,
): OrganizationCacheEntry = OrganizationCacheEntry(
    viewerKey = scope.viewerKey,
    projectionKey = projectionKey,
    organizationId = id,
    payloadJson = jsonMVP.encodeToString(this),
)

private fun organizationReviewsCacheKey(
    scope: CatalogCacheScope,
    organizationId: String,
    cursorKey: String,
    pageLimit: Int,
): String = catalogCacheKey(
    scope,
    "organization-reviews",
    "full",
    organizationId,
    cursorKey,
    pageLimit.toString(),
)

private fun OrganizationReviewsPayload.toCacheEntry(
    scope: CatalogCacheScope,
    organizationId: String,
    cursorKey: String,
    pageLimit: Int,
): OrganizationReviewsCacheEntry = OrganizationReviewsCacheEntry(
    cacheKey = organizationReviewsCacheKey(scope, organizationId, cursorKey, pageLimit),
    viewerKey = scope.viewerKey,
    organizationId = organizationId,
    cursorKey = cursorKey,
    pageLimit = pageLimit,
    payloadJson = jsonMVP.encodeToString(this),
)

private fun OrganizationReviewsCacheEntry.toPayload(): OrganizationReviewsPayload =
    jsonMVP.decodeFromString(payloadJson)

private fun List<Organization>.toOrganizationQueryEntry(
    cacheKey: String,
    scope: CatalogCacheScope,
    projectionKey: String,
    pagination: RepositoryPagination? = null,
): CatalogQueryCacheEntry = CatalogQueryCacheEntry(
    cacheKey = cacheKey,
    viewerKey = scope.viewerKey,
    resourceType = CATALOG_RESOURCE_ORGANIZATIONS,
    projectionKey = projectionKey,
    orderedIdsJson = jsonMVP.encodeToString(map(Organization::id)),
    payloadJson = jsonMVP.encodeToString(this),
    paginationJson = pagination?.let { value -> jsonMVP.encodeToString(value) },
    isComplete = pagination?.hasMore != true,
)

private fun CatalogQueryCacheEntry.toOrganizations(): List<Organization> {
    require(resourceType == CATALOG_RESOURCE_ORGANIZATIONS) {
        "Cached organization query has the wrong resource type."
    }
    val organizations = jsonMVP.decodeFromString<List<Organization>>(payloadJson)
    val orderedIds = jsonMVP.decodeFromString<List<String>>(orderedIdsJson)
    require(orderedIds == organizations.map(Organization::id)) {
        "Cached organization ordering metadata does not match its payload."
    }
    return organizations
}
private fun CatalogQueryCacheEntry.toOrganizationPage(): RepositoryPage<Organization> {
    val pagination = paginationJson?.let { jsonMVP.decodeFromString<RepositoryPagination>(it) }
        ?: error("Cached organization page is missing pagination metadata.")
    require(isComplete == !pagination.hasMore) {
        "Cached organization pagination completeness is inconsistent."
    }
    return RepositoryPage(items = toOrganizations(), pagination = pagination)
}

private fun CatalogQueryCacheEntry?.orderedCatalogIdsOrEmpty(): List<String> = this?.let { snapshot ->
    jsonMVP.decodeFromString<List<String>>(snapshot.orderedIdsJson)
}.orEmpty()

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

    override suspend fun listOrganizations(
        limit: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
    ): Result<List<Organization>> =
        listOrganizationsPage(
            limit = limit,
            offset = 0,
            includeAffiliateRentals = includeAffiliateRentals,
            tagSlugs = tagSlugs,
        ).map { page -> page.items }

    override suspend fun listOrganizationsPage(
        limit: Int,
        offset: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
    ): Result<RepositoryPage<Organization>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 200)
        val normalizedOffset = offset.coerceAtLeast(0)
        val affiliateParam = if (includeAffiliateRentals) "&includeAffiliateRentals=true" else ""
        val tagsParam = tagSlugs.toOrganizationTagsQueryParam()
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            CATALOG_RESOURCE_ORGANIZATIONS,
            ORGANIZATION_PROJECTION_PUBLIC,
            "list",
            normalizedLimit.toString(),
            normalizedOffset.toString(),
            includeAffiliateRentals.toString(),
            *tagSlugs.map(String::trim).filter(String::isNotBlank).sorted().toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedCatalogIdsOrEmpty()
        val refreshedPage = try {
            val response = scope.api.get<OrganizationsResponseDto>(
                path = "api/organizations?limit=$normalizedLimit&offset=$normalizedOffset$affiliateParam$tagsParam",
            )
            val organizations = response.organizations.toOrganizationsStrict("Organization list")
            RepositoryPage(
                items = organizations,
                pagination = response.pagination.toRepositoryPagination(
                    fallbackLimit = normalizedLimit,
                    fallbackOffset = normalizedOffset,
                    fallbackItemCount = organizations.size,
                ),
            )
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizationPage()
                ?: throw error
        }
        val snapshot = refreshedPage.items.toOrganizationQueryEntry(
            cacheKey = cacheKey,
            scope = scope,
            projectionKey = ORGANIZATION_PROJECTION_PUBLIC,
            pagination = refreshedPage.pagination,
        )
        val refreshedIds = refreshedPage.items.map(Organization::id).toSet()
        dao.replaceOrganizationQuery(
            snapshot = snapshot,
            entries = refreshedPage.items.map { organization ->
                organization.toCacheEntry(scope, ORGANIZATION_PROJECTION_PUBLIC)
            },
            staleOrganizationIds = previousIds.filterNot(refreshedIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizationPage()
            ?: error("Organization page cache was not written.")
    }

    override suspend fun searchOrganizations(
        query: String,
        limit: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
    ): Result<List<Organization>> = runCatching {
        val normalizedQuery = query.trim()
        if (normalizedQuery.isEmpty()) return@runCatching emptyList()

        val normalizedLimit = limit.coerceIn(1, 100)
        val encodedQuery = normalizedQuery.encodeURLQueryComponent()
        val affiliateParam = if (includeAffiliateRentals) "&includeAffiliateRentals=true" else ""
        val tagsParam = tagSlugs.toOrganizationTagsQueryParam()
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            CATALOG_RESOURCE_ORGANIZATIONS,
            ORGANIZATION_PROJECTION_PUBLIC,
            "search",
            normalizedQuery,
            normalizedLimit.toString(),
            includeAffiliateRentals.toString(),
            *tagSlugs.map(String::trim).filter(String::isNotBlank).sorted().toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedCatalogIdsOrEmpty()
        val responseAndOrganizations = try {
            val response = scope.api.get<OrganizationsResponseDto>(
                path = "api/organizations?query=$encodedQuery&limit=$normalizedLimit$affiliateParam$tagsParam",
            )
            response to response.organizations.toOrganizationsStrict("Organization search")
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizations()
                ?: throw error
        }
        val (response, organizations) = responseAndOrganizations
        val pagination = response.pagination.toRepositoryPagination(
            fallbackLimit = normalizedLimit,
            fallbackOffset = 0,
            fallbackItemCount = organizations.size,
        )
        val snapshot = organizations.toOrganizationQueryEntry(
            cacheKey,
            scope,
            ORGANIZATION_PROJECTION_PUBLIC,
            pagination,
        )
        val refreshedIds = organizations.map(Organization::id).toSet()
        dao.replaceOrganizationQuery(
            snapshot = snapshot,
            entries = organizations.map { organization ->
                organization.toCacheEntry(scope, ORGANIZATION_PROJECTION_PUBLIC)
            },
            staleOrganizationIds = previousIds.filterNot(refreshedIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizations()
            ?: error("Organization search cache was not written.")
    }

    override suspend fun getOrganizationTags(query: String?, filterOnly: Boolean): Result<List<EventTag>> = runCatching {
        val normalizedQuery = query?.trim().orEmpty()
        val path = buildString {
            append("api/organization-tags")
            val params = buildList {
                if (normalizedQuery.isNotEmpty()) {
                    add("query=${normalizedQuery.encodeURLQueryComponent()}")
                }
                if (filterOnly) {
                    add("filterOnly=true")
                }
            }
            if (params.isNotEmpty()) {
                append("?")
                append(params.joinToString("&"))
            }
        }
        api.get<OrganizationTagsResponseDto>(path).tags
            .map { tag -> tag.toEventTag() }
            .normalizedEventTags()
            .sortedWith(
                compareByDescending<EventTag> { tag -> tag.eventCount }
                    .thenBy { tag -> tag.name.lowercase() },
            )
    }

    override suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> = runCatching {
        val idChunks = collectionIdChunks(organizationIds)
        val ids = idChunks.flatten()
        if (ids.isEmpty()) return@runCatching emptyList()
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            CATALOG_RESOURCE_ORGANIZATIONS,
            ORGANIZATION_PROJECTION_DETAIL,
            "ids",
            *ids.toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedCatalogIdsOrEmpty()
        val organizations = try {
            val organizationsById = LinkedHashMap<String, Organization>()
            if (ids.size == 1) {
                val encodedId = ids.first().encodeURLQueryComponent()
                val response = scope.api.get<OrganizationApiDto>(path = "api/organizations/$encodedId")
                val organization = response.toOrganizationOrNull()
                    ?: error("Organization detail returned an invalid organization.")
                organizationsById[organization.id] = organization
            } else {
                for (idChunk in idChunks) {
                    val encodedIds = idChunk.joinToString(",") { it.encodeURLQueryComponent() }
                    val response = scope.api.get<OrganizationsResponseDto>(
                        path = "api/organizations?ids=$encodedIds&limit=${idChunk.size}",
                    )
                    response.organizations.toOrganizationsStrict("Organization id query").forEach { organization ->
                        organizationsById[organization.id] = organization
                    }
                }
            }
            ids.mapNotNull(organizationsById::get)
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizations()
                ?: throw error
        }
        val snapshot = organizations.toOrganizationQueryEntry(
            cacheKey,
            scope,
            ORGANIZATION_PROJECTION_DETAIL,
        )
        val refreshedIds = organizations.map(Organization::id).toSet()
        dao.replaceOrganizationQuery(
            snapshot = snapshot,
            entries = organizations.map { organization ->
                organization.toCacheEntry(scope, ORGANIZATION_PROJECTION_DETAIL)
            },
            staleOrganizationIds = previousIds.filterNot(refreshedIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizations()
            ?: error("Organization id query cache was not written.")
    }

    override suspend fun getOrganizationReviews(
        organizationId: String,
        cursor: String?,
        limit: Int,
    ): Result<OrganizationReviewsPayload> = runCatching {
        val normalizedId = organizationId.trim()
        require(normalizedId.isNotBlank()) { "Organization id is required." }
        val encodedId = normalizedId.encodeURLQueryComponent()
        val normalizedLimit = limit.coerceIn(1, 100)
        val cursorKey = cursor?.trim()?.takeIf(String::isNotBlank).orEmpty()
        val normalizedCursor = cursorKey.takeIf(String::isNotEmpty)
            ?.encodeURLQueryComponent(encodeFull = true)
        val path = buildString {
            append("api/organizations/$encodedId/reviews?limit=$normalizedLimit")
            normalizedCursor?.let { encodedCursor -> append("&cursor=$encodedCursor") }
        }
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = organizationReviewsCacheKey(scope, normalizedId, cursorKey, normalizedLimit)
        val payload = try {
            scope.api.get<OrganizationReviewsResponseDto>(path = path).toPayload()
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching dao.getOrganizationReviews(cacheKey, scope.viewerKey)?.toPayload()
                ?: throw error
        }
        dao.replaceOrganizationReviews(
            payload.toCacheEntry(scope, normalizedId, cursorKey, normalizedLimit),
        )
        dao.getOrganizationReviews(cacheKey, scope.viewerKey)?.toPayload()
            ?: error("Organization reviews cache was not written.")
    }

    override suspend fun saveOrganizationReview(
        organizationId: String,
        rating: Int,
        body: String?,
    ): Result<OrganizationReviewsPayload> = runCatching {
        val normalizedId = organizationId.trim()
        require(normalizedId.isNotBlank()) { "Organization id is required." }
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val payload = scope.api.post<OrganizationReviewRequestDto, OrganizationReviewsResponseDto>(
            path = "api/organizations/${normalizedId.encodeURLQueryComponent()}/reviews",
            body = OrganizationReviewRequestDto(rating = rating, body = body),
        ).toPayload()
        val entry = payload.toCacheEntry(
            scope,
            normalizedId,
            cursorKey = "",
            pageLimit = MUTATED_REVIEW_FIRST_PAGE_LIMIT,
        )
        dao.replaceFirstOrganizationReviewPage(entry)
        dao.getOrganizationReviews(entry.cacheKey, scope.viewerKey)?.toPayload()
            ?: error("Organization reviews cache was not written.")
    }

    override suspend fun deleteOrganizationReview(
        organizationId: String,
        reviewId: String,
    ): Result<OrganizationReviewsPayload> = runCatching {
        val normalizedOrganizationId = organizationId.trim()
        val encodedOrganizationId = normalizedOrganizationId.encodeURLQueryComponent()
        val encodedReviewId = reviewId.trim().encodeURLQueryComponent()
        require(encodedOrganizationId.isNotBlank() && encodedReviewId.isNotBlank()) {
            "Organization id and review id are required."
        }
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val payload = scope.api.delete<EmptyRequestDto, OrganizationReviewsResponseDto>(
            path = "api/organizations/$encodedOrganizationId/reviews/$encodedReviewId",
            body = EmptyRequestDto(),
        ).toPayload()
        val entry = payload.toCacheEntry(
            scope,
            normalizedOrganizationId,
            cursorKey = "",
            pageLimit = MUTATED_REVIEW_FIRST_PAGE_LIMIT,
        )
        dao.replaceFirstOrganizationReviewPage(entry)
        dao.getOrganizationReviews(entry.cacheKey, scope.viewerKey)?.toPayload()
            ?: error("Organization reviews cache was not written.")
    }

    override suspend fun reportOrganizationReview(reviewId: String): Result<Unit> = runCatching {
        val encodedReviewId = reviewId.trim()
        require(encodedReviewId.isNotBlank()) { "Review id is required." }
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        scope.api.postNoResponse(
            path = "api/moderation/reports",
            body = OrganizationReviewReportRequestDto(targetId = encodedReviewId),
        )
        dao.deleteOrganizationReviews(scope.viewerKey)
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
