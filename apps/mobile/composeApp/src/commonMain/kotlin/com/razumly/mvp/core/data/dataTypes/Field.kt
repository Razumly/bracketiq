package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.util.newId
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Field(
    val fieldNumber: Int,
    val divisions: List<String> = emptyList(),
    val lat: Double? = null,
    val long: Double? = null,
    val heading: Double? = null,
    val inUse: Boolean? = false,
    val name: String? = null,
    val type: String? = null,
    val rentalSlotIds: List<String> = emptyList(),
    val location: String? = null,
    val organizationId: String? = null,
    @PrimaryKey override val id: String = "",
) : MVPDocument {
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
                type = null,
                rentalSlotIds = listOf(),
                location = null,
                organizationId = organizationId,
                id = newId()
            )
        }
    }
}
