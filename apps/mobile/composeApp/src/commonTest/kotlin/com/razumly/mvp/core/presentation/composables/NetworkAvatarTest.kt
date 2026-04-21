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

        assertEquals("12", source.fallbackName)
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

        assertEquals("Alex Stone", source.fallbackName)
        assertNotNull(source.imageUrl)
    }
}
