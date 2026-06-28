package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "discount_offers",
    indices = [
        Index(value = ["ownerType", "ownerId"]),
    ],
)
data class DiscountOfferCacheEntry(
    @PrimaryKey val id: String,
    val ownerType: String,
    val ownerId: String,
    val name: String,
    val description: String? = null,
    val status: String = "ACTIVE",
    val targetType: String,
    val targetId: String,
    val originalPriceCents: Int,
    val discountedPriceCents: Int,
)

@Entity(
    tableName = "discount_codes",
    indices = [
        Index(value = ["discountId"]),
    ],
)
data class DiscountCodeCacheEntry(
    @PrimaryKey val id: String,
    val discountId: String,
    val code: String,
    val usageLimit: Int? = null,
    val usedCount: Int = 0,
    val status: String = "ACTIVE",
)

@Entity(
    tableName = "discount_targets",
    indices = [
        Index(value = ["ownerType", "ownerIdKey", "itemType"]),
    ],
)
data class DiscountTargetCacheEntry(
    @PrimaryKey val cacheKey: String,
    val ownerType: String,
    val ownerIdKey: String,
    val itemType: String,
    val id: String,
    val label: String,
    val description: String? = null,
    val priceCents: Int,
    val targetType: String,
)
