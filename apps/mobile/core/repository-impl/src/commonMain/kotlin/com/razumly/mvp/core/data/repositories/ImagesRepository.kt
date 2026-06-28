package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.MvpUploadFile
import com.razumly.mvp.core.network.dto.FileUploadResponseDto
import io.ktor.client.call.body
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.header
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

interface IImagesRepository {
    suspend fun uploadImage(inputFile: MvpUploadFile): Result<String>
    fun getUserImageIdsFlow(): Flow<List<String>>
    suspend fun addImageToUser(imageId: String): Result<Unit>
    suspend fun deleteImage(imageId: String): Result<Unit>
}

class ImagesRepository(
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
) : IImagesRepository {
    override suspend fun uploadImage(
        inputFile: MvpUploadFile
    ): Result<String> = runCatching {
        val token = api.tokenStore.get()
        val response = api.http.submitFormWithBinaryData(
            url = api.urlFor("api/files/upload"),
            formData = formData {
                append(
                    // Next.js/Undici requires a quoted multipart field name for this route.
                    key = "\"file\"",
                    value = inputFile.bytes,
                    headers = Headers.build {
                        append(HttpHeaders.ContentType, inputFile.mimeType)
                        append(
                            HttpHeaders.ContentDisposition,
                            "filename=\"${inputFile.filename}\"",
                        )
                    },
                )
            },
        ) {
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
        }.body<FileUploadResponseDto>()

        val fileId = response.file?.id?.takeIf(String::isNotBlank)
            ?: error("Upload response missing file id")

        addImageToUser(fileId).getOrThrow()
        fileId
    }

    override fun getUserImageIdsFlow(): Flow<List<String>> {
        return userRepository.currentUser.map { user -> user.getOrThrow().uploadedImages}
    }

    override suspend fun addImageToUser(imageId: String): Result<Unit> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()

        val updatedImages = user.uploadedImages.toMutableList().apply {
            if (!contains(imageId)) add(imageId)
        }
        val updatedUser = user.copy(uploadedImages = updatedImages)

        userRepository.updateUser(updatedUser).getOrThrow()
    }

    override suspend fun deleteImage(imageId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/files/$imageId")

        // Server will also remove the file id from any `uploadedImages` arrays it is present in.
        runCatching { userRepository.getCurrentAccount().getOrThrow() }
    }
}
