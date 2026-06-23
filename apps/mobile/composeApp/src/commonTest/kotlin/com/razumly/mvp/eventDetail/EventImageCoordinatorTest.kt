package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

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

        coordinator.deleteImage("image-1", loadingHandler)

        assertEquals(listOf("image-1"), deletedImageIds)
        assertEquals(
            listOf("show:Deleting Image ...", "hide"),
            loadingHandler.events,
        )
    }

    private class RecordingLoadingHandler : LoadingHandler {
        private val _loadingState = MutableStateFlow(LoadingState())
        override val loadingState: StateFlow<LoadingState> = _loadingState.asStateFlow()
        val events = mutableListOf<String>()

        override fun showLoading(message: String, progress: Float?) {
            events += "show:$message"
            _loadingState.value = LoadingState(isLoading = true, message = message, progress = progress)
        }

        override fun hideLoading() {
            events += "hide"
            _loadingState.value = LoadingState()
        }

        override fun updateProgress(progress: Float) {
            _loadingState.value = _loadingState.value.copy(progress = progress)
        }
    }
}
