package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlin.jvm.Transient

@Serializable
data class BillingAddress(
    val line1: String,
    val line2: String,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String,
    @Transient
    override val id: String = ""
) : MVPDocument {

    companion object {
        fun empty() = BillingAddress(
            line1 = "",
            line2 = "",
            city = "",
            state = "",
            postalCode = "",
            country = ""
        )
    }
}
