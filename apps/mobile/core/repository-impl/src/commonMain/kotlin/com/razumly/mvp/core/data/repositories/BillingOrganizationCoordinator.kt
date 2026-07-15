package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationCacheEntry
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsCacheEntry
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.normalizedEventTags
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.OrganizationApiDto
import com.razumly.mvp.core.network.dto.OrganizationsResponseDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

private const val ORGANIZATION_CATALOG_RESOURCE = "organizations"
private const val ORGANIZATION_DETAIL_PROJECTION = "detail"
private const val ORGANIZATION_PUBLIC_PROJECTION = "public"
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
    resourceType = ORGANIZATION_CATALOG_RESOURCE,
    projectionKey = projectionKey,
    orderedIdsJson = jsonMVP.encodeToString(map(Organization::id)),
    payloadJson = jsonMVP.encodeToString(this),
    paginationJson = pagination?.let { value -> jsonMVP.encodeToString(value) },
    isComplete = pagination?.hasMore != true,
)

private fun CatalogQueryCacheEntry.toOrganizations(): List<Organization> {
    require(resourceType == ORGANIZATION_CATALOG_RESOURCE) {
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

/** Owns organization discovery, viewer-scoped Room snapshots, reviews, and templates. */
internal class BillingOrganizationCoordinator(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) {
    suspend fun listOrganizations(
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

    suspend fun listOrganizationsPage(
        limit: Int,
        offset: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
    ): Result<RepositoryPage<Organization>> = listOrganizationsPage(
        limit = limit,
        offset = offset,
        includeAffiliateRentals = includeAffiliateRentals,
        tagSlugs = tagSlugs,
        price = null,
        divisionGenders = emptySet(),
        skillDivisionTypeIds = emptySet(),
        ageDivisionTypeIds = emptySet(),
    )

    suspend fun listOrganizationsPage(
        limit: Int,
        offset: Int,
        includeAffiliateRentals: Boolean,
        tagSlugs: Set<String>,
        price: Pair<Double, Double>?,
        divisionGenders: Set<String>,
        skillDivisionTypeIds: Set<String>,
        ageDivisionTypeIds: Set<String>,
    ): Result<RepositoryPage<Organization>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 200)
        val normalizedOffset = offset.coerceAtLeast(0)
        val affiliateParam = if (includeAffiliateRentals) "&includeAffiliateRentals=true" else ""
        val tagsParam = tagSlugs.toOrganizationTagsQueryParam()
        val divisionParams = buildString {
            price?.first?.times(100.0)?.toInt()?.let { append("&divisionPriceMin=$it") }
            price?.second?.times(100.0)?.toInt()?.let { append("&divisionPriceMax=$it") }
            append(divisionGenders.toOrganizationListQueryParam("divisionGenders"))
            append(skillDivisionTypeIds.toOrganizationListQueryParam("skillDivisionTypeIds"))
            append(ageDivisionTypeIds.toOrganizationListQueryParam("ageDivisionTypeIds"))
        }
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            ORGANIZATION_CATALOG_RESOURCE,
            ORGANIZATION_PUBLIC_PROJECTION,
            "list",
            normalizedLimit.toString(),
            normalizedOffset.toString(),
            includeAffiliateRentals.toString(),
            price?.first?.toString().orEmpty(),
            price?.second?.toString().orEmpty(),
            *divisionGenders.map(String::trim).filter(String::isNotBlank).sorted().toTypedArray(),
            *skillDivisionTypeIds.map(String::trim).filter(String::isNotBlank).sorted().toTypedArray(),
            *ageDivisionTypeIds.map(String::trim).filter(String::isNotBlank).sorted().toTypedArray(),
            *tagSlugs.map(String::trim).filter(String::isNotBlank).sorted().toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedCatalogIdsOrEmpty()
        val refreshedPage = try {
            val response = scope.api.get<OrganizationsResponseDto>(
                path = "api/organizations?limit=$normalizedLimit&offset=$normalizedOffset$affiliateParam$tagsParam$divisionParams",
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
            projectionKey = ORGANIZATION_PUBLIC_PROJECTION,
            pagination = refreshedPage.pagination,
        )
        val refreshedIds = refreshedPage.items.map(Organization::id).toSet()
        dao.replaceOrganizationQuery(
            snapshot = snapshot,
            entries = refreshedPage.items.map { organization ->
                organization.toCacheEntry(scope, ORGANIZATION_PUBLIC_PROJECTION)
            },
            staleOrganizationIds = previousIds.filterNot(refreshedIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizationPage()
            ?: error("Organization page cache was not written.")
    }

    suspend fun searchOrganizations(
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
            ORGANIZATION_CATALOG_RESOURCE,
            ORGANIZATION_PUBLIC_PROJECTION,
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
            ORGANIZATION_PUBLIC_PROJECTION,
            pagination,
        )
        val refreshedIds = organizations.map(Organization::id).toSet()
        dao.replaceOrganizationQuery(
            snapshot = snapshot,
            entries = organizations.map { organization ->
                organization.toCacheEntry(scope, ORGANIZATION_PUBLIC_PROJECTION)
            },
            staleOrganizationIds = previousIds.filterNot(refreshedIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizations()
            ?: error("Organization search cache was not written.")
    }

    suspend fun getOrganizationTags(query: String?, filterOnly: Boolean): Result<List<EventTag>> = runCatching {
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

    suspend fun getOrganizationsByIds(organizationIds: List<String>): Result<List<Organization>> = runCatching {
        val idChunks = collectionIdChunks(organizationIds)
        val ids = idChunks.flatten()
        if (ids.isEmpty()) return@runCatching emptyList()
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val cacheKey = catalogCacheKey(
            scope,
            ORGANIZATION_CATALOG_RESOURCE,
            ORGANIZATION_DETAIL_PROJECTION,
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
            ORGANIZATION_DETAIL_PROJECTION,
        )
        val refreshedIds = organizations.map(Organization::id).toSet()
        dao.replaceOrganizationQuery(
            snapshot = snapshot,
            entries = organizations.map { organization ->
                organization.toCacheEntry(scope, ORGANIZATION_DETAIL_PROJECTION)
            },
            staleOrganizationIds = previousIds.filterNot(refreshedIds::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toOrganizations()
            ?: error("Organization id query cache was not written.")
    }

    suspend fun getOrganizationReviews(
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

    suspend fun saveOrganizationReview(
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

    suspend fun deleteOrganizationReview(
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

    suspend fun reportOrganizationReview(reviewId: String): Result<Unit> = runCatching {
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

    suspend fun listOrganizationTemplates(
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
}
