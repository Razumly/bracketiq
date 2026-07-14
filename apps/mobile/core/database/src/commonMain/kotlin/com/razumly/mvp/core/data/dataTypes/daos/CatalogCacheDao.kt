package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.CatalogCacheViewerEntry
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.OrganizationCacheEntry
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsCacheEntry
import com.razumly.mvp.core.data.dataTypes.ProductCacheEntry
import com.razumly.mvp.core.data.dataTypes.TimeSlotCacheEntry

@Dao
interface CatalogCacheDao {
    @Query("SELECT * FROM catalog_cache_viewer WHERE id = 'active' LIMIT 1")
    suspend fun getActiveViewer(): CatalogCacheViewerEntry?

    @Upsert
    suspend fun upsertActiveViewer(entry: CatalogCacheViewerEntry)

    @Query("DELETE FROM catalog_query_cache")
    suspend fun deleteAllCatalogQueries()

    @Query("DELETE FROM organization_cache")
    suspend fun deleteAllOrganizations()

    @Query("DELETE FROM product_cache")
    suspend fun deleteAllProducts()

    @Query("DELETE FROM organization_reviews_cache")
    suspend fun deleteAllOrganizationReviews()

    @Query("DELETE FROM time_slot_cache")
    suspend fun deleteAllTimeSlots()

    suspend fun requireActiveViewer(viewerKey: String) {
        check(getActiveViewer()?.viewerKey == viewerKey) {
            "Catalog cache viewer changed while a request was in flight."
        }
    }

    /** Purges account-owned projections atomically whenever login state or bearer identity changes. */
    @Transaction
    suspend fun activateViewer(viewerKey: String) {
        require(viewerKey.isNotBlank()) { "Catalog cache viewer key is required." }
        if (getActiveViewer()?.viewerKey == viewerKey) return
        deleteAllCatalogQueries()
        deleteAllOrganizations()
        deleteAllProducts()
        deleteAllOrganizationReviews()
        deleteAllTimeSlots()
        upsertActiveViewer(CatalogCacheViewerEntry(viewerKey = viewerKey))
    }

    @Query("SELECT * FROM catalog_query_cache WHERE cacheKey = :cacheKey AND viewerKey = :viewerKey")
    suspend fun getCatalogQuery(cacheKey: String, viewerKey: String): CatalogQueryCacheEntry?

    @Upsert
    suspend fun upsertCatalogQuery(entry: CatalogQueryCacheEntry)

    @Query(
        "DELETE FROM catalog_query_cache " +
            "WHERE viewerKey = :viewerKey AND resourceType = :resourceType AND projectionKey = :projectionKey",
    )
    suspend fun deleteCatalogQueries(
        viewerKey: String,
        resourceType: String,
        projectionKey: String,
    )

    @Query("DELETE FROM catalog_query_cache WHERE viewerKey = :viewerKey AND resourceType = :resourceType")
    suspend fun deleteCatalogQueries(viewerKey: String, resourceType: String)

    @Query(
        "SELECT * FROM organization_cache " +
            "WHERE viewerKey = :viewerKey AND projectionKey = :projectionKey AND organizationId IN (:ids)",
    )
    suspend fun getOrganizations(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ): List<OrganizationCacheEntry>

    @Upsert
    suspend fun upsertOrganizations(entries: List<OrganizationCacheEntry>)

    @Query(
        "DELETE FROM organization_cache " +
            "WHERE viewerKey = :viewerKey AND projectionKey = :projectionKey AND organizationId IN (:ids)",
    )
    suspend fun deleteOrganizations(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    )

    @Transaction
    suspend fun replaceOrganizationQuery(
        snapshot: CatalogQueryCacheEntry,
        entries: List<OrganizationCacheEntry>,
        staleOrganizationIds: List<String>,
    ) {
        requireActiveViewer(snapshot.viewerKey)
        if (staleOrganizationIds.isNotEmpty()) {
            deleteOrganizations(staleOrganizationIds, snapshot.viewerKey, snapshot.projectionKey)
        }
        if (entries.isNotEmpty()) upsertOrganizations(entries)
        upsertCatalogQuery(snapshot)
    }

    @Query(
        "SELECT * FROM product_cache " +
            "WHERE viewerKey = :viewerKey AND projectionKey = :projectionKey AND id IN (:ids)",
    )
    suspend fun getProducts(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ): List<ProductCacheEntry>

    @Upsert
    suspend fun upsertProducts(entries: List<ProductCacheEntry>)

    @Query(
        "DELETE FROM product_cache " +
            "WHERE viewerKey = :viewerKey AND projectionKey = :projectionKey AND id IN (:ids)",
    )
    suspend fun deleteProducts(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    )

    @Query(
        "DELETE FROM product_cache " +
            "WHERE viewerKey = :viewerKey AND projectionKey = :projectionKey AND organizationId = :organizationId",
    )
    suspend fun deleteProductsForOrganization(
        organizationId: String,
        viewerKey: String,
        projectionKey: String,
    )

