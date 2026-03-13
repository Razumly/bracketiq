package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailScreenRoleVisibilityTest {

    @Test
    fun givenHost_whenCheckingRefereesVisibility_thenReturnsTrue() {
        val event = Event(hostId = "host-1")

        assertTrue(
            canViewRefereesSection(
                currentUserId = "host-1",
                event = event,
                organization = null,
            ),
        )
    }

    @Test
    fun givenAssistantHostRefereeOrOrganizationManager_whenCheckingRefereesVisibility_thenReturnsTrue() {
        val event = Event(
            hostId = "host-1",
            assistantHostIds = listOf("assistant-1"),
            refereeIds = listOf("ref-1"),
        )
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            hostIds = listOf("org-host-1"),
            website = null,
            refIds = emptyList(),
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
        )

        assertTrue(
            canViewRefereesSection(
                currentUserId = "assistant-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewRefereesSection(
                currentUserId = "ref-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewRefereesSection(
                currentUserId = "owner-1",
                event = event,
                organization = organization,
            ),
        )
        assertTrue(
            canViewRefereesSection(
                currentUserId = "org-host-1",
                event = event,
                organization = organization,
            ),
        )
    }

    @Test
    fun givenRegularViewerOrBlankUser_whenCheckingRefereesVisibility_thenReturnsFalse() {
        val event = Event(
            hostId = "host-1",
            assistantHostIds = listOf("assistant-1"),
            refereeIds = listOf("ref-1"),
        )
        val organization = Organization(
            id = "org-1",
            name = "Org One",
            location = null,
            description = null,
            logoId = null,
            ownerId = "owner-1",
            hostIds = listOf("org-host-1"),
            website = null,
            refIds = emptyList(),
            hasStripeAccount = false,
            coordinates = null,
            fieldIds = emptyList(),
        )

        assertFalse(
            canViewRefereesSection(
                currentUserId = "player-1",
                event = event,
                organization = organization,
            ),
        )
        assertFalse(
            canViewRefereesSection(
                currentUserId = "   ",
                event = event,
                organization = organization,
            ),
        )
    }
}
