package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.analytics.AnalyticsEvent
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.ProductCacheEntry
import com.razumly.mvp.core.data.dataTypes.ProductTaxCategory
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.PurchaseIntentRequestDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

private const val PRODUCT_CATALOG_RESOURCE = "products"
private const val PRODUCT_CATALOG_PROJECTION = "full"

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

private fun List<Product>.toProductQueryEntry(
    cacheKey: String,
    scope: CatalogCacheScope,
): CatalogQueryCacheEntry = CatalogQueryCacheEntry(
    cacheKey = cacheKey,
    viewerKey = scope.viewerKey,
    resourceType = PRODUCT_CATALOG_RESOURCE,
    projectionKey = PRODUCT_CATALOG_PROJECTION,
    orderedIdsJson = jsonMVP.encodeToString(map(Product::id)),
    payloadJson = jsonMVP.encodeToString(map(Product::toCachedPayload)),
    paginationJson = null,
    isComplete = true,
)

private fun CatalogQueryCacheEntry.toProducts(): List<Product> {
    require(resourceType == PRODUCT_CATALOG_RESOURCE && isComplete) {
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

private fun CatalogQueryCacheEntry?.orderedProductIdsOrEmpty(): List<String> = this?.let { snapshot ->
    jsonMVP.decodeFromString<List<String>>(snapshot.orderedIdsJson)
}.orEmpty()

/** Owns product catalog synchronization and product purchase/subscription requests. */
internal class BillingProductCoordinator(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
    private val databaseService: DatabaseService,
) {
    suspend fun getProductsByIds(productIds: List<String>): Result<List<Product>> = runCatching {
        val idChunks = collectionIdChunks(productIds)
        val ids = idChunks.flatten()
        if (ids.isEmpty()) return@runCatching emptyList()

        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            PRODUCT_CATALOG_RESOURCE,
            PRODUCT_CATALOG_PROJECTION,
            "ids",
            *ids.toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedProductIdsOrEmpty()
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
        val resolvedProductIds = products.map(Product::id).toSet()
        dao.replaceProductQuery(
            snapshot = snapshot,
            entries = products.map { product -> product.toCacheEntry(scope, PRODUCT_CATALOG_PROJECTION) },
            staleProductIds = previousIds.filterNot(resolvedProductIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toProducts()
            ?: error("Product id query cache was not written.")
    }

    suspend fun listProductsByOrganization(organizationId: String): Result<List<Product>> = runCatching {
        val normalizedId = organizationId.trim()
        if (normalizedId.isEmpty()) return@runCatching emptyList()

        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            PRODUCT_CATALOG_RESOURCE,
            PRODUCT_CATALOG_PROJECTION,
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
            entries = products.map { product -> product.toCacheEntry(scope, PRODUCT_CATALOG_PROJECTION) },
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toProducts()
            ?: error("Organization product query cache was not written.")
    }

    suspend fun createProductPurchaseIntent(
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

    suspend fun createProductSubscriptionIntent(
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

    suspend fun createProductSubscription(
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
}
