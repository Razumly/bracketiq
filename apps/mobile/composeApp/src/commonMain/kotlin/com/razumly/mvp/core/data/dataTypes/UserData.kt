package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.presentation.util.toTitleCase
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class UserData(
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
    @PrimaryKey override val id: String,
) : MVPDocument, DisplayableEntity {
    override val displayName: String get() = fullName
    override val imageUrl: String? get() = profileImageId

    companion object {
        operator fun invoke(): UserData {
            return UserData(
                firstName = "",
                lastName = "",
                teamIds = emptyList(),
                friendIds = emptyList(),
                userName = "",
                hasStripeAccount = false,
                uploadedImages = emptyList(),
                friendRequestIds = emptyList(),
                friendRequestSentIds = emptyList(),
                followingIds = emptyList(),
                profileImageId = null,
                id = ""
            )
        }
    }

    val fullName: String
        get() = "$firstName $lastName".toTitleCase()

    fun toUserDataDTO(): UserDataDTO {
        return UserDataDTO(
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
}
