package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import com.razumly.mvp.core.util.newId
import kotlinx.serialization.Serializable

@Serializable
data class Facility(
    val id: String,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val coordinates: List<Double>? = null,
    val status: String? = null,
    val affiliateUrl: String? = null,
) {
    val resolvedId: String
        get() = id
}

fun Facility.normalizedAffiliateUrl(): String? =
    affiliateUrl?.trim()?.takeIf(String::isNotBlank)

fun Facility.isActiveAffiliateRental(): Boolean =
    normalizedAffiliateUrl() != null &&
        status?.trim()?.uppercase()?.takeIf(String::isNotBlank).let { it == null || it == "ACTIVE" }

@Entity
@Serializable
data class Field(
    val fieldNumber: Int = 0,
    val divisions: List<String> = emptyList(),
    val lat: Double? = null,
    val long: Double? = null,
    val heading: Double? = null,
    val inUse: Boolean? = false,
    val name: String? = null,
    val rentalSlotIds: List<String> = emptyList(),
    val location: String? = null,
    val organizationId: String? = null,
    /**
     * The canonical facility relationship. This stays in the Room entity so a
     * cached field retains its facility grouping after an offline read.
     */
    var facilityId: String? = null,
    @PrimaryKey override val id: String,
) : MVPDocument {
    @Ignore
    var facility: Facility? = null

    companion object {
        operator fun invoke(fieldNumber: Int, organizationId: String? = null): Field {
            return Field(
                fieldNumber = fieldNumber,
                divisions = listOf(),
                lat = null,
                long = null,
                heading = null,
                inUse = false,
                name = null,
                rentalSlotIds = listOf(),
                location = null,
                organizationId = organizationId,
                id = newId()
            )
        }
    }
}
