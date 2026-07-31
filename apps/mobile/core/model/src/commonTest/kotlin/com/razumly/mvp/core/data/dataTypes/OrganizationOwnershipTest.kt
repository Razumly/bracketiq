package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OrganizationOwnershipTest {
    @Test
    fun givenOwnershipStatuses_whenPresentingBadges_thenWebLabelsAndTonesArePreserved() {
        val expected = mapOf(
            OrganizationOwnershipStatus.UNCLAIMED to
                ("Unclaimed profile" to OrganizationOwnershipBadgeTone.NEUTRAL),
            OrganizationOwnershipStatus.CLAIM_PENDING to
                ("Claim pending" to OrganizationOwnershipBadgeTone.WARNING),
            OrganizationOwnershipStatus.CLAIMED to
                ("Claimed profile" to OrganizationOwnershipBadgeTone.INFO),
            OrganizationOwnershipStatus.REVIEW_REQUIRED to
                ("Ownership under review" to OrganizationOwnershipBadgeTone.WARNING),
            OrganizationOwnershipStatus.DISPUTED to
                ("Ownership under review" to OrganizationOwnershipBadgeTone.WARNING),
            OrganizationOwnershipStatus.SUSPENDED to
                ("Ownership restricted" to OrganizationOwnershipBadgeTone.ERROR),
        )

        expected.forEach { (status, presentation) ->
            val organization = organization(ownershipStatus = status)
            assertEquals(presentation.first, organization.ownershipBadgeLabel)
            assertEquals(presentation.second, organization.ownershipBadgeTone)
        }
    }

    @Test
    fun givenSiteControl_whenOwnershipIsClaimed_thenWebsiteVerifiedBadgeIsShown() {
        assertTrue(
            organization(
                ownershipStatus = OrganizationOwnershipStatus.CLAIMED,
                verificationLevel = OrganizationClaimVerificationLevel.SITE_CONTROL,
            ).showsWebsiteVerifiedBadge,
        )
        assertFalse(
            organization(
                ownershipStatus = OrganizationOwnershipStatus.CLAIM_PENDING,
                verificationLevel = OrganizationClaimVerificationLevel.SITE_CONTROL,
            ).showsWebsiteVerifiedBadge,
        )
    }

    @Test
    fun givenMissingOrUnknownOwnershipValues_whenNormalizing_thenWebFallbacksAreUsed() {
        assertEquals(OrganizationOriginType.FIRST_PARTY, resolveOrganizationOriginType(null))
        assertEquals(OrganizationOwnershipStatus.CLAIMED, resolveOrganizationOwnershipStatus("future"))
        assertEquals(
            OrganizationClaimVerificationLevel.NONE,
            resolveOrganizationClaimVerificationLevel("future"),
        )
        assertEquals(
            OrganizationOwnershipAction.REPORT_OWNERSHIP_ISSUE,
            resolveOrganizationOwnershipAction(
                ownershipAction = "future",
                ownershipStatus = OrganizationOwnershipStatus.CLAIMED,
            ),
        )
    }

    @Test
    fun givenRelativeClaimPath_whenResolving_thenConfiguredWebOriginIsUsed() {
        assertEquals(
            "http://10.0.2.2:3000/organizations/org_1/claim",
            resolveOrganizationClaimUrl(
                rawUrl = "/organizations/org_1/claim",
                webBaseUrl = "http://10.0.2.2:3000/",
            ),
        )
        assertEquals(
            "https://bracket-iq.com/organizations/org_1/claim",
            resolveOrganizationClaimUrl(
                rawUrl = "https://bracket-iq.com/organizations/org_1/claim",
                webBaseUrl = "http://10.0.2.2:3000",
            ),
        )
    }

    @Test
    fun givenUntrustedClaimPath_whenResolving_thenItIsRejected() {
        assertNull(
            resolveOrganizationClaimUrl(
                rawUrl = "//evil.example/organizations/org_1/claim",
                webBaseUrl = "https://bracket-iq.com",
            ),
        )
        assertNull(
            resolveOrganizationClaimUrl(
                rawUrl = "javascript:alert(1)",
                webBaseUrl = "https://bracket-iq.com",
            ),
        )
        assertNull(
            resolveOrganizationClaimUrl(
                rawUrl = "/organizations/../claim",
                webBaseUrl = "https://bracket-iq.com",
            ),
        )
    }

    private fun organization(
        ownershipStatus: OrganizationOwnershipStatus,
        verificationLevel: OrganizationClaimVerificationLevel = OrganizationClaimVerificationLevel.NONE,
    ): Organization = Organization(
        id = "org_1",
        name = "River City Sports Club",
        location = null,
        description = null,
        logoId = null,
        ownerId = "",
        website = null,
        hasStripeAccount = false,
        coordinates = null,
        ownershipStatus = ownershipStatus,
        claimVerificationLevel = verificationLevel,
    )
}
