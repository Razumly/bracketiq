package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationStaffMember
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailScreenRoleVisibilityTest {

    @Test
    fun givenHost_whenCheckingOfficialsVisibility_thenReturnsTrue() {
        val event = Event(hostId = "host-1")

        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "host-1",
                event = event,
                organization = null,
            ),
        )
    }

    @Test
    fun givenAssistantHostOfficialOrOrganizationOwner_whenCheckingOfficialsVisibility_thenReturnsTrue() {
        val event = Event(
            hostId = "host-1",
            assistantHostIds = listOf("assistant-1"),
            officialIds = listOf("official-1"),
        )
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            website = null,
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
        )

        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "assistant-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "official-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "owner-1",
                event = event,
                organization = organization,
            ),
        )
    }

    @Test
    fun givenOrganizationHostStaffOrEventsPermission_whenCheckingOfficialsVisibility_thenReturnsTrue() {
        val event = Event(hostId = "host-1")
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            website = null,
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
            staffMembers = listOf(
                OrganizationStaffMember(
                    id = "staff-host-1",
                    organizationId = "org-1",
                    userId = "org-host-1",
                    types = listOf("HOST"),
                ),
            ),
        )

        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "org-host-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewOfficialsPanel(
                currentUserId = "staff-with-permission",
                event = event,
                organization = organization.copy(viewerPermissions = listOf("events.manage")),
            ),
        )
    }

    @Test
    fun givenRegularViewerOrgStaffOrBlankUser_whenCheckingOfficialsVisibility_thenReturnsFalse() {
        val event = Event(
            hostId = "host-1",
            assistantHostIds = listOf("assistant-1"),
            officialIds = listOf("official-1"),
        )
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            website = null,
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
        )

        assertFalse(
            canViewOfficialsPanel(
                currentUserId = "player-1",
                event = event,
                organization = organization,
            ),
        )
        assertFalse(
            canViewOfficialsPanel(
                currentUserId = "org-host-1",
                event = event,
                organization = organization,
            ),
        )
        assertFalse(
            canViewOfficialsPanel(
                currentUserId = "   ",
                event = event,
                organization = organization,
            ),
        )
    }
}


