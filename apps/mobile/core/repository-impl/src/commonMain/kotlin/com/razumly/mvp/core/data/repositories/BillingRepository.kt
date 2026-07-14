package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
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
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_PENDING
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import com.razumly.mvp.core.data.dataTypes.PendingRentalOrder
import com.razumly.mvp.core.data.dataTypes.normalizedEventTags
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.ProductCacheEntry
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
import com.razumly.mvp.core.network.dto.BillingRentalSelectionDto
import com.razumly.mvp.core.network.dto.BillingTeamRefDto
import com.razumly.mvp.core.network.dto.BillingTimeSlotRefDto
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.InclusivePriceQuoteRequestDto
import com.razumly.mvp.core.network.dto.InclusivePriceQuoteResponseDto
import com.razumly.mvp.core.network.dto.OrganizationApiDto
import com.razumly.mvp.core.network.dto.OrganizationsResponseDto
import com.razumly.mvp.core.network.dto.PurchaseIntentRequestDto
import com.razumly.mvp.core.network.dto.RefundAllRequestDto
import com.razumly.mvp.core.network.dto.RefundRequestsResponseDto
import com.razumly.mvp.core.network.dto.StripeHostLinkRequestDto
import com.razumly.mvp.core.network.dto.UpdateRefundRequestDto
import com.razumly.mvp.core.util.jsonMVP
import io.github.aakira.napier.Napier
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

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
@Serializable
private data class CachedProductPayload(
    val id: String,
    val name: String,
    val description: String? = null,
    val priceCents: Int,
    val period: String,
    val organizationId: String,
    val createdBy: String? = null,
    val isActive: Boolean? = null,
    val createdAt: String? = null,
    val stripeProductId: String? = null,
    val stripePriceId: String? = null,
    val taxCategory: ProductTaxCategory = ProductTaxCategory.ONE_TIME_PRODUCT,
)

private fun Product.toCachedPayload(): CachedProductPayload = CachedProductPayload(
    id = id,
    name = name,
    description = description,
    priceCents = priceCents,
    period = period,
    organizationId = organizationId,
    createdBy = createdBy,
    isActive = isActive,
    createdAt = createdAt,
    stripeProductId = stripeProductId,
    stripePriceId = stripePriceId,
    taxCategory = taxCategory,
)

private fun CachedProductPayload.toProduct(): Product = Product(
    id = id,
    name = name,
    description = description,
    priceCents = priceCents,
    period = period,
    organizationId = organizationId,
    createdBy = createdBy,
    isActive = isActive,
    createdAt = createdAt,
    stripeProductId = stripeProductId,
    stripePriceId = stripePriceId,
    taxCategory = taxCategory,
)

private fun Organization.toCacheEntry(
    scope: CatalogCacheScope,
    projectionKey: String,
): OrganizationCacheEntry = OrganizationCacheEntry(
    viewerKey = scope.viewerKey,
    projectionKey = projectionKey,
    organizationId = id,
    payloadJson = jsonMVP.encodeToString(this),
)

