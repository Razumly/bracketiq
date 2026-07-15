package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * The currently active authentication principal for the catalog cache.
 *
 * The repository rotates this value before every cached read. A change (including sign-out)
 * purges all catalog rows transactionally so a previous account can never be used as an offline
 * fallback for the next account.
 */
@Entity(tableName = "catalog_cache_viewer")
data class CatalogCacheViewerEntry(
    @PrimaryKey val id: String = "active",
    val viewerKey: String,
)

/**
 * An exact, ordered response snapshot for one normalized request.
 *
 * Item records are also stored below so single-record mutations remain Room-first, but collection
 * reads use this snapshot. That preserves server ordering, authoritative empty responses,
 * pagination, and projections whose response intentionally omits relationship fields.
 */
@Entity(
    tableName = "catalog_query_cache",
    indices = [
        Index("viewerKey"),
        Index(value = ["viewerKey", "resourceType", "projectionKey"]),
    ],
)
data class CatalogQueryCacheEntry(
    @PrimaryKey val cacheKey: String,
    val viewerKey: String,
    val resourceType: String,
    val projectionKey: String,
    val orderedIdsJson: String,
    val payloadJson: String,
    val paginationJson: String? = null,
    val isComplete: Boolean,
)

@Entity(
    tableName = "organization_cache",
    primaryKeys = ["viewerKey", "projectionKey", "organizationId"],
    indices = [Index("viewerKey")],
)
data class OrganizationCacheEntry(
    val viewerKey: String,
    val projectionKey: String,
    val organizationId: String,
    val payloadJson: String,
)

@Entity(
    tableName = "product_cache",
    primaryKeys = ["viewerKey", "projectionKey", "id"],
    indices = [
        Index("viewerKey"),
        Index(value = ["viewerKey", "projectionKey", "organizationId"]),
    ],
)
data class ProductCacheEntry(
    val viewerKey: String,
    val projectionKey: String,
    val id: String,
    val organizationId: String,
    val payloadJson: String,
)

@Entity(
    tableName = "organization_reviews_cache",
    indices = [
        Index("viewerKey"),
        Index(value = ["viewerKey", "organizationId", "cursorKey", "pageLimit"], unique = true),
    ],
)
data class OrganizationReviewsCacheEntry(
    @PrimaryKey val cacheKey: String,
    val viewerKey: String,
    val organizationId: String,
    val cursorKey: String,
    val pageLimit: Int,
    val payloadJson: String,
)

@Entity(
    tableName = "time_slot_cache",
    primaryKeys = ["viewerKey", "projectionKey", "id"],
    indices = [Index("viewerKey")],
)
data class TimeSlotCacheEntry(
    val viewerKey: String,
    val projectionKey: String,
    val id: String,
    val payloadJson: String,
)
