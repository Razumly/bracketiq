package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.MvpUploadFile
import com.razumly.mvp.core.presentation.util.ImageUploadTooLargeException
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingHandlerImpl
import com.razumly.mvp.core.util.LoadingOperation
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class EventImageCoordinatorTest {
    @Test
    fun image_ids_follow_repository_flow() = runTest {
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        try {
            val coordinator = EventImageCoordinator(
                imageIdsFlow = MutableStateFlow(listOf("image-1", "image-2")),
                uploadImageRequest = { Result.success("uploaded-image") },
                deleteImageRequest = { Result.success(Unit) },
                scope = scope,
            )

            assertEquals(listOf("image-1", "image-2"), coordinator.eventImageIds.value)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun delete_image_wraps_repository_call_with_loading_state() = runTest {
        val deletedImageIds = mutableListOf<String>()
        val loadingHandler = RecordingLoadingHandler()
        val coordinator = EventImageCoordinator(
            imageIdsFlow = MutableStateFlow(emptyList()),
            uploadImageRequest = { Result.success("uploaded-image") },
            deleteImageRequest = { imageId ->
                deletedImageIds += imageId
                Result.success(Unit)
            },
            scope = backgroundScope,
        )

        val result = coordinator.deleteImage("image-1", loadingHandler)

        assertTrue(result.isSuccess)
        assertEquals(listOf("image-1"), deletedImageIds)
        assertEquals(
            listOf("show:Deleting Image ...", "hide"),
            loadingHandler.events,
        )
    }

    @Test
    fun upload_conversion_failure_is_classified_and_always_hides_loading() = runTest {
        val loadingHandler = RecordingLoadingHandler()
        val coordinator = EventImageCoordinator(
            imageIdsFlow = MutableStateFlow(emptyList()),
            uploadImageRequest = { Result.success("unused") },
            deleteImageRequest = { Result.success(Unit) },
            photoToUploadFile = { throw IllegalArgumentException("cannot open uri") },
            scope = backgroundScope,
        )

        val outcome = coordinator.uploadSelected(
            photo = GalleryPhotoResult(uri = "file://missing.jpg", mimeType = "image/jpeg"),
            loadingHandler = loadingHandler,
        )

        assertEquals(
            EventImageUploadOutcome.Failure(EventImageFailure.CONVERSION),
            outcome,
        )
        assertEquals(listOf("show:Uploading image...", "hide"), loadingHandler.events)
    }

    @Test
    fun upload_oversize_failure_is_actionable_and_always_hides_loading() = runTest {
        val loadingHandler = RecordingLoadingHandler()
        val coordinator = EventImageCoordinator(
            imageIdsFlow = MutableStateFlow(emptyList()),
            uploadImageRequest = { Result.success("unused") },
            deleteImageRequest = { Result.success(Unit) },
            photoToUploadFile = { throw ImageUploadTooLargeException() },
            scope = backgroundScope,
        )

        val outcome = coordinator.uploadSelected(
            photo = GalleryPhotoResult(uri = "file://oversize.jpg", mimeType = "image/jpeg"),
            loadingHandler = loadingHandler,
        )

        assertEquals(
            EventImageUploadOutcome.Failure(EventImageFailure.TOO_LARGE),
            outcome,
        )
        assertTrue(eventImageFailureMessage(EventImageFailure.TOO_LARGE).contains("10MB"))
        assertEquals(listOf("show:Uploading image...", "hide"), loadingHandler.events)
    }

    @Test
    fun upload_conversion_cancellation_is_rethrown_and_always_hides_loading() = runTest {
        val loadingHandler = RecordingLoadingHandler()
        val coordinator = EventImageCoordinator(
            imageIdsFlow = MutableStateFlow(emptyList()),
            uploadImageRequest = { Result.success("unused") },
            deleteImageRequest = { Result.success(Unit) },
            photoToUploadFile = { throw CancellationException("selection cancelled") },
            scope = backgroundScope,
        )

        assertFailsWith<CancellationException> {
            coordinator.uploadSelected(
                photo = GalleryPhotoResult(uri = "file://cancelled.jpg", mimeType = "image/jpeg"),
                loadingHandler = loadingHandler,
            )
        }
        assertEquals(listOf("show:Uploading image...", "hide"), loadingHandler.events)
    }

    @Test
    fun upload_repository_failure_is_classified_and_always_hides_loading() = runTest {
        val loadingHandler = RecordingLoadingHandler()
        val coordinator = EventImageCoordinator(
            imageIdsFlow = MutableStateFlow(emptyList()),
            uploadImageRequest = { Result.failure(IllegalStateException("offline")) },
            deleteImageRequest = { Result.success(Unit) },
            photoToUploadFile = {
                MvpUploadFile(
                    bytes = byteArrayOf(1),
                    filename = "event.jpg",
                    mimeType = "image/jpeg",
                )
            },
            scope = backgroundScope,
        )

        val outcome = coordinator.uploadSelected(
            photo = GalleryPhotoResult(uri = "file://event.jpg", mimeType = "image/jpeg"),
            loadingHandler = loadingHandler,
        )

        assertEquals(
            EventImageUploadOutcome.Failure(EventImageFailure.UPLOAD),
            outcome,
        )
        assertEquals(listOf("show:Uploading image...", "hide"), loadingHandler.events)
    }

    @Test
    fun delete_failure_is_returned_and_always_hides_loading() = runTest {
        val loadingHandler = RecordingLoadingHandler()
        val coordinator = EventImageCoordinator(
            imageIdsFlow = MutableStateFlow(emptyList()),
            uploadImageRequest = { Result.success("uploaded-image") },
            deleteImageRequest = { Result.failure(IllegalStateException("offline")) },
            scope = backgroundScope,
        )

        val result = coordinator.deleteImage("image-1", loadingHandler)

        assertTrue(result.isFailure)
        assertEquals(listOf("show:Deleting Image ...", "hide"), loadingHandler.events)
    }

    private class RecordingLoadingHandler : LoadingHandler {
        private val delegate = LoadingHandlerImpl()
        override val loadingState = delegate.loadingState
        val events = mutableListOf<String>()

        override fun newOperation(): LoadingOperation {
            val operation = delegate.newOperation()
            return object : LoadingOperation {
                override fun showLoading(message: String, progress: Float?) {
                    events += "show:$message"
                    operation.showLoading(message, progress)
                }

                override fun hideLoading() {
                    events += "hide"
                    operation.hideLoading()
                }

                override fun updateProgress(progress: Float) {
                    operation.updateProgress(progress)
                }
            }
        }
    }
}
