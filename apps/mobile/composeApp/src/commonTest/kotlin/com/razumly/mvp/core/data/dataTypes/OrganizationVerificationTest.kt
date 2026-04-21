package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OrganizationVerificationTest {
    @Test
    fun resolveOrganizationVerificationStatus_falls_back_to_legacy_connected() {
        val status = resolveOrganizationVerificationStatus(
            verificationStatus = null,
            hasStripeAccount = true,
        )

        assertEquals(OrganizationVerificationStatus.LEGACY_CONNECTED, status)
    }

    @Test
    fun resolveOrganizationVerificationReviewStatus_defaults_to_none() {
        val status = resolveOrganizationVerificationReviewStatus("not_a_real_status")

        assertEquals(OrganizationVerificationReviewStatus.NONE, status)
    }

    @Test
    fun canUsePaidBilling_accepts_verified_and_legacy_connected() {
        val verifiedOrganization = Organization(
            id = "org_verified",
            name = "Verified",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            website = null,
            officialIds = emptyList(),
            hasStripeAccount = false,
            verificationStatus = OrganizationVerificationStatus.VERIFIED,
            coordinates = null,
            fieldIds = emptyList(),
        )
        val pendingOrganization = verifiedOrganization.copy(
            id = "org_pending",
            verificationStatus = OrganizationVerificationStatus.PENDING,
        )
        val legacyOrganization = verifiedOrganization.copy(
            id = "org_legacy",
            verificationStatus = OrganizationVerificationStatus.LEGACY_CONNECTED,
        )

        assertTrue(verifiedOrganization.isVerified())
        assertTrue(verifiedOrganization.canUsePaidBilling())
        assertTrue(legacyOrganization.canUsePaidBilling())
        assertFalse(pendingOrganization.canUsePaidBilling())
    }
}
