package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class SensitiveUserData(
    val userId: String,
    val email: String,
    val billingAddressLine1: String? = null,
    val billingAddressLine2: String? = null,
    val billingCity: String? = null,
    val billingState: String? = null,
    val billingPostalCode: String? = null,
    val billingCountryCode: String? = null,
    @Transient
    override val id: String = "",
) : MVPDocument
