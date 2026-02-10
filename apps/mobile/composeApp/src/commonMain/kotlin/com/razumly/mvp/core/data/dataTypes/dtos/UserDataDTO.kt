package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class UserDataDTO(
    val firstName: String,
    val lastName: String,
    val teamIds: List<String>,
    val friendIds: List<String>,
    val friendRequestIds: List<String>,
    val friendRequestSentIds: List<String>,
    val followingIds: List<String>,
    val userName: String,
    val hasStripeAccount: Boolean?,
    val uploadedImages: List<String>,
    val profileImageId: String? = null,
    @Transient val id: String = "",
) {
    companion object {
        operator fun invoke(
            firstName: String, lastName: String, userName: String, userId: String
        ): UserDataDTO {
            return UserDataDTO(
                firstName = firstName,
                lastName = lastName,
                teamIds = listOf(),
                friendIds = listOf(),
                friendRequestIds = listOf(),
                friendRequestSentIds = listOf(),
                followingIds = listOf(),
                userName = userName,
                hasStripeAccount = false,
                uploadedImages = listOf(),
                profileImageId = null,
                id = userId,
            )
        }
    }
}

suspend fun UserDataDTO.toUserData(id: String): UserData {
    return UserData(
        firstName = firstName,
        lastName = lastName,
        teamIds = teamIds,
        friendIds = friendIds,
        friendRequestIds = friendRequestIds,
        friendRequestSentIds = friendRequestSentIds,
        followingIds = followingIds,
        userName = userName,
        hasStripeAccount = hasStripeAccount,
        uploadedImages = uploadedImages,
        profileImageId = profileImageId,
        id = id
    )
}
