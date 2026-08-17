package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.resolvedLogoRef
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DiscoverImageFallbackTest {
    @Test
    fun resolvedLogoRef_prefersCanonicalFileIdOverRequestOriginUrl() {
        val organization = Organization(
            id = "org-1",
            name = "Olympus Sports Center",
            location = "Portland, OR",
            description = null,
            logoId = "local-logo-id",
            logoUrl = "http://0.0.0.0:3000/api/files/local-logo-id/preview?w=96&h=96",
            imageUrl = "http://0.0.0.0:3000/api/files/local-logo-id/preview?w=96&h=96",
            ownerId = "owner-1",
            website = null,
            hasStripeAccount = false,
            coordinates = null,
        )

        assertEquals("local-logo-id", organization.resolvedLogoRef())
    }

    @Test
    fun resolveEventCardImageSource_usesEventInitialsWhenEventAndOrganizationImagesAreMissing() {
        val source = resolveEventCardImageSource(
            eventName = "Open Gym 7/22",
            eventImageId = null,
            organizationLogoId = null,
        )

        assertTrue(source.imageUrl.contains("/api/avatars/initials"))
        assertEquals(source.imageUrl, source.fallbackImageUrl)
        assertTrue(source.imageUrl.contains("name=Open%20Gym%207"))
        assertTrue(source.imageUrl.contains("size=1080"))
        assertFalse(source.usesLogoFallback)
    }

    @Test
    fun resolveEventCardImageSource_prefersEventImageThenOrganizationLogo() {
        val eventImage = resolveEventCardImageSource(
            eventName = "Event",
            eventImageId = "event-image-id",
            organizationLogoId = "organization-logo-id",
        )
        val organizationLogo = resolveEventCardImageSource(
            eventName = "Event",
            eventImageId = null,
            organizationLogoId = "organization-logo-id",
        )

        assertTrue(eventImage.imageUrl.contains("/api/files/event-image-id/preview"))
        assertTrue(eventImage.fallbackImageUrl.contains("/api/avatars/initials"))
        assertTrue(eventImage.imageUrl.contains("trim=true"))
        assertFalse(eventImage.usesLogoFallback)
        assertTrue(organizationLogo.imageUrl.contains("/api/files/organization-logo-id/preview"))
        assertFalse(organizationLogo.imageUrl.contains("trim=true"))
        assertTrue(organizationLogo.usesLogoFallback)
    }
}
