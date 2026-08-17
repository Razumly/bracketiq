package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.DiscountCodeCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountOfferCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountTargetCacheEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface DiscountDao {
    @Query("SELECT * FROM discount_offers WHERE ownerType = :ownerType ORDER BY name COLLATE NOCASE ASC")
    fun getDiscountOffersFlow(ownerType: String): Flow<List<DiscountOfferCacheEntry>>

    @Query("SELECT * FROM discount_codes")
    fun getDiscountCodesFlow(): Flow<List<DiscountCodeCacheEntry>>

    @Query(
        """
        SELECT * FROM discount_targets
        WHERE ownerType = :ownerType
          AND ownerIdKey = :ownerIdKey
          AND itemType = :itemType
        ORDER BY label COLLATE NOCASE ASC
        """
    )
    fun getDiscountTargetsFlow(
        ownerType: String,
        ownerIdKey: String,
        itemType: String,
    ): Flow<List<DiscountTargetCacheEntry>>

    @Upsert
    suspend fun upsertDiscountOffers(discounts: List<DiscountOfferCacheEntry>)

    @Upsert
    suspend fun upsertDiscountCodes(codes: List<DiscountCodeCacheEntry>)

    @Upsert
    suspend fun upsertDiscountTargets(targets: List<DiscountTargetCacheEntry>)

    @Query("DELETE FROM discount_offers WHERE ownerType = :ownerType")
    suspend fun deleteDiscountOffersForOwnerType(ownerType: String)

    @Query("DELETE FROM discount_codes WHERE discountId IN (:discountIds)")
    suspend fun deleteDiscountCodesForDiscounts(discountIds: List<String>)

    @Query("DELETE FROM discount_codes WHERE id = :codeId")
    suspend fun deleteDiscountCodeById(codeId: String)

    @Query(
        """
        DELETE FROM discount_targets
        WHERE ownerType = :ownerType
          AND ownerIdKey = :ownerIdKey
          AND itemType = :itemType
        """
    )
    suspend fun deleteDiscountTargets(
        ownerType: String,
        ownerIdKey: String,
        itemType: String,
    )

    @Transaction
    suspend fun replaceDiscountOffers(ownerType: String, discounts: List<DiscountOfferCacheEntry>, codes: List<DiscountCodeCacheEntry>) {
        val discountIds = discounts.map { it.id }
        if (discountIds.isNotEmpty()) {
            deleteDiscountCodesForDiscounts(discountIds)
        }
        deleteDiscountOffersForOwnerType(ownerType)
        upsertDiscountOffers(discounts)
        upsertDiscountCodes(codes)
    }

    @Transaction
    suspend fun replaceDiscountTargets(
        ownerType: String,
        ownerIdKey: String,
        itemType: String,
        targets: List<DiscountTargetCacheEntry>,
    ) {
        deleteDiscountTargets(ownerType, ownerIdKey, itemType)
        upsertDiscountTargets(targets)
    }
}
