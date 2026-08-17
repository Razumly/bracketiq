package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class NetworkAvatarTest {

    @Test
    fun jersey_number_overrides_profile_image_source() {
        val source = resolveNetworkAvatarSource(
            displayName = "Alex Stone",
            imageRef = "profile_file_1",
            jerseyNumber = " 12 ",
            sizePx = 40,
        )

        assertEquals("12", source.fallbackText)
        assertNull(source.imageUrl)
    }

    @Test
    fun missing_jersey_number_keeps_profile_image_source() {
        val source = resolveNetworkAvatarSource(
            displayName = "Alex Stone",
            imageRef = "profile_file_1",
            jerseyNumber = null,
            sizePx = 40,
        )

        assertEquals("AS", source.fallbackText)
        assertNotNull(source.imageUrl)
    }

    @Test
    fun missing_profile_image_uses_local_initials_without_a_remote_model() {
        val source = resolveNetworkAvatarSource(
            displayName = "Alex Stone",
            imageRef = null,
            jerseyNumber = null,
            sizePx = 40,
        )

        assertEquals("AS", source.fallbackText)
        assertNull(source.imageUrl)
    }

    @Test
    fun server_initials_placeholder_is_replaced_by_the_local_fallback() {
        val source = resolveNetworkAvatarSource(
            displayName = "Alex Stone",
            imageRef = "https://bracket-iq.com/api/avatars/initials?name=Alex%20Stone&size=40",
            jerseyNumber = null,
            sizePx = 40,
        )

        assertEquals("AS", source.fallbackText)
        assertNull(source.imageUrl)
    }

    @Test
    fun local_initials_match_the_server_word_policy() {
        assertEquals("SAM", localAvatarText("Samuel"))
        assertEquals("SR", localAvatarText("Samuel Razumovskiy"))
        assertEquals("RCS", localAvatarText("River City Sports Club"))
        assertEquals("U", localAvatarText("   "))
    }

    @Test
    fun successful_images_hide_the_local_fallback_but_loading_and_errors_keep_it_visible() {
        assertEquals(true, shouldShowLocalAvatarFallback(hasImageModel = false, imageSucceeded = false))
        assertEquals(true, shouldShowLocalAvatarFallback(hasImageModel = true, imageSucceeded = false))
        assertEquals(false, shouldShowLocalAvatarFallback(hasImageModel = true, imageSucceeded = true))
    }
}
