package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlin.test.Test
import kotlin.test.assertEquals

class FieldDtosTest {
    @Test
    fun fields_response_decodes_partial_backend_field_payloads() {
        val response = jsonMVP.decodeFromString<FieldsResponseDto>(
            """
                {
                  "fields": [
                    {
                      "id": "field_1",
                      "name": "Court 1",
                      "organizationId": "org_1"
                    }
                  ]
                }
            """.trimIndent(),
        )

        assertEquals(1, response.fields.size)
        assertEquals("field_1", response.fields.single().id)
        assertEquals(0, response.fields.single().fieldNumber)
        assertEquals("Court 1", response.fields.single().name)
    }
}
