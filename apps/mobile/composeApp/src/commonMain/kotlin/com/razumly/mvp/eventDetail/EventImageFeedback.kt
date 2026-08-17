package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.util.ErrorMessage
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.ismoy.imagepickerkmp.features.imagepicker.model.ImagePickerResult

internal const val EVENT_IMAGE_RETRY_ACTION_LABEL = "Try again"

internal sealed interface EventImagePickerOutcome {
    data object Ignore : EventImagePickerOutcome
    data class Upload(val photo: GalleryPhotoResult) : EventImagePickerOutcome
    data class Failure(val message: String) : EventImagePickerOutcome
}

internal enum class EventImageFailure {
    TOO_LARGE,
    CONVERSION,
    UPLOAD,
    DELETE,
}

internal sealed interface EventImageUploadOutcome {
    data class Success(val imageId: String) : EventImageUploadOutcome
    data class Failure(val reason: EventImageFailure) : EventImageUploadOutcome
}

internal fun resolveEventImagePickerOutcome(
    result: ImagePickerResult,
): EventImagePickerOutcome = when (result) {
    ImagePickerResult.Idle,
    ImagePickerResult.Loading,
    ImagePickerResult.Dismissed,
    -> EventImagePickerOutcome.Ignore

    is ImagePickerResult.Success -> result.photos.firstOrNull()
        ?.let(EventImagePickerOutcome::Upload)
        ?: EventImagePickerOutcome.Failure("No event image was selected. Please try again.")

    is ImagePickerResult.Error -> EventImagePickerOutcome.Failure(
        "We couldn't access your selected event image. Please try again.",
    )
}

internal fun eventImageFailureMessage(
    failure: EventImageFailure,
): String = when (failure) {
    EventImageFailure.TOO_LARGE ->
        "Event image must be 10MB or less. Choose a smaller image and try again."
    EventImageFailure.CONVERSION ->
        "We couldn't read that event image. Choose another image and try again."
    EventImageFailure.UPLOAD ->
        "We couldn't upload your event image. Check your connection and try again."
    EventImageFailure.DELETE ->
        "We couldn't delete this event image. Check your connection and try again."
}

internal fun eventImageRetryError(
    message: String,
    onRetry: () -> Unit,
): ErrorMessage = ErrorMessage(
    message = message,
    actionLabel = EVENT_IMAGE_RETRY_ACTION_LABEL,
    action = { onRetry() },
)
