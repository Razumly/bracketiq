package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.projectId
import io.appwrite.ID
import io.appwrite.models.InputFile
import io.appwrite.services.Storage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

interface IImagesRepository {
    suspend fun uploadImage(inputFile: InputFile): Result<String>
    suspend fun getUserImages(): Result<List<String>>
    fun getUserImagesFlow(): Flow<List<String>>
    suspend fun addImageToUser(imageUrl: String): Result<Unit>
    suspend fun deleteImage(fileId: String): Result<Unit>
}

class ImagesRepository(
    private val storage: Storage,
    private val userRepository: IUserRepository
) : IImagesRepository {

    companion object {
        private const val BUCKET_ID = "courtImages" // Create this bucket in Appwrite Console
    }

    override suspend fun uploadImage(
        inputFile: InputFile
    ): Result<String> = runCatching {
        val fileId = ID.unique()

        val file = storage.createFile(
            bucketId = BUCKET_ID,
            fileId = fileId,
            file = inputFile,
            permissions = listOf("read(\"any\")")
        )

        // Generate the public URL for the uploaded file
        val imageUrl = "${DbConstants.APPWRITE_ENDPOINT}/storage/buckets/$BUCKET_ID/files/${file.id}/view?project=${projectId}"

        addImageToUser(imageUrl).getOrThrow()

        imageUrl
    }

    override suspend fun getUserImages(): Result<List<String>> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        user.uploadedImages
    }

    override fun getUserImagesFlow(): Flow<List<String>> {
        return userRepository.currentUser
            .map { it.getOrThrow().uploadedImages }
    }

    override suspend fun addImageToUser(imageUrl: String): Result<Unit> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()

        val updatedImages = user.uploadedImages.toMutableList().apply { add(imageUrl) }
        val updatedUser = user.copy(uploadedImages = updatedImages)

        userRepository.updateUser(updatedUser).getOrThrow()
    }

    override suspend fun deleteImage(fileId: String): Result<Unit> = runCatching {
        storage.deleteFile(BUCKET_ID, fileId)
    }
}
