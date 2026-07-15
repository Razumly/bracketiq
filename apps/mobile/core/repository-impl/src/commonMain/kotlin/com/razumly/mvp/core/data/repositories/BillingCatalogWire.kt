package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationReview
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewSummary
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.ProductTaxCategory
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.network.dto.OrganizationApiDto
import com.razumly.mvp.core.network.dto.PaginationResponseDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable

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
internal fun Set<String>.toOrganizationTagsQueryParam(): String {
    val normalizedTags = map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
    if (normalizedTags.isEmpty()) return ""
    return normalizedTags.joinToString(separator = "", prefix = "") { tag ->
        "&tags=${tag.encodeURLQueryComponent()}"
    }
}

internal fun List<OrganizationApiDto>.toOrganizationsStrict(context: String): List<Organization> =
    mapIndexed { index, dto ->
        dto.toOrganizationOrNull()
            ?: error("$context returned an invalid organization at row $index.")
    }

internal fun List<ProductApiDto>.toProductsStrict(context: String): List<Product> =
    mapIndexed { index, dto ->
        dto.toProductOrNull()
            ?: error("$context returned an invalid product at row $index.")
    }

@Serializable
internal data class EmptyRequestDto(
    val noop: Boolean = true,
)

@Serializable
internal data class OrganizationReviewRequestDto(
    val rating: Int,
    val body: String? = null,
)

@Serializable
internal data class OrganizationReviewReportRequestDto(
    val targetType: String = "ORGANIZATION_REVIEW",
    val targetId: String,
    val category: String = "report_organization_review",
)

@Serializable
internal data class ProductSubscriptionCheckoutRequestDto(
    val discountCode: String? = null,
)

@Serializable
internal data class DiscountsResponseDto(
    val discounts: List<DiscountOfferDto> = emptyList(),
    val error: String? = null,
)

@Serializable
internal data class DiscountResponseDto(
    val discount: DiscountOfferDto? = null,
    val error: String? = null,
)

@Serializable
internal data class DiscountOfferDto(
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
internal data class DiscountCodeResponseDto(
    val code: DiscountCodeDto? = null,
    val error: String? = null,
)

@Serializable
internal data class DiscountCodeDto(
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
internal data class DiscountTargetsResponseDto(
    val targets: List<DiscountTargetDto> = emptyList(),
    val error: String? = null,
)

@Serializable
internal data class DiscountTargetDto(
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
internal data class CreateDiscountRequestDto(
    val ownerType: String,
    val ownerId: String? = null,
    val name: String,
    val description: String? = null,
    val targetType: String,
    val targetId: String,
    val discountedPriceCents: Int,
)

@Serializable
internal data class GenerateDiscountCodeRequestDto(
    val code: String? = null,
    val usageLimit: Int? = null,
)

@Serializable
internal data class UpdateDiscountCodeRequestDto(
    val status: String,
)

@Serializable
internal data class SubscriptionsResponseDto(
    val subscriptions: List<SubscriptionApiDto> = emptyList(),
)

@Serializable
internal data class ProductsResponseDto(
    val products: List<ProductApiDto>,
)

@Serializable
internal data class OrganizationReviewsResponseDto(
    val summary: OrganizationReviewSummary,
    val reviews: List<OrganizationReview>,
    val nextCursor: String? = null,
    val viewerReview: OrganizationReview? = null,
    val viewerIsAuthenticated: Boolean = false,
    val canReview: Boolean = false,
    val cannotReviewReason: String? = null,
) {
    fun toPayload(): OrganizationReviewsPayload = OrganizationReviewsPayload(
        summary = summary,
        reviews = reviews,
        nextCursor = nextCursor,
        viewerReview = viewerReview,
        viewerIsAuthenticated = viewerIsAuthenticated,
        canReview = canReview,
        cannotReviewReason = cannotReviewReason,
    )
}

@Serializable
internal data class OrganizationTagsResponseDto(
    val tags: List<OrganizationTagApiDto> = emptyList(),
)

@Serializable
internal data class OrganizationTagApiDto(
    val id: String? = null,
    val name: String = "",
    val slug: String = "",
    val organizationCount: Int = 0,
    val isSystem: Boolean = false,
) {
    fun toEventTag(): EventTag =
        EventTag(
            id = id,
            name = name,
            slug = slug,
            eventCount = organizationCount,
            isSystem = isSystem,
        )
}

internal fun PaginationResponseDto?.toRepositoryPagination(
    fallbackLimit: Int,
    fallbackOffset: Int,
    fallbackItemCount: Int,
): RepositoryPagination =
    RepositoryPagination(
        limit = this?.limit ?: fallbackLimit,
        offset = this?.offset ?: fallbackOffset,
        nextOffset = this?.nextOffset ?: fallbackOffset + fallbackItemCount,
        hasMore = this?.hasMore ?: (fallbackItemCount >= fallbackLimit),
    )

@Serializable
internal data class OrganizationTemplatesResponseDto(
    val templates: List<OrganizationTemplateApiDto> = emptyList(),
    val error: String? = null,
)

@Serializable
internal data class SubscriptionApiDto(
    val id: String? = null,
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
        val resolvedId = id
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
internal data class ProductApiDto(
    val id: String? = null,
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
        val resolvedId = id
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
internal data class OrganizationTemplateApiDto(
    val id: String? = null,
    val title: String? = null,
    val type: String? = null,
    val requiredSignerType: String? = null,
) {
    fun toOrganizationTemplateOrNull(): OrganizationTemplateDocument? {
        val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
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
