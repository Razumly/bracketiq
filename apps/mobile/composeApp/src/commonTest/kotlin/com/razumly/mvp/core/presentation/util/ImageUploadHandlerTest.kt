package com.razumly.mvp.core.presentation.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ImageUploadHandlerTest {
    @Test
    fun resolvesSvgMimeTypeFromSelectedFileMimeType() {
        assertEquals(
            "image/svg+xml",
            resolveSupportedImageUploadMimeType(
                fileName = "event-logo",
                mimeType = "image/svg+xml",
            ),
        )
    }

    @Test
    fun resolvesSvgMimeTypeFromFileExtension() {
        assertEquals(
            "image/svg+xml",
            resolveSupportedImageUploadMimeType(
                fileName = "event-logo.svg",
                mimeType = null,
            ),
        )
    }

    @Test
    fun normalizesJpgMimeTypeToJpeg() {
        assertEquals(
            "image/jpeg",
            resolveSupportedImageUploadMimeType(
                fileName = "team.jpg",
                mimeType = "image/jpg",
            ),
        )
    }

    @Test
    fun rejectsGifUploads() {
        assertFailsWith<IllegalArgumentException> {
            requireSupportedImageUploadMimeType(
                fileName = "animated.gif",
                mimeType = "image/gif",
            )
        }
    }

    @Test
    fun imageSizeLimitMatchesServerContractAndHasActionableFeedback() {
        assertEquals(10 * 1024 * 1024, MAX_IMAGE_UPLOAD_BYTES)
        assertEquals(
            "Image must be 10MB or less. Choose a smaller image and try again.",
            ImageUploadTooLargeException().message,
        )
    }
}
