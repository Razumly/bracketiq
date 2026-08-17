package com.razumly.mvp.organizationDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationClaimVerificationLevel
import com.razumly.mvp.core.data.dataTypes.OrganizationOwnershipAction
import com.razumly.mvp.core.data.dataTypes.OrganizationOwnershipStatus
import com.razumly.mvp.core.presentation.composables.OrganizationOwnershipBadges
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class OrganizationOwnershipUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun givenClaimedSiteControlledOrganization_whenRenderingBadges_thenBothTrustBadgesAppear() {
        composeRule.setContent {
            MaterialTheme {
                OrganizationOwnershipBadges(
                    organization = organization(
                        ownershipStatus = OrganizationOwnershipStatus.CLAIMED,
                        verificationLevel = OrganizationClaimVerificationLevel.SITE_CONTROL,
                    ),
                )
            }
        }

        composeRule.onNodeWithText("Claimed profile").assertExists()
        composeRule.onNodeWithText("Website verified").assertExists()
    }

    @Test
    fun givenUnclaimedOrganization_whenRenderingBadges_thenWebsiteVerificationIsHidden() {
        composeRule.setContent {
            MaterialTheme {
                OrganizationOwnershipBadges(
                    organization = organization(
                        ownershipStatus = OrganizationOwnershipStatus.UNCLAIMED,
                    ),
                )
            }
        }

        composeRule.onNodeWithText("Unclaimed profile").assertExists()
        composeRule.onNodeWithText("Website verified").assertDoesNotExist()
    }

    @Test
    fun givenResolvedClaimUrl_whenClickingClaimAction_thenUrlIsForwarded() {
        var openedUrl: String? = null
        composeRule.setContent {
            MaterialTheme {
                OrganizationClaimAction(
                    claimUrl = "https://bracket-iq.com/organizations/org_1/claim",
                    onOpenClaim = { openedUrl = it },
                )
            }
        }

        composeRule.onNodeWithText("Claim").performClick()
        assertEquals("https://bracket-iq.com/organizations/org_1/claim", openedUrl)
    }

    @Test
    fun givenMissingClaimUrl_whenRenderingClaimAction_thenButtonIsHidden() {
        composeRule.setContent {
            MaterialTheme {
                OrganizationClaimAction(
                    claimUrl = null,
                    onOpenClaim = {},
                )
            }
        }

        composeRule.onNodeWithText("Claim").assertDoesNotExist()
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
        claimable = ownershipStatus == OrganizationOwnershipStatus.UNCLAIMED,
        claimUrl = "/organizations/org_1/claim",
        ownershipAction = if (ownershipStatus == OrganizationOwnershipStatus.UNCLAIMED) {
            OrganizationOwnershipAction.CLAIM
        } else {
            OrganizationOwnershipAction.REPORT_OWNERSHIP_ISSUE
        },
    )
}
