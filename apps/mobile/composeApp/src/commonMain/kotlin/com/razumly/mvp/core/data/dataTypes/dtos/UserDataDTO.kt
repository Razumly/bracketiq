package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.util.toNameCase
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
    val blockedUserIds: List<String> = emptyList(),
    val hiddenEventIds: List<String> = emptyList(),
    val userName: String,
    val hasStripeAccount: Boolean?,
    val uploadedImages: List<String>,
    val profileImageId: String? = null,
    val displayName: String? = null,
    val isMinor: Boolean = false,
    val isIdentityHidden: Boolean = false,
    val chatTermsAcceptedAt: String? = null,
    val chatTermsVersion: String? = null,
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
                blockedUserIds = listOf(),
                hiddenEventIds = listOf(),
                userName = userName,
                hasStripeAccount = false,
                uploadedImages = listOf(),
                profileImageId = null,
                displayName = null,
                isMinor = false,
                isIdentityHidden = false,
                chatTermsAcceptedAt = null,
                chatTermsVersion = null,
                id = userId,
            )
        }
    }
}

suspend fun UserDataDTO.toUserData(id: String): UserData {
    return UserData(
        firstName = firstName.toNameCase(),
        lastName = lastName.toNameCase(),
        teamIds = teamIds,
        friendIds = friendIds,
        friendRequestIds = friendRequestIds,
        friendRequestSentIds = friendRequestSentIds,
        followingIds = followingIds,
        blockedUserIds = blockedUserIds,
        hiddenEventIds = hiddenEventIds,
        userName = userName,
        hasStripeAccount = hasStripeAccount,
        uploadedImages = uploadedImages,
        profileImageId = profileImageId,
        privacyDisplayName = displayName,
        isMinor = isMinor,
        isIdentityHidden = isIdentityHidden,
        chatTermsAcceptedAt = chatTermsAcceptedAt,
        chatTermsVersion = chatTermsVersion,
        id = id
    )
}
