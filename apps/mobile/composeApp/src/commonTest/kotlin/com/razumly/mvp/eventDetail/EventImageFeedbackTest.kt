package com.razumly.mvp.eventDetail

import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.ismoy.imagepickerkmp.features.imagepicker.model.ImagePickerResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class EventImageFeedbackTest {
    @Test
    fun empty_picker_selection_has_an_actionable_retry_message() {
        val outcome = resolveEventImagePickerOutcome(ImagePickerResult.Success(emptyList()))

        val failure = assertIs<EventImagePickerOutcome.Failure>(outcome)
        assertEquals("No event image was selected. Please try again.", failure.message)
    }

    @Test
    fun picker_provider_error_has_an_actionable_retry_message() {
        val outcome = resolveEventImagePickerOutcome(
            ImagePickerResult.Error(IllegalStateException("provider unavailable")),
        )

        val failure = assertIs<EventImagePickerOutcome.Failure>(outcome)
        assertEquals("We couldn't access your selected event image. Please try again.", failure.message)
    }

    @Test
    fun picker_dismissal_is_not_reported_as_an_error() {
        assertEquals(
            EventImagePickerOutcome.Ignore,
            resolveEventImagePickerOutcome(ImagePickerResult.Dismissed),
        )
    }

    @Test
    fun picker_uses_the_first_selected_event_image() {
        val first = GalleryPhotoResult(uri = "file://first.jpg", mimeType = "image/jpeg")
        val second = GalleryPhotoResult(uri = "file://second.jpg", mimeType = "image/jpeg")

        assertEquals(
            EventImagePickerOutcome.Upload(first),
            resolveEventImagePickerOutcome(ImagePickerResult.Success(listOf(first, second))),
        )
    }

    @Test
    fun retry_error_invokes_the_recovery_action() {
        var retries = 0
        val error = eventImageRetryError("Try again", onRetry = { retries += 1 })

        assertEquals(EVENT_IMAGE_RETRY_ACTION_LABEL, error.actionLabel)
        error.action?.invoke()
        assertEquals(1, retries)
    }

    @Test
    fun repeated_retry_errors_are_distinct_state_updates() {
        val retry = {}

        assertNotEquals(
            eventImageRetryError("Try again", onRetry = retry),
            eventImageRetryError("Try again", onRetry = retry),
        )
    }

    @Test
    fun conversion_upload_and_delete_failures_have_distinct_recovery_guidance() {
        val conversion = eventImageFailureMessage(EventImageFailure.CONVERSION)
        val upload = eventImageFailureMessage(EventImageFailure.UPLOAD)
        val delete = eventImageFailureMessage(EventImageFailure.DELETE)

        assertTrue(conversion.contains("read"))
        assertTrue(upload.contains("upload"))
        assertTrue(delete.contains("delete"))
        assertTrue(setOf(conversion, upload, delete).size == 3)
    }
}
