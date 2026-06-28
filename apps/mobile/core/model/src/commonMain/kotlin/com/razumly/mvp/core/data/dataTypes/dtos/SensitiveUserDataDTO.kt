package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.SensitiveUserData
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class SensitiveUserDataDTO(
    val userId: String,
    val email: String,
    val billingAddressLine1: String? = null,
    val billingAddressLine2: String? = null,
    val billingCity: String? = null,
    val billingState: String? = null,
    val billingPostalCode: String? = null,
    val billingCountryCode: String? = null,
    @Transient val id: String = "",
) {
    fun toSensitiveUserData(id: String): SensitiveUserData =
        SensitiveUserData(
            userId = userId,
            email = email,
            billingAddressLine1 = billingAddressLine1,
            billingAddressLine2 = billingAddressLine2,
            billingCity = billingCity,
            billingState = billingState,
            billingPostalCode = billingPostalCode,
            billingCountryCode = billingCountryCode,
            id = id
        )
}
