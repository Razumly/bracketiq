package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class BillingAddressDraft(
    val line1: String = "",
    val line2: String? = null,
    val city: String = "",
    val state: String = "",
    val postalCode: String = "",
    val countryCode: String = "US",
) {
    fun normalized(): BillingAddressDraft = copy(
        line1 = line1.trim(),
        line2 = line2?.trim()?.takeIf(String::isNotBlank),
        city = city.trim(),
        state = state.trim().uppercase(),
        postalCode = postalCode.trim(),
        countryCode = countryCode.trim().uppercase().ifBlank { "US" },
    )

    fun isCompleteForUsTax(): Boolean {
        val normalized = normalized()
        return normalized.line1.isNotBlank() &&
            normalized.city.isNotBlank() &&
            normalized.state.isNotBlank() &&
            normalized.postalCode.isNotBlank() &&
            normalized.countryCode == "US"
    }
}

@Serializable
data class BillingAddressProfile(
    val billingAddress: BillingAddressDraft? = null,
    val email: String? = null,
)
