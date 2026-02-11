package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class Product(
    val name: String,
    val description: String? = null,
    val priceCents: Int,
    val period: String,
    val organizationId: String,
    val createdBy: String? = null,
    val isActive: Boolean? = null,
    val createdAt: String? = null,
    val stripeProductId: String? = null,
    val stripePriceId: String? = null,
    @Transient
    override val id: String = "",
) : MVPDocument
