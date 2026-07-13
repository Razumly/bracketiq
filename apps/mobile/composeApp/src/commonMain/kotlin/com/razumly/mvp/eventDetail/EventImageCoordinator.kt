package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.network.MvpUploadFile
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.util.LoadingHandler
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

internal class EventImageCoordinator(
    imageIdsFlow: Flow<List<String>>,
    private val uploadImageRequest: suspend (MvpUploadFile) -> Result<String>,
    private val deleteImageRequest: suspend (String) -> Result<Unit>,
    private val photoToUploadFile: (GalleryPhotoResult) -> MvpUploadFile = ::convertPhotoResultToUploadFile,
    scope: CoroutineScope,
) {
    constructor(
        imageRepository: IImagesRepository,
        scope: CoroutineScope,
    ) : this(
        imageIdsFlow = imageRepository.getUserImageIdsFlow(),
        uploadImageRequest = imageRepository::uploadImage,
        deleteImageRequest = imageRepository::deleteImage,
        scope = scope,
    )

    val eventImageIds: StateFlow<List<String>> =
        imageIdsFlow.stateIn(scope, SharingStarted.Eagerly, emptyList())

    suspend fun uploadSelected(
        photo: GalleryPhotoResult,
        loadingHandler: LoadingHandler,
    ): EventImageUploadOutcome {
        loadingHandler.showLoading("Uploading image...")
        return try {
            val uploadFile = try {
                photoToUploadFile(photo)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Throwable) {
                return EventImageUploadOutcome.Failure(EventImageFailure.CONVERSION)
            }

            val result = try {
                uploadImageRequest(uploadFile)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Throwable) {
                return EventImageUploadOutcome.Failure(EventImageFailure.UPLOAD)
            }

            result.fold(
                onSuccess = EventImageUploadOutcome::Success,
                onFailure = { error ->
                    if (error is CancellationException) {
                        throw error
                    }
                    EventImageUploadOutcome.Failure(EventImageFailure.UPLOAD)
                },
            )
        } finally {
            loadingHandler.hideLoading()
        }
    }

    suspend fun deleteImage(
        imageId: String,
        loadingHandler: LoadingHandler,
    ): Result<Unit> {
        loadingHandler.showLoading("Deleting Image ...")
        return try {
            val result = try {
                deleteImageRequest(imageId)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Throwable) {
                Result.failure(error)
            }
            result.exceptionOrNull()?.let { error ->
                if (error is CancellationException) {
                    throw error
                }
            }
            result
        } finally {
            loadingHandler.hideLoading()
        }
    }
}
