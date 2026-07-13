package com.razumly.mvp.profile.profileDetails

import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.ismoy.imagepickerkmp.features.imagepicker.model.ImagePickerResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ProfilePhotoFeedbackTest {

    @Test
    fun given_empty_picker_success_when_resolved_then_it_reports_an_actionable_failure() {
        val outcome = resolveProfilePhotoPickerOutcome(ImagePickerResult.Success(emptyList()))

        val failure = assertIs<ProfilePhotoPickerOutcome.Failure>(outcome)
        assertEquals("No profile photo was selected. Please try again.", failure.message)
    }

    @Test
    fun given_picker_provider_error_when_resolved_then_it_reports_an_actionable_failure() {
        val outcome = resolveProfilePhotoPickerOutcome(
            ImagePickerResult.Error(IllegalStateException("provider unavailable")),
        )

        val failure = assertIs<ProfilePhotoPickerOutcome.Failure>(outcome)
        assertEquals("We couldn't access your selected profile photo. Please try again.", failure.message)
    }

    @Test
    fun given_dismissed_picker_when_resolved_then_it_does_not_show_an_error() {
        assertEquals(
            ProfilePhotoPickerOutcome.Ignore,
            resolveProfilePhotoPickerOutcome(ImagePickerResult.Dismissed),
        )
    }

    @Test
    fun given_selected_photos_when_resolved_then_it_uploads_only_the_first_photo() {
        val first = GalleryPhotoResult(uri = "file://first.jpg", mimeType = "image/jpeg")
        val second = GalleryPhotoResult(uri = "file://second.jpg", mimeType = "image/jpeg")

        val outcome = resolveProfilePhotoPickerOutcome(ImagePickerResult.Success(listOf(first, second)))

        assertEquals(ProfilePhotoPickerOutcome.Upload(first), outcome)
    }

    @Test
    fun given_retry_feedback_when_action_is_invoked_then_it_relaunches_the_picker() {
        var retries = 0
        val error = profilePhotoRetryError("Try again", onRetry = { retries += 1 })

        assertEquals(PROFILE_PHOTO_RETRY_ACTION_LABEL, error.actionLabel)
        error.action?.invoke()
        assertEquals(1, retries)
    }

    @Test
    fun given_conversion_and_upload_failures_when_message_is_built_then_the_recovery_guidance_is_distinct() {
        val conversion = profilePhotoUploadFailureMessage(ProfilePhotoUploadFailure.CONVERSION)
        val upload = profilePhotoUploadFailureMessage(ProfilePhotoUploadFailure.UPLOAD)

        assertTrue(conversion.contains("read"))
        assertTrue(upload.contains("upload"))
        assertTrue(conversion != upload)
    }
}
