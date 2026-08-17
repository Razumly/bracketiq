package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.MvpUploadFile
import com.razumly.mvp.core.network.dto.FileUploadResponseDto
import com.razumly.mvp.core.network.dto.ImageUploadPolicyDto
import io.github.aakira.napier.Napier
import io.ktor.client.call.body
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.header
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

interface IImagesRepository {
    suspend fun uploadImage(inputFile: MvpUploadFile): Result<String>
    fun getUserImageIdsFlow(): Flow<List<String>>
    suspend fun addImageToUser(imageId: String): Result<Unit>
    suspend fun deleteImage(imageId: String): Result<Unit>
}

internal interface UserImageAssociationStore {
    val imageIds: Flow<List<String>>

    suspend fun addImage(imageId: String): Result<Unit>
    suspend fun refreshCurrentAccount(): Result<Unit>
}

private class RepositoryUserImageAssociationStore(
    private val userRepository: IUserRepository,
) : UserImageAssociationStore {
    override val imageIds: Flow<List<String>> = userRepository.currentUser.map { user ->
        user.getOrThrow().uploadedImages
    }

    override suspend fun addImage(imageId: String): Result<Unit> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        val updatedImages = user.uploadedImages.toMutableList().apply {
            if (!contains(imageId)) add(imageId)
        }
        userRepository.updateUploadedImages(updatedImages).getOrThrow()
    }

    override suspend fun refreshCurrentAccount(): Result<Unit> = userRepository.getCurrentAccount()
}

class ImagesRepository internal constructor(
    private val api: MvpApiClient,
    private val userImageStore: UserImageAssociationStore,
    private val cleanupFailureReporter: (String, Throwable, Throwable) -> Unit =
        ::reportImageAssociationCleanupFailure,
) : IImagesRepository {
    constructor(
        api: MvpApiClient,
        userRepository: IUserRepository,
    ) : this(
        api = api,
        userImageStore = RepositoryUserImageAssociationStore(userRepository),
    )

    override suspend fun uploadImage(
        inputFile: MvpUploadFile
    ): Result<String> = runCatching {
        val policy = api.get<ImageUploadPolicyDto>("api/files/upload")
        require(policy.version > 0) { "Image upload policy has an invalid version" }
        require(policy.maxBytes > 0) { "Image upload policy has an invalid size limit" }
        if (inputFile.bytes.size.toLong() > policy.maxBytes) {
            throw IllegalArgumentException(policy.tooLargeMessage)
        }
        val resolvedContentType = resolveImageUploadContentType(
            policy = policy,
            fileName = inputFile.filename,
            contentType = inputFile.mimeType,
        ) ?: throw IllegalArgumentException(policy.unsupportedTypeMessage)

        val token = api.tokenStore.get()
        val response = api.http.submitFormWithBinaryData(
            url = api.urlFor("api/files/upload"),
            formData = formData {
                append(
                    // Next.js/Undici requires a quoted multipart field name for this route.
                    key = "\"file\"",
                    value = inputFile.bytes,
                    headers = Headers.build {
                        append(HttpHeaders.ContentType, resolvedContentType)
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

        associateUploadedProfileImage(
            fileId = fileId,
            associateImage = ::addImageToUser,
            deleteImage = ::deleteImage,
            reportCleanupFailure = cleanupFailureReporter,
        ).getOrThrow()
    }

    override fun getUserImageIdsFlow(): Flow<List<String>> = userImageStore.imageIds

    override suspend fun addImageToUser(imageId: String): Result<Unit> = userImageStore.addImage(imageId)

    override suspend fun deleteImage(imageId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/files/$imageId")

        // Server will also remove the file id from any `uploadedImages` arrays it is present in.
        runCatching { userImageStore.refreshCurrentAccount().getOrThrow() }
    }
}

internal fun resolveImageUploadContentType(
    policy: ImageUploadPolicyDto,
    fileName: String?,
    contentType: String?,
): String? {
    val normalizedContentType = contentType
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase()
        ?.takeIf(String::isNotBlank)

    policy.mimeTypes.firstOrNull { supported ->
        supported.equals(normalizedContentType, ignoreCase = true)
    }?.let { matched ->
        return if (matched.equals("image/jpg", ignoreCase = true)) "image/jpeg" else matched.lowercase()
    }

    val normalizedName = fileName?.trim()?.lowercase().orEmpty()
    return policy.mimeTypesByExtension.entries
        .sortedByDescending { it.key.length }
        .firstOrNull { (extension, _) ->
            extension.isNotBlank() && normalizedName.endsWith(extension.lowercase())
        }
        ?.value
        ?.lowercase()
}

internal suspend fun associateUploadedProfileImage(
    fileId: String,
    associateImage: suspend (String) -> Result<Unit>,
    deleteImage: suspend (String) -> Result<Unit>,
    reportCleanupFailure: (String, Throwable, Throwable) -> Unit,
): Result<String> {
    val associationFailure = runCatching {
        associateImage(fileId).getOrThrow()
    }.exceptionOrNull() ?: return Result.success(fileId)

    val cleanupFailure = withContext(NonCancellable) {
        runCatching {
            deleteImage(fileId).getOrThrow()
        }.exceptionOrNull()
    }

    if (cleanupFailure != null) {
        if (cleanupFailure !== associationFailure) {
            runCatching { associationFailure.addSuppressed(cleanupFailure) }
        }
        runCatching {
            reportCleanupFailure(fileId, associationFailure, cleanupFailure)
        }
    }

    return Result.failure(associationFailure)
}

private fun reportImageAssociationCleanupFailure(
    fileId: String,
    associationFailure: Throwable,
    cleanupFailure: Throwable,
) {
    Napier.e(
        message = "Failed to remove uploaded image $fileId after profile association failed: " +
            associationFailure.message,
        throwable = cleanupFailure,
        tag = IMAGES_REPOSITORY_LOG_TAG,
    )
}

private const val IMAGES_REPOSITORY_LOG_TAG = "ImagesRepository"
