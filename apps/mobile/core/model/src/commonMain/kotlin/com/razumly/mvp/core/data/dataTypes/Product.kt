@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.native.ObjCName

@Serializable
enum class ProductTaxCategory {
    ONE_TIME_PRODUCT,
    DAY_PASS,
    EQUIPMENT_RENTAL,
    SUBSCRIPTION,
    NON_TAXABLE,
}

@Serializable
data class Product(
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
    @Transient
    override val id: String = "",
) : MVPDocument
