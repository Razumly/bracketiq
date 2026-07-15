package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.dto.InclusivePriceQuoteResponseDto

private const val SUPPORTED_INCLUSIVE_PRICE_QUOTE_VERSION = 1

enum class InclusivePriceQuoteDirection {
    HOST_AMOUNT,
    TOTAL_PRICE,
}

data class InclusivePriceBreakdown(
    val hostReceivesCents: Int,
    val processingFeeCents: Int,
    val platformFeeCents: Int,
    val totalPriceCents: Int,
    val platformFeePercentage: Double,
)

data class InclusivePriceQuote(
    val version: Int,
    val direction: InclusivePriceQuoteDirection,
    val requestedAmountCents: Int,
    val breakdown: InclusivePriceBreakdown,
)

internal fun InclusivePriceQuoteResponseDto.toValidatedQuote(
    requestedDirection: InclusivePriceQuoteDirection,
    requestedAmountCents: Int,
): InclusivePriceQuote {
    require(version == SUPPORTED_INCLUSIVE_PRICE_QUOTE_VERSION) {
        "Unsupported inclusive price quote version: $version."
    }

    val responseDirection = InclusivePriceQuoteDirection.entries
        .firstOrNull { candidate -> candidate.name == direction }
        ?: throw IllegalArgumentException("Unsupported inclusive price quote direction: $direction.")
    require(responseDirection == requestedDirection) {
        "Inclusive price quote direction did not match the request."
    }

    val responseBreakdown = breakdown
    require(
        responseBreakdown.hostReceivesCents >= 0 &&
            responseBreakdown.processingFeeCents >= 0 &&
            responseBreakdown.platformFeeCents >= 0 &&
            responseBreakdown.totalPriceCents >= 0,
    ) {
        "Inclusive price quote amounts must not be negative."
    }
    require(
        responseBreakdown.platformFeePercentage.isFinite() &&
            responseBreakdown.platformFeePercentage in 0.0..1.0,
    ) {
        "Inclusive price quote platform fee percentage is invalid."
    }

    val componentTotal = responseBreakdown.hostReceivesCents.toLong() +
        responseBreakdown.processingFeeCents.toLong() +
        responseBreakdown.platformFeeCents.toLong()
    require(componentTotal == responseBreakdown.totalPriceCents.toLong()) {
        "Inclusive price quote amounts do not add up to the total price."
    }

    val responseAnchorCents = when (requestedDirection) {
        InclusivePriceQuoteDirection.HOST_AMOUNT -> responseBreakdown.hostReceivesCents
        InclusivePriceQuoteDirection.TOTAL_PRICE -> responseBreakdown.totalPriceCents
    }
    require(responseAnchorCents == requestedAmountCents) {
        "Inclusive price quote did not preserve the requested amount."
    }

    return InclusivePriceQuote(
        version = version,
        direction = responseDirection,
        requestedAmountCents = requestedAmountCents,
        breakdown = InclusivePriceBreakdown(
            hostReceivesCents = responseBreakdown.hostReceivesCents,
            processingFeeCents = responseBreakdown.processingFeeCents,
            platformFeeCents = responseBreakdown.platformFeeCents,
            totalPriceCents = responseBreakdown.totalPriceCents,
            platformFeePercentage = responseBreakdown.platformFeePercentage,
        ),
    )
}
