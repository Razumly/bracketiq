package com.razumly.mvp.core.presentation.util


import io.appwrite.models.InputFile
import io.github.ismoy.imagepickerkmp.GalleryPhotoHandler

expect fun convertPhotoResultToInputFile(photoResult: GalleryPhotoHandler.PhotoResult): InputFile