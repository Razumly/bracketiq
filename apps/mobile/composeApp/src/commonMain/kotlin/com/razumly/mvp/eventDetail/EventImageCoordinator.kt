package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.network.MvpUploadFile
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.util.LoadingHandler
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

internal class EventImageCoordinator(
    imageIdsFlow: Flow<List<String>>,
    private val uploadImageRequest: suspend (MvpUploadFile) -> Result<String>,
    private val deleteImageRequest: suspend (String) -> Result<Unit>,
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

    suspend fun uploadSelected(photo: GalleryPhotoResult) {
        uploadImageRequest(convertPhotoResultToUploadFile(photo))
    }

    suspend fun deleteImage(
        imageId: String,
        loadingHandler: LoadingHandler,
    ) {
        loadingHandler.showLoading("Deleting Image ...")
        deleteImageRequest(imageId)
        loadingHandler.hideLoading()
    }
}
