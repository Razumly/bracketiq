package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.CatalogCacheViewerEntry
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.OrganizationCacheEntry
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsCacheEntry
import com.razumly.mvp.core.data.dataTypes.ProductCacheEntry
import com.razumly.mvp.core.data.dataTypes.TimeSlotCacheEntry
import com.razumly.mvp.core.data.dataTypes.daos.CatalogCacheDao

internal class InMemoryCatalogCacheDao : CatalogCacheDao {
    private var activeViewer: CatalogCacheViewerEntry? = null
    private val queries = linkedMapOf<String, CatalogQueryCacheEntry>()
    private val organizations = linkedMapOf<Triple<String, String, String>, OrganizationCacheEntry>()
    private val products = linkedMapOf<Triple<String, String, String>, ProductCacheEntry>()
    private val reviews = linkedMapOf<String, OrganizationReviewsCacheEntry>()
    private val timeSlots = linkedMapOf<Triple<String, String, String>, TimeSlotCacheEntry>()

    val queryCount: Int get() = queries.size

    override suspend fun getActiveViewer(): CatalogCacheViewerEntry? = activeViewer

    override suspend fun upsertActiveViewer(entry: CatalogCacheViewerEntry) {
        activeViewer = entry
    }

    override suspend fun deleteAllCatalogQueries() = queries.clear()

    override suspend fun deleteAllOrganizations() = organizations.clear()

    override suspend fun deleteAllProducts() = products.clear()

    override suspend fun deleteAllOrganizationReviews() = reviews.clear()

    override suspend fun deleteAllTimeSlots() = timeSlots.clear()

    override suspend fun getCatalogQuery(cacheKey: String, viewerKey: String): CatalogQueryCacheEntry? =
        queries[cacheKey]?.takeIf { entry -> entry.viewerKey == viewerKey }

    override suspend fun upsertCatalogQuery(entry: CatalogQueryCacheEntry) {
        queries[entry.cacheKey] = entry
    }

    override suspend fun deleteCatalogQueries(
        viewerKey: String,
        resourceType: String,
        projectionKey: String,
    ) {
        queries.entries.removeAll { (_, entry) ->
            entry.viewerKey == viewerKey &&
                entry.resourceType == resourceType &&
                entry.projectionKey == projectionKey
        }
    }

    override suspend fun deleteCatalogQueries(viewerKey: String, resourceType: String) {
        queries.entries.removeAll { (_, entry) ->
            entry.viewerKey == viewerKey && entry.resourceType == resourceType
        }
    }

    override suspend fun getOrganizations(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ): List<OrganizationCacheEntry> = ids.mapNotNull { id ->
        organizations[Triple(viewerKey, projectionKey, id)]
    }

    override suspend fun upsertOrganizations(entries: List<OrganizationCacheEntry>) {
        entries.forEach { entry ->
            organizations[Triple(entry.viewerKey, entry.projectionKey, entry.organizationId)] = entry
        }
    }

    override suspend fun deleteOrganizations(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ) {
        ids.forEach { id -> organizations.remove(Triple(viewerKey, projectionKey, id)) }
    }

    override suspend fun getProducts(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ): List<ProductCacheEntry> = ids.mapNotNull { id -> products[Triple(viewerKey, projectionKey, id)] }

    override suspend fun upsertProducts(entries: List<ProductCacheEntry>) {
        entries.forEach { entry -> products[Triple(entry.viewerKey, entry.projectionKey, entry.id)] = entry }
    }

    override suspend fun deleteProducts(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ) {
        ids.forEach { id -> products.remove(Triple(viewerKey, projectionKey, id)) }
    }

    override suspend fun deleteProductsForOrganization(
        organizationId: String,
        viewerKey: String,
        projectionKey: String,
    ) {
        products.entries.removeAll { (_, entry) ->
            entry.viewerKey == viewerKey &&
                entry.projectionKey == projectionKey &&
                entry.organizationId == organizationId
        }
    }

    override suspend fun getOrganizationReviews(
        cacheKey: String,
        viewerKey: String,
    ): OrganizationReviewsCacheEntry? = reviews[cacheKey]?.takeIf { entry -> entry.viewerKey == viewerKey }

    override suspend fun upsertOrganizationReviews(entry: OrganizationReviewsCacheEntry) {
        reviews[entry.cacheKey] = entry
    }

    override suspend fun deleteOrganizationReviews(viewerKey: String, organizationId: String) {
        reviews.entries.removeAll { (_, entry) ->
            entry.viewerKey == viewerKey && entry.organizationId == organizationId
        }
    }

    override suspend fun deleteOrganizationReviews(viewerKey: String) {
        reviews.entries.removeAll { (_, entry) -> entry.viewerKey == viewerKey }
    }

    override suspend fun getTimeSlots(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ): List<TimeSlotCacheEntry> = ids.mapNotNull { id -> timeSlots[Triple(viewerKey, projectionKey, id)] }

    override suspend fun upsertTimeSlots(entries: List<TimeSlotCacheEntry>) {
        entries.forEach { entry -> timeSlots[Triple(entry.viewerKey, entry.projectionKey, entry.id)] = entry }
    }

    override suspend fun deleteTimeSlots(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ) {
        ids.forEach { id -> timeSlots.remove(Triple(viewerKey, projectionKey, id)) }
    }

    override suspend fun deleteTimeSlot(id: String, viewerKey: String) {
        timeSlots.entries.removeAll { (_, entry) -> entry.viewerKey == viewerKey && entry.id == id }
    }
}
