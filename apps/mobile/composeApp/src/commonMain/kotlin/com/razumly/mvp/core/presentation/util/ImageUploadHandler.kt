package com.razumly.mvp.core.presentation.util


import io.appwrite.models.InputFile
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult

expect fun convertPhotoResultToInputFile(photoResult: GalleryPhotoResult): InputFile