package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.presentation.util.toNameCase
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
    val blockedUserIds: List<String> = emptyList(),
    val hiddenEventIds: List<String> = emptyList(),
    val userName: String,
    val hasStripeAccount: Boolean?,
    val uploadedImages: List<String>,
    val profileImageId: String? = null,
    val privacyDisplayName: String? = null,
    val isMinor: Boolean = false,
    val isIdentityHidden: Boolean = false,
    val chatTermsAcceptedAt: String? = null,
    val chatTermsVersion: String? = null,
    @PrimaryKey override val id: String,
) : MVPDocument, DisplayableEntity {
    override val displayName: String get() = fullName
    override val imageUrl: String? get() = profileImageId

    companion object {
        const val NAME_HIDDEN_LABEL = "Name Hidden"

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
                blockedUserIds = emptyList(),
                hiddenEventIds = emptyList(),
                profileImageId = null,
                privacyDisplayName = null,
                isMinor = false,
                isIdentityHidden = false,
                chatTermsAcceptedAt = null,
                chatTermsVersion = null,
                id = ""
            )
        }
    }

    val fullName: String
        get() {
            val explicitDisplayName = privacyDisplayName?.trim()?.takeIf(String::isNotBlank)
            if (explicitDisplayName != null) {
                return explicitDisplayName
            }

            val resolvedFullName = "$firstName $lastName".trim()
            if (resolvedFullName.isNotBlank()) {
                return resolvedFullName.toNameCase()
            }

            if (isIdentityHidden) {
                return NAME_HIDDEN_LABEL
            }

            val normalizedHandle = userName.trim()
            return if (normalizedHandle.isNotBlank()) normalizedHandle else "User"
        }

    val shouldRestrictSocialActions: Boolean
        get() = isMinor || isIdentityHidden

    val publicHandle: String?
        get() {
            if (isIdentityHidden) return null
            val normalizedHandle = userName.trim().ifBlank { "user" }
            return "@$normalizedHandle"
        }

    fun toUserDataDTO(): UserDataDTO {
        return UserDataDTO(
            firstName = firstName,
            lastName = lastName,
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
            displayName = privacyDisplayName,
            isMinor = isMinor,
            isIdentityHidden = isIdentityHidden,
            chatTermsAcceptedAt = chatTermsAcceptedAt,
            chatTermsVersion = chatTermsVersion,
            id = id,
        )
    }
}
