package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class Organization(
    val id: String,
    val name: String,
    val location: String?,
    val description: String?,
    val logoId: String?,
    val ownerId: String?,
    val website: String?,
    val refIds: List<String>,
    val hasStripeAccount: Boolean,
    val coordinates: List<Double>?,
    val fieldIds: List<String>
)

@Serializable
data class OrganizationDTO(
    val name: String,
    val location: String? = null,
    val description: String? = null,
    val logoId: String? = null,
    val ownerId: String? = null,
    val website: String? = null,
    val refIds: List<String> = emptyList(),
    val hasStripeAccount: Boolean = false,
    val coordinates: List<Double>? = null,
    val fieldIds: List<String> = emptyList()
) {
    fun toOrganization(id: String): Organization =
        Organization(
            id = id,
            name = name,
            location = location,
            description = description,
            logoId = logoId,
            ownerId = ownerId,
            website = website,
            refIds = refIds,
            hasStripeAccount = hasStripeAccount,
            coordinates = coordinates,
            fieldIds = fieldIds
        )
}
