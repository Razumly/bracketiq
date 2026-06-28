package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Subscription
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class SubscriptionDTO(
    val productId: String,
    val userId: String,
    val organizationId: String? = null,
    val startDate: String,
    val priceCents: Int,
    val period: String,
    val status: String? = null,
    val stripeSubscriptionId: String? = null,
    @Transient val id: String = "",
) {
    fun toSubscription(id: String): Subscription =
        Subscription(
            productId = productId,
            userId = userId,
            organizationId = organizationId,
            startDate = startDate,
            priceCents = priceCents,
            period = period,
            status = status,
            stripeSubscriptionId = stripeSubscriptionId,
            id = id
        )
}
