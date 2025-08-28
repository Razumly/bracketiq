package com.razumly.mvp.core.data.dataTypes

import androidx.compose.ui.graphics.ImageBitmap
import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.presentation.util.toTitleCase
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

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
    val teamInvites: List<String>,
    val eventInvites: List<String>,
    val tournamentInvites: List<String>,
    val hasStripeAccount: Boolean?,
    val uploadedImages: List<String>,
    val profileImage: String? = null,
    @PrimaryKey override val id: String,
) : MVPDocument {
    companion object {
        operator fun invoke(): UserData {
            return UserData(
                firstName = "",
                lastName = "",
                teamIds = emptyList(),
                friendIds = emptyList(),
                userName = "",
                teamInvites = emptyList(),
                eventInvites = emptyList(),
                tournamentInvites = emptyList(),
                hasStripeAccount = false,
                uploadedImages = emptyList(),
                friendRequestIds = emptyList(),
                friendRequestSentIds = emptyList(),
                followingIds = emptyList(),
                profileImage = null,
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
            teamInvites = teamInvites,
            eventInvites = eventInvites,
            tournamentInvites = tournamentInvites,
            hasStripeAccount = hasStripeAccount,
            uploadedImages = uploadedImages,
            profileImage = profileImage,
            id = id
        )
    }
}