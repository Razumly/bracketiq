package com.razumly.mvp.core.presentation.util


import com.razumly.mvp.core.network.MvpUploadFile
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult

expect fun convertPhotoResultToUploadFile(photoResult: GalleryPhotoResult): MvpUploadFile
