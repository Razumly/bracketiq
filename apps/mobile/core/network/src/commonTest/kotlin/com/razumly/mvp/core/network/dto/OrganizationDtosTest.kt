package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.OrganizationClaimVerificationLevel
import com.razumly.mvp.core.data.dataTypes.OrganizationOriginType
import com.razumly.mvp.core.data.dataTypes.OrganizationOwnershipAction
import com.razumly.mvp.core.data.dataTypes.OrganizationOwnershipStatus
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

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

    @Test
    fun currentOrganizationContract_preservesDivisionRegistrationUrl() {
        val organization = jsonMVP.decodeFromString<OrganizationApiDto>(
            """
            {
              "id": "org_1",
              "name": "River City Sports Club",
              "divisions": [{
                "id": "division_1",
                "name": "Girls U14 Premier",
                "registrationUrl": "https://club.example/register"
              }]
            }
            """.trimIndent(),
        ).toOrganizationOrNull()!!

        assertEquals(
            "https://club.example/register",
            organization.divisions.single().registrationUrl,
        )
    }

    @Test
    fun givenOwnershipFields_whenMappingOrganization_thenTypedContractIsPreserved() {
        val organization = jsonMVP.decodeFromString<OrganizationApiDto>(
            """
            {
              "id": "org_affiliate",
              "name": "River City Sports Club",
              "originType": "AFFILIATE_IMPORTED",
              "ownershipStatus": "UNCLAIMED",
              "claimVerificationLevel": "NONE",
              "claimable": true,
              "claimUrl": "/organizations/org_affiliate/claim",
              "ownershipAction": "CLAIM"
            }
            """.trimIndent(),
        ).toOrganizationOrNull()!!

        assertEquals(OrganizationOriginType.AFFILIATE_IMPORTED, organization.originType)
        assertEquals(OrganizationOwnershipStatus.UNCLAIMED, organization.ownershipStatus)
        assertEquals(OrganizationClaimVerificationLevel.NONE, organization.claimVerificationLevel)
        assertTrue(organization.claimable)
        assertEquals("/organizations/org_affiliate/claim", organization.claimUrl)
        assertEquals(OrganizationOwnershipAction.CLAIM, organization.ownershipAction)
        assertTrue(organization.canClaimProfile)
    }

    @Test
    fun givenLegacyOrganizationResponse_whenMapping_thenOwnershipDefaultsToClaimed() {
        val organization = jsonMVP.decodeFromString<OrganizationApiDto>(
            """
            {
              "id": "org_first_party",
              "name": "Summit United"
            }
            """.trimIndent(),
        ).toOrganizationOrNull()!!

        assertEquals(OrganizationOriginType.FIRST_PARTY, organization.originType)
        assertEquals(OrganizationOwnershipStatus.CLAIMED, organization.ownershipStatus)
        assertEquals(OrganizationClaimVerificationLevel.NONE, organization.claimVerificationLevel)
        assertFalse(organization.claimable)
        assertEquals(OrganizationOwnershipAction.REPORT_OWNERSHIP_ISSUE, organization.ownershipAction)
        assertFalse(organization.canClaimProfile)
    }
}
