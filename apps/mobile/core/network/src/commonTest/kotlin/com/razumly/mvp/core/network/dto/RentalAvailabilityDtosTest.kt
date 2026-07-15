package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RentalAvailabilityDtosTest {
    @Test
    fun rentalAvailabilityResponse_decodes_server_snapshot_contract() {
        val response = jsonMVP.decodeFromString<RentalAvailabilityResponseDto>(
            """
                {
                  "range": {
                    "start": "2026-07-13T07:00:00.000Z",
                    "end": "2026-07-20T07:00:00.000Z"
                  },
                  "fields": [
                    {
                      "id": "field_1",
                      "fieldNumber": null,
                      "name": "Court 1",
                      "facilityId": "facility_1",
                      "facilityName": "River City Sports Club",
                      "rentalSlots": [
                        {
                          "id": "slot_1",
                          "daysOfWeek": [0, 2],
                          "startTimeMinutes": 540,
                          "endTimeMinutes": 1260,
                          "startDate": "2026-07-01T00:00:00.000Z",
                          "endDate": null,
                          "timeZone": "America/Los_Angeles",
                          "repeating": true,
                          "price": 2500
                        }
                      ]
                    }
                  ],
                  "busyBlocks": [
                    {
                      "fieldId": "field_1",
                      "start": "2026-07-14T17:00:00.000Z",
                      "end": "2026-07-14T18:00:00.000Z"
                    }
                  ]
                }
            """.trimIndent(),
        )

        assertEquals("field_1", response.fields.single().id)
        assertNull(response.fields.single().fieldNumber)
        assertEquals(listOf(0, 2), response.fields.single().rentalSlots.single().daysOfWeek)
        assertEquals("field_1", response.busyBlocks.single().fieldId)
    }
}
