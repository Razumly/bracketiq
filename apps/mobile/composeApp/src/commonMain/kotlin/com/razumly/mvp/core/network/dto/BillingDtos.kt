package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.RefundRequest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class BillingUserRefDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val email: String? = null,
)

@Serializable
data class BillingEventRefDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val eventType: String? = null,
    @SerialName("price") val priceCents: Int? = null,
    val hostId: String? = null,
    val organizationId: String? = null,
)

@Serializable
data class PurchaseIntentRequestDto(
    val user: BillingUserRefDto? = null,
    val event: BillingEventRefDto? = null,
    val productId: String? = null,
)

@Serializable
data class StripeHostLinkRequestDto(
    val refreshUrl: String,
    val returnUrl: String,
    val user: BillingUserRefDto? = null,
    val organizationEmail: String? = null,
)

@Serializable
data class BillingRefundRequestDto(
    val payloadEvent: BillingEventRefDto,
    val userId: String? = null,
    val reason: String? = null,
)

@Serializable
data class RefundAllRequestDto(
    val eventId: String,
)

@Serializable
data class RefundRequestsResponseDto(
    val refunds: List<RefundRequest> = emptyList(),
)

@Serializable
data class UpdateRefundRequestDto(
    val status: String,
)
