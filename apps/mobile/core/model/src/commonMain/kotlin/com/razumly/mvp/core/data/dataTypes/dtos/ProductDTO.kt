@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.ProductTaxCategory
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.native.ObjCName

@Serializable
data class ProductDTO(
    val name: String,
    @property:ObjCName(swiftName = "productDescription")
    val description: String? = null,
    val priceCents: Int,
    val period: String,
    val organizationId: String,
    val createdBy: String? = null,
    val isActive: Boolean? = null,
    val createdAt: String? = null,
    val stripeProductId: String? = null,
    val stripePriceId: String? = null,
    val taxCategory: ProductTaxCategory = ProductTaxCategory.ONE_TIME_PRODUCT,
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
            taxCategory = taxCategory,
            id = id
        )
}
