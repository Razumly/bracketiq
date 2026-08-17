package com.razumly.mvp.core.presentation.util

import kotlin.test.Test
import kotlin.test.assertEquals

class ImageUploadHandlerTest {
    @Test
    fun preservesSelectedMimeTypeWithoutOwningTheServerAllowlist() {
        assertEquals(
            "image/gif",
            normalizeSelectedImageContentType(" Image/GIF; charset=binary "),
        )
    }

    @Test
    fun usesGenericBinaryContentTypeWhenThePickerProvidesNone() {
        assertEquals(
            "application/octet-stream",
            normalizeSelectedImageContentType(null),
        )
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
