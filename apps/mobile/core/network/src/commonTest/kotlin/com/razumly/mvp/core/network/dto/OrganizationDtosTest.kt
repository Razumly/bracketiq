package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class OrganizationDtosTest {
    @Test
    fun currentOrganizationContract_ignoresLegacyRelationshipArrays() {
        val dto = jsonMVP.decodeFromString<OrganizationApiDto>(
            """
            {
              "id": "org_1",
              "name": "River City Sports Club",
              "ownerId": "owner_1",
              "fieldIds": ["legacy_field"],
              "teamIds": ["legacy_team"],
              "productIds": ["product_1"]
            }
            """.trimIndent(),
        )

        val organization = dto.toOrganizationOrNull()!!

        assertEquals(emptyList(), organization.fieldIds)
        assertEquals(listOf("product_1"), organization.productIds)
        val encoded = jsonMVP.encodeToString(organization)
        assertFalse(encoded.contains("fieldIds"))
        assertFalse(encoded.contains("teamIds"))
    }

    @Test
    fun currentOrganizationContract_normalizesAffiliateFacilityFields() {
        val dto = jsonMVP.decodeFromString<OrganizationApiDto>(
            """
            {
              "id": "org_1",
              "name": "River City Sports Club",
              "facilities": [{
                "id": " facility_1 ",
                "name": " Main Gym ",
                "status": " ACTIVE ",
                "affiliateUrl": " https://example.test/book "
              }]
            }
            """.trimIndent(),
        )

        val facility = dto.toOrganizationOrNull()!!.facilities.single()

        assertEquals("facility_1", facility.id)
        assertEquals("Main Gym", facility.name)
        assertEquals("ACTIVE", facility.status)
        assertEquals("https://example.test/book", facility.affiliateUrl)
    }
}