    @Transaction
    suspend fun replaceProductQuery(
        snapshot: CatalogQueryCacheEntry,
        entries: List<ProductCacheEntry>,
        staleProductIds: List<String>,
    ) {
        requireActiveViewer(snapshot.viewerKey)
        if (staleProductIds.isNotEmpty()) {
            deleteProducts(staleProductIds, snapshot.viewerKey, snapshot.projectionKey)
        }
        if (entries.isNotEmpty()) upsertProducts(entries)
        upsertCatalogQuery(snapshot)
    }

    @Transaction
    suspend fun replaceProductsForOrganization(
        organizationId: String,
        snapshot: CatalogQueryCacheEntry,
        entries: List<ProductCacheEntry>,
    ) {
        requireActiveViewer(snapshot.viewerKey)
        deleteProductsForOrganization(organizationId, snapshot.viewerKey, snapshot.projectionKey)
        if (entries.isNotEmpty()) upsertProducts(entries)
        upsertCatalogQuery(snapshot)
    }

    @Query(
        "SELECT * FROM organization_reviews_cache " +
            "WHERE cacheKey = :cacheKey AND viewerKey = :viewerKey",
    )
    suspend fun getOrganizationReviews(
        cacheKey: String,
        viewerKey: String,
    ): OrganizationReviewsCacheEntry?

    @Upsert
    suspend fun upsertOrganizationReviews(entry: OrganizationReviewsCacheEntry)

    @Transaction
    suspend fun replaceOrganizationReviews(entry: OrganizationReviewsCacheEntry) {
        requireActiveViewer(entry.viewerKey)
        upsertOrganizationReviews(entry)
    }

    @Query(
        "DELETE FROM organization_reviews_cache " +
            "WHERE viewerKey = :viewerKey AND organizationId = :organizationId",
    )
    suspend fun deleteOrganizationReviews(viewerKey: String, organizationId: String)

    @Query("DELETE FROM organization_reviews_cache WHERE viewerKey = :viewerKey")
    suspend fun deleteOrganizationReviews(viewerKey: String)

    @Transaction
    suspend fun replaceFirstOrganizationReviewPage(entry: OrganizationReviewsCacheEntry) {
        require(entry.cursorKey.isEmpty()) { "A review mutation must replace the first page." }
        requireActiveViewer(entry.viewerKey)
        deleteOrganizationReviews(entry.viewerKey, entry.organizationId)
        upsertOrganizationReviews(entry)
    }

    @Query(
        "SELECT * FROM time_slot_cache " +
            "WHERE viewerKey = :viewerKey AND projectionKey = :projectionKey AND id IN (:ids)",
    )
    suspend fun getTimeSlots(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    ): List<TimeSlotCacheEntry>

    @Upsert
    suspend fun upsertTimeSlots(entries: List<TimeSlotCacheEntry>)

    @Query(
        "DELETE FROM time_slot_cache " +
            "WHERE viewerKey = :viewerKey AND projectionKey = :projectionKey AND id IN (:ids)",
    )
    suspend fun deleteTimeSlots(
        ids: List<String>,
        viewerKey: String,
        projectionKey: String,
    )

    @Query("DELETE FROM time_slot_cache WHERE viewerKey = :viewerKey AND id = :id")
    suspend fun deleteTimeSlot(id: String, viewerKey: String)

    @Transaction
    suspend fun replaceTimeSlotQuery(
        snapshot: CatalogQueryCacheEntry,
        entries: List<TimeSlotCacheEntry>,
        staleTimeSlotIds: List<String>,
    ) {
        requireActiveViewer(snapshot.viewerKey)
        if (staleTimeSlotIds.isNotEmpty()) {
            deleteTimeSlots(staleTimeSlotIds, snapshot.viewerKey, snapshot.projectionKey)
        }
        if (entries.isNotEmpty()) upsertTimeSlots(entries)
        upsertCatalogQuery(snapshot)
    }

    @Transaction
    suspend fun upsertTimeSlotAndInvalidateQueries(entry: TimeSlotCacheEntry) {
        requireActiveViewer(entry.viewerKey)
        upsertTimeSlots(listOf(entry))
        deleteCatalogQueries(entry.viewerKey, CATALOG_RESOURCE_TIME_SLOTS)
    }

    @Transaction
    suspend fun deleteTimeSlotAndInvalidateQueries(id: String, viewerKey: String) {
        requireActiveViewer(viewerKey)
        // There are deliberately no independent field-slot cross references in v92. Exact field
        // associations live inside query snapshots, which are invalidated before this returns.
        deleteCatalogQueries(viewerKey, CATALOG_RESOURCE_TIME_SLOTS)
        deleteTimeSlot(id, viewerKey)
    }

    companion object {
        const val CATALOG_RESOURCE_TIME_SLOTS = "time-slots"
    }
}
