package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class Subscription(
    val productId: String,
    val userId: String,
    val organizationId: String? = null,
    val startDate: String,
    val priceCents: Int,
    val period: String,
    val status: String? = null,
    val stripeSubscriptionId: String? = null,
    @Transient
    override val id: String = "",
) : MVPDocument