private fun Product.toCacheEntry(
    scope: CatalogCacheScope,
    projectionKey: String,
): ProductCacheEntry = ProductCacheEntry(
    viewerKey = scope.viewerKey,
    projectionKey = projectionKey,
    id = id,
    organizationId = organizationId,
    payloadJson = jsonMVP.encodeToString(toCachedPayload()),
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

private fun List<Product>.toProductQueryEntry(
    cacheKey: String,
    scope: CatalogCacheScope,
): CatalogQueryCacheEntry = CatalogQueryCacheEntry(
    cacheKey = cacheKey,
    viewerKey = scope.viewerKey,
    resourceType = CATALOG_RESOURCE_PRODUCTS,
    projectionKey = PRODUCT_PROJECTION_FULL,
    orderedIdsJson = jsonMVP.encodeToString(map(Product::id)),
    payloadJson = jsonMVP.encodeToString(map(Product::toCachedPayload)),
    paginationJson = null,
    isComplete = true,
)

private fun CatalogQueryCacheEntry.toProducts(): List<Product> {
    require(resourceType == CATALOG_RESOURCE_PRODUCTS && isComplete) {
        "Cached product query is not an exact complete snapshot."
    }
    val products = jsonMVP.decodeFromString<List<CachedProductPayload>>(payloadJson)
        .map(CachedProductPayload::toProduct)
    val orderedIds = jsonMVP.decodeFromString<List<String>>(orderedIdsJson)
    require(orderedIds == products.map(Product::id)) {
        "Cached product ordering metadata does not match its payload."
    }
    return products
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
    override suspend fun quoteInclusivePrice(
        direction: InclusivePriceQuoteDirection,
        amountCents: Int,
        eventType: String?,
    ): Result<InclusivePriceQuote> = runCatching {
        require(amountCents in 0..MAX_INCLUSIVE_PRICE_CENTS) {
            "Inclusive price amount must be between 0 and $MAX_INCLUSIVE_PRICE_CENTS cents."
        }
        val normalizedEventType = eventType?.trim()?.takeIf(String::isNotBlank)
        require(normalizedEventType == null || normalizedEventType.length <= 100) {
            "Inclusive price event type must be at most 100 characters."
        }

        api.post<InclusivePriceQuoteRequestDto, InclusivePriceQuoteResponseDto>(
            path = "api/billing/inclusive-price-quote",
            body = InclusivePriceQuoteRequestDto(
                direction = direction.name,
                amountCents = amountCents,
                eventType = normalizedEventType,
            ),
        ).toValidatedQuote(
            requestedDirection = direction,
            requestedAmountCents = amountCents,
        )
    }

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

        if (timeSlotContext == null) {
            AnalyticsTracker.capture(
                AnalyticsEvent.EventRegistrationStarted,
                buildMap {
                    put("event_id", event.id)
                    put("event_type", event.eventType.name)
                    put("registration_type", normalizedTeamId?.let { "team" } ?: "self")
                    put("amount_cents", effectivePriceCents.toString())
                    normalizedTeamId?.let { put("team_id", it) }
                    normalizedDivisionId?.let { put("division_id", it) }
                    event.organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
                },
            )
        } else {
            AnalyticsTracker.capture(
                AnalyticsEvent.RentalCheckoutStarted,
                buildMap {
                    put("event_id", event.id)
                    put("amount_cents", effectivePriceCents.toString())
                    timeSlotContext.scheduledFieldId?.trim()?.takeIf(String::isNotBlank)?.let { put("field_id", it) }
                    event.organizationId?.trim()?.takeIf(String::isNotBlank)?.let { put("organization_id", it) }
                },
            )
        }

        val normalizedRentalSelections = timeSlotContext
            ?.rentalSelections
            .orEmpty()
            .map { selection ->
                val scheduledFieldIds = selection.scheduledFieldIds
                    .map(String::trim)
                    .filter(String::isNotBlank)
                    .distinct()
                require(scheduledFieldIds.isNotEmpty()) {
                    "Every rental selection must include at least one field."
                }
                val startDate = selection.startDate.trim()
                val endDate = selection.endDate.trim()
                require(startDate.isNotBlank() && endDate.isNotBlank()) {
                    "Every rental selection must include a start and end time."
                }
                BillingRentalSelectionDto(
                    key = selection.key?.trim()?.takeIf(String::isNotBlank),
                    scheduledFieldIds = scheduledFieldIds,
                    dayOfWeek = selection.dayOfWeek,
                    daysOfWeek = selection.daysOfWeek.distinct(),
                    startTimeMinutes = selection.startTimeMinutes,
                    endTimeMinutes = selection.endTimeMinutes,
                    startDate = startDate,
                    endDate = endDate,
                    timeZone = selection.timeZone?.trim()?.takeIf(String::isNotBlank),
                    repeating = selection.repeating,
                )
            }

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
                rentalSelections = normalizedRentalSelections,
                slotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                discountCode = discountCode?.trim()?.takeIf(String::isNotBlank),
                answers = answers.toBillingRegistrationQuestionAnswerDtos(),
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

    private fun Throwable.isPaymentStillAwaiting(): Boolean =
        this is ApiException && statusCode == 402

    private fun Throwable.isTerminalRentalOrderFailure(): Boolean =
        this is ApiException && statusCode in 400..499 && statusCode !in setOf(402, 408, 429)

    private suspend fun recordPendingRentalOrderFailure(
        pendingOrder: PendingRentalOrder,
        error: Throwable,
    ) {
        val message = error.message ?: "Unable to reserve paid rental resources."
        val attemptedAt = kotlin.time.Clock.System.now().toString()
        if (error.isPaymentStillAwaiting()) {
            databaseService.getPendingRentalOrderDao.markAwaitingPayment(
                id = pendingOrder.id,
                error = message,
                attemptedAt = attemptedAt,
            )
        } else if (error.isTerminalRentalOrderFailure()) {
            databaseService.getPendingRentalOrderDao.markRejected(
                id = pendingOrder.id,
                error = message,
                attemptedAt = attemptedAt,
                status = PENDING_RENTAL_ORDER_STATUS_REJECTED,
            )
        } else {
            databaseService.getPendingRentalOrderDao.markFailed(
                id = pendingOrder.id,
                error = message,
                attemptedAt = attemptedAt,
            )
        }
    }

    private fun buildPendingRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String?,
        payerUserId: String,
        renterOrganizationId: String?,
        sportId: String?,
        status: String,
    ): PendingRentalOrder {
        val normalizedSlug = publicSlug.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("This organization needs a public rental checkout before resources can be reserved.")
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("Rental booking id is required.")
        val normalizedPayerUserId = payerUserId.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("A signed-in renter is required.")
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

        val normalizedPaymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank)
        return PendingRentalOrder(
            id = "$normalizedEventId:${normalizedPaymentIntentId ?: "free"}",
            publicSlug = normalizedSlug,
            eventId = normalizedEventId,
            selectionsJson = jsonMVP.encodeToString(normalizedSelections),
            paymentIntentId = normalizedPaymentIntentId,
            payerUserId = normalizedPayerUserId,
            renterOrganizationId = renterOrganizationId?.trim()?.takeIf(String::isNotBlank),
            sportId = sportId?.trim()?.takeIf(String::isNotBlank),
            status = status,
            createdAt = kotlin.time.Clock.System.now().toString(),
        )
    }

    private fun currentPayerUserId(): String =
        userRepository.currentUser.value.getOrNull()?.id?.trim()?.takeIf(String::isNotBlank)
            ?: throw IllegalStateException("A signed-in renter is required.")

    override suspend fun prepareRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String,
        payerUserId: String,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<String> = runCatching {
        val normalizedPaymentIntentId = paymentIntentId.trim().takeIf(String::isNotBlank)
            ?: throw IllegalArgumentException("A rental payment intent is required.")
        if (payerUserId.trim() != currentPayerUserId()) {
            throw RentalOrderPayerMismatchException(
                "Sign in as the original renter before continuing this rental checkout.",
            )
        }
        val pendingOrder = buildPendingRentalOrder(
            publicSlug = publicSlug,
            eventId = eventId,
            selections = selections,
            paymentIntentId = normalizedPaymentIntentId,
            payerUserId = payerUserId,
            renterOrganizationId = renterOrganizationId,
            sportId = sportId,
            status = PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT,
        )
        databaseService.getPendingRentalOrderDao.upsert(pendingOrder)
        pendingOrder.id
    }

    override suspend fun discardPreparedRentalOrder(orderId: String): Result<Unit> = runCatching {
        val normalizedOrderId = orderId.trim().takeIf(String::isNotBlank)
            ?: return@runCatching
        databaseService.getPendingRentalOrderDao.deleteById(normalizedOrderId)
    }

    override suspend fun createRentalOrder(
        publicSlug: String,
        eventId: String,
        selections: List<RentalOrderSelectionRequest>,
        paymentIntentId: String?,
        payerUserId: String?,
        renterOrganizationId: String?,
        sportId: String?,
    ): Result<RentalOrderResult> = runCatching {
        val activePayerUserId = currentPayerUserId()
        val expectedPayerUserId = payerUserId?.trim()?.takeIf(String::isNotBlank) ?: activePayerUserId
        if (expectedPayerUserId != activePayerUserId) {
            throw RentalOrderPayerMismatchException(
                "Sign in as the original renter before continuing this rental checkout.",
            )
        }
        val pendingOrder = buildPendingRentalOrder(
            publicSlug = publicSlug,
            eventId = eventId,
            selections = selections,
            paymentIntentId = paymentIntentId,
            payerUserId = expectedPayerUserId,
            renterOrganizationId = renterOrganizationId,
            sportId = sportId,
            status = PENDING_RENTAL_ORDER_STATUS_PENDING,
        )
        databaseService.getPendingRentalOrderDao.upsert(pendingOrder)
        try {
            submitPendingRentalOrder(pendingOrder).also {
                databaseService.getPendingRentalOrderDao.deleteById(pendingOrder.id)
            }
        } catch (error: Throwable) {
            recordPendingRentalOrderFailure(pendingOrder, error)
            if (error.isTerminalRentalOrderFailure()) {
                throw RentalOrderTerminalFailureException(
                    "The payment was recorded, but this reservation needs staff assistance: ${error.message.orEmpty()}",
                    error,
                )
            }
            throw error
        }
    }

    override suspend fun syncPendingRentalOrders(): Result<Int> = runCatching {
        val payerUserId = currentPayerUserId()
        var completed = 0
        databaseService.getPendingRentalOrderDao.retryableOrders(payerUserId).forEach { pendingOrder ->
            runCatching { submitPendingRentalOrder(pendingOrder) }
                .onSuccess {
                    databaseService.getPendingRentalOrderDao.deleteById(pendingOrder.id)
                    completed += 1
                }
                .onFailure { error ->
                    recordPendingRentalOrderFailure(pendingOrder, error)
                }
        }
        completed
    }

    private suspend fun submitPendingRentalOrder(pendingOrder: PendingRentalOrder): RentalOrderResult {
        val selections = jsonMVP.decodeFromString<List<RentalOrderSelectionRequest>>(pendingOrder.selectionsJson)
        AnalyticsTracker.capture(
            AnalyticsEvent.RentalCheckoutStarted,
            buildMap {
                put("organization_slug", pendingOrder.publicSlug)
                put("event_id", pendingOrder.eventId)
                put("selection_count", selections.size.toString())
                pendingOrder.renterOrganizationId?.let { put("renter_organization_id", it) }
            },
        )
        val response = api.post<CreateRentalOrderRequestDto, RentalOrderResponseDto>(
            path = "api/public/organizations/${pendingOrder.publicSlug.encodeURLQueryComponent()}/rental-orders",
            body = CreateRentalOrderRequestDto(
                eventId = pendingOrder.eventId,
                selections = selections,
                sportId = pendingOrder.sportId,
                paymentIntentId = pendingOrder.paymentIntentId,
                renterOrganizationId = pendingOrder.renterOrganizationId,
            ),
        )
        response.error?.trim()?.takeIf(String::isNotBlank)?.let(::error)
        return response.toRentalOrderResultOrNull(selections) ?: error("Unable to create rental order.")
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

    override suspend fun listBillsPage(
        ownerType: String,
        ownerId: String,
        limit: Int,
        offset: Int,
    ): Result<RepositoryPage<Bill>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 200)
        val normalizedOffset = offset.coerceAtLeast(0)
        val encodedOwnerType = ownerType.encodeURLQueryComponent()
        val encodedOwnerId = ownerId.encodeURLQueryComponent()
        val response = api.get<BillsResponseDto>(
            path = "api/billing/bills?ownerType=$encodedOwnerType&ownerId=$encodedOwnerId" +
                "&limit=$normalizedLimit&offset=$normalizedOffset",
        )

        if (response.pagination != null || normalizedOffset == 0) {
            val bills = response.bills.mapNotNull { it.toBillOrNull() }
            return@runCatching RepositoryPage(
                items = bills,
                pagination = response.pagination.toRepositoryPagination(
                    fallbackLimit = normalizedLimit,
                    fallbackOffset = normalizedOffset,
                    fallbackItemCount = bills.size,
                ),
            )
        }

        // Older servers ignore `offset` and omit pagination metadata. During a
        // rolling deploy, expand the requested prefix and slice it locally so
        // older unpaid bills are still reachable instead of repeating page one.
        val prefixLimit = (normalizedOffset.toLong() + normalizedLimit.toLong())
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()
        val legacyResponse = api.get<BillsResponseDto>(
            path = "api/billing/bills?ownerType=$encodedOwnerType&ownerId=$encodedOwnerId&limit=$prefixLimit",
        )
        val prefix = legacyResponse.bills.mapNotNull { it.toBillOrNull() }
        val bills = prefix.drop(normalizedOffset).take(normalizedLimit)
        RepositoryPage(
            items = bills,
            pagination = RepositoryPagination(
                limit = normalizedLimit,
                offset = normalizedOffset,
                nextOffset = normalizedOffset + bills.size,
                hasMore = prefix.size >= prefixLimit,
            ),
        )
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
        api.get<SubscriptionsResponseDto>(
            path = "api/subscriptions?userId=$encodedUserId&limit=$limit",
        ).subscriptions.mapNotNull { it.toSubscriptionOrNull() }
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
        val idChunks = collectionIdChunks(productIds)
        val ids = idChunks.flatten()
        if (ids.isEmpty()) return@runCatching emptyList()

        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            CATALOG_RESOURCE_PRODUCTS,
            PRODUCT_PROJECTION_FULL,
            "ids",
            *ids.toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedCatalogIdsOrEmpty()
        val products = try {
            val productsById = LinkedHashMap<String, Product>()
            for (idChunk in idChunks) {
                val encodedIds = idChunk.joinToString(",") { it.encodeURLQueryComponent() }
                val response = scope.api.get<ProductsResponseDto>(path = "api/products?ids=$encodedIds")
                response.products.toProductsStrict("Product id query").forEach { product ->
                    productsById[product.id] = product
                }
            }
            ids.mapNotNull(productsById::get)
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toProducts()
                ?: throw error
        }
        val snapshot = products.toProductQueryEntry(cacheKey, scope)
        val productIds = products.map(Product::id).toSet()
        dao.replaceProductQuery(
            snapshot = snapshot,
            entries = products.map { product -> product.toCacheEntry(scope, PRODUCT_PROJECTION_FULL) },
            staleProductIds = previousIds.filterNot(productIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toProducts()
            ?: error("Product id query cache was not written.")
    }

    override suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>> = runCatching {
        val normalizedId = organizationId.trim()
        if (normalizedId.isEmpty()) return@runCatching emptyList()

        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            CATALOG_RESOURCE_PRODUCTS,
            PRODUCT_PROJECTION_FULL,
            "organization",
            normalizedId,
        )
        val products = try {
            val encodedId = normalizedId.encodeURLQueryComponent()
            scope.api.get<ProductsResponseDto>(path = "api/products?organizationId=$encodedId")
                .products
                .toProductsStrict("Organization product query")
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toProducts()
                ?: throw error
        }
        val snapshot = products.toProductQueryEntry(cacheKey, scope)
        dao.replaceProductsForOrganization(
            organizationId = normalizedId,
            snapshot = snapshot,
            entries = products.map { product -> product.toCacheEntry(scope, PRODUCT_PROJECTION_FULL) },
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toProducts()
            ?: error("Organization product query cache was not written.")
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
