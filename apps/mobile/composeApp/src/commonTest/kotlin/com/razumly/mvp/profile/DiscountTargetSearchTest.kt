package com.razumly.mvp.profile

import com.razumly.mvp.core.data.repositories.DiscountTarget
import kotlin.test.Test
import kotlin.test.assertEquals

class DiscountTargetSearchTest {
    @Test
    fun givenBlankQuery_whenRankingTargets_thenReturnsAlphabeticalResults() {
        val targets = listOf(
            target(id = "2", label = "Wednesday Pickup"),
            target(id = "1", label = "Monday League"),
        )

        val result = rankDiscountTargets(targets, query = "")

        assertEquals(listOf("Monday League", "Wednesday Pickup"), result.map { it.label })
    }

    @Test
    fun givenSpaceSeparatedQuery_whenRankingTargets_thenMatchesIndependentTerms() {
        val targets = listOf(
            target(id = "1", label = "Mobile Discount Creation QA"),
            target(id = "2", label = "Sunday Open Gym"),
            target(id = "3", label = "Creation Lab", description = "Mobile event"),
        )

        val result = rankDiscountTargets(targets, query = "creation mobile")

        assertEquals(
            listOf("Mobile Discount Creation QA", "Creation Lab"),
            result.map { it.label },
        )
    }

    @Test
    fun givenFlatDiscount_whenCalculatingFinalPrice_thenClampsWithinOriginalPrice() {
        assertEquals(3500, finalPriceCentsFromFlatDiscount(originalPriceCents = 5000, discountAmountCents = 1500))
        assertEquals(0, finalPriceCentsFromFlatDiscount(originalPriceCents = 5000, discountAmountCents = 6000))
        assertEquals(5000, finalPriceCentsFromFlatDiscount(originalPriceCents = 5000, discountAmountCents = -100))
    }

    @Test
    fun givenPercentDiscount_whenCalculatingFinalPrice_thenSupportsFullDiscountAndClamps() {
        assertEquals(4000, finalPriceCentsFromPercentDiscount(originalPriceCents = 5000, discountPercent = 20.0))
        assertEquals(0, finalPriceCentsFromPercentDiscount(originalPriceCents = 5000, discountPercent = 100.0))
        assertEquals(0, finalPriceCentsFromPercentDiscount(originalPriceCents = 5000, discountPercent = 120.0))
        assertEquals(5000, finalPriceCentsFromPercentDiscount(originalPriceCents = 5000, discountPercent = -5.0))
    }

    @Test
    fun givenFinalPrice_whenCalculatingDisplayedDiscountValues_thenReturnsFlatAndPercentValues() {
        assertEquals(1000, discountAmountCentsForFinalPrice(originalPriceCents = 5000, finalPriceCents = 4000))
        assertEquals(20.0, discountPercentForFinalPrice(originalPriceCents = 5000, finalPriceCents = 4000))
        assertEquals(100.0, discountPercentForFinalPrice(originalPriceCents = 5000, finalPriceCents = 0))
        assertEquals(0.0, discountPercentForFinalPrice(originalPriceCents = 0, finalPriceCents = 0))
    }

    private fun target(
        id: String,
        label: String,
        description: String? = null,
    ): DiscountTarget = DiscountTarget(
        id = id,
        label = label,
        description = description,
        priceCents = 2500,
        itemType = "EVENT",
        targetType = "EVENT",
    )
}
