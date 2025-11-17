package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.util.DbConstants.BUCKET_ID
import io.appwrite.ID
import io.appwrite.models.InputFile
import io.appwrite.services.Storage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

interface IImagesRepository {
    suspend fun uploadImage(inputFile: InputFile): Result<String>
    fun getUserImageIdsFlow(): Flow<List<String>>
    suspend fun addImageToUser(imageUrl: String): Result<Unit>
    suspend fun deleteImage(imageId: String): Result<Unit>
}

class ImagesRepository(
    private val storage: Storage, private val userRepository: IUserRepository
) : IImagesRepository {
    override suspend fun uploadImage(
        inputFile: InputFile
    ): Result<String> = runCatching {
        val fileId = ID.unique()

        storage.createFile(
            bucketId = BUCKET_ID,
            fileId = fileId,
            file = inputFile,
            permissions = listOf("read(\"any\")")
        )

        addImageToUser(fileId).getOrThrow()
        getImageUrl(fileId)
    }

    override fun getUserImageIdsFlow(): Flow<List<String>> {
        return userRepository.currentUser.map { user -> user.getOrThrow().uploadedImages}
    }

    override suspend fun addImageToUser(imageUrl: String): Result<Unit> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()

        val updatedImages = user.uploadedImages.toMutableList().apply { add(imageUrl) }
        val updatedUser = user.copy(uploadedImages = updatedImages)

        userRepository.updateUser(updatedUser).getOrThrow()
    }

    override suspend fun deleteImage(imageId: String): Result<Unit> = runCatching {
        val user = userRepository.currentUser.value.getOrThrow()
        userRepository.updateUser(user.copy(uploadedImages = user.uploadedImages.filter { it != imageId }))
        storage.deleteFile(BUCKET_ID, imageId)
    }
}
