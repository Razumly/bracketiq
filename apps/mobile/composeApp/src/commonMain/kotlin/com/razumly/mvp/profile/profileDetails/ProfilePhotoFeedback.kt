package com.razumly.mvp.profile.profileDetails

import com.razumly.mvp.core.util.ErrorMessage
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.ismoy.imagepickerkmp.features.imagepicker.model.ImagePickerResult

internal const val PROFILE_PHOTO_RETRY_ACTION_LABEL = "Try again"

internal sealed interface ProfilePhotoPickerOutcome {
    data object Ignore : ProfilePhotoPickerOutcome
    data class Upload(val photo: GalleryPhotoResult) : ProfilePhotoPickerOutcome
    data class Failure(val message: String) : ProfilePhotoPickerOutcome
}

internal enum class ProfilePhotoUploadFailure {
    CONVERSION,
    UPLOAD,
}

internal fun resolveProfilePhotoPickerOutcome(
    result: ImagePickerResult,
): ProfilePhotoPickerOutcome = when (result) {
    ImagePickerResult.Idle,
    ImagePickerResult.Loading,
    ImagePickerResult.Dismissed,
    -> ProfilePhotoPickerOutcome.Ignore

    is ImagePickerResult.Success -> result.photos.firstOrNull()
        ?.let(ProfilePhotoPickerOutcome::Upload)
        ?: ProfilePhotoPickerOutcome.Failure("No profile photo was selected. Please try again.")

    is ImagePickerResult.Error -> ProfilePhotoPickerOutcome.Failure(
        "We couldn't access your selected profile photo. Please try again.",
    )
}

internal fun profilePhotoUploadFailureMessage(
    failure: ProfilePhotoUploadFailure,
): String = when (failure) {
    ProfilePhotoUploadFailure.CONVERSION ->
        "We couldn't read that profile photo. Choose another image and try again."
    ProfilePhotoUploadFailure.UPLOAD ->
        "We couldn't upload your profile photo. Check your connection and try again."
}

internal fun profilePhotoRetryError(
    message: String,
    onRetry: () -> Unit,
): ErrorMessage = ErrorMessage(
    message = message,
    actionLabel = PROFILE_PHOTO_RETRY_ACTION_LABEL,
    action = onRetry,
)
