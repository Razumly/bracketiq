package com.razumly.mvp.eventSearch

import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.network.dto.FieldsResponseDto
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlin.test.Test
import kotlin.test.assertEquals

class RentalFieldDisplayLabelTest {
    @Test
    fun displayLabelPrefixesFacilityWhenAvailable() {
        val field = Field(
            id = "field_1",
            fieldNumber = 2,
            name = "Court 2",
        ).apply {
            facilityId = "facility_1"
            facility = Facility(
                id = "facility_1",
                name = "River City Sports Complex",
            )
        }

        assertEquals("River City Sports Complex - Court 2", field.displayLabel())
    }

    @Test
    fun displayLabelDoesNotRepeatFacilityName() {
        val field = Field(
            id = "field_1",
            fieldNumber = 1,
            name = "River City Sports Complex - Court 1",
        ).apply {
            facilityId = "facility_1"
            facility = Facility(
                id = "facility_1",
                name = "River City Sports Complex",
            )
        }

        assertEquals("River City Sports Complex - Court 1", field.displayLabel())
    }

    @Test
    fun fieldResponseDecodesNestedFacilityForRentalLabels() {
        val response = jsonMVP.decodeFromString<FieldsResponseDto>(
            """
            {
              "fields": [
                {
                  "id": "field_1",
                  "fieldNumber": 2,
                  "name": "Court 2",
                  "facilityId": "facility_1",
                  "facility": {
                    "id": "facility_1",
                    "${'$'}id": "facility_1",
                    "name": "River City Sports Complex"
                  },
                  "rentalSlotIds": []
                }
              ]
            }
            """.trimIndent()
        )

        val field = response.fields.single()
        assertEquals("facility_1", field.facilityId)
        assertEquals("facility_1", field.facility?.resolvedId)
        assertEquals("River City Sports Complex - Court 2", field.displayLabel())
    }
}
