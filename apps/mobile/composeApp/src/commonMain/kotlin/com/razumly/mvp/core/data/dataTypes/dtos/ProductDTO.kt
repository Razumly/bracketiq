package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Product
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class ProductDTO(
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
    @Transient val id: String = "",
) {
    fun toProduct(id: String): Product =
        Product(
            name = name,
            description = description,
            priceCents = priceCents,
            period = period,
            organizationId = organizationId,
            createdBy = createdBy,
            isActive = isActive,
            createdAt = createdAt,
            stripeProductId = stripeProductId,
            stripePriceId = stripePriceId,
            id = id
        )
}
