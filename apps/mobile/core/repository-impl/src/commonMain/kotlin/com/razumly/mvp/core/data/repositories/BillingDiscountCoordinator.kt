package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.DiscountCodeCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountOfferCacheEntry
import com.razumly.mvp.core.data.dataTypes.DiscountTargetCacheEntry
import com.razumly.mvp.core.network.MvpApiClient
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map

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

/** Owns discount catalog observation, synchronization, and code mutations. */
internal class BillingDiscountCoordinator(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) {
    fun observeDiscounts(ownerType: String, ownerId: String?): Flow<List<DiscountOffer>> {
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

    suspend fun listDiscounts(ownerType: String, ownerId: String?): Result<List<DiscountOffer>> = runCatching {
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

    fun observeDiscountTargets(
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

    suspend fun listDiscountTargets(
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

    suspend fun createDiscount(
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

    suspend fun generateDiscountCode(
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

    suspend fun updateDiscountCodeStatus(
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

    suspend fun deleteDiscountCode(
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
}
