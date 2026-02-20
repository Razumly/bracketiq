package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequestDto(
    val email: String,
    val password: String,
)

@Serializable
data class GoogleMobileLoginRequestDto(
    val idToken: String,
)

@Serializable
data class RegisterRequestDto(
    val email: String,
    val password: String,
    val name: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val dateOfBirth: String? = null,
    val enforceProfileConflictSelection: Boolean? = null,
    val profileSelection: RegisterProfileSelectionDto? = null,
)

@Serializable
data class RegisterProfileSelectionDto(
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val dateOfBirth: String? = null,
)

@Serializable
data class RegisterProfileSnapshotDto(
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val dateOfBirth: String? = null,
)

@Serializable
data class RegisterProfileConflictDto(
    val fields: List<String> = emptyList(),
    val existing: RegisterProfileSnapshotDto? = null,
    val incoming: RegisterProfileSnapshotDto? = null,
)

@Serializable
data class RegisterConflictResponseDto(
    val error: String? = null,
    val code: String? = null,
    val conflict: RegisterProfileConflictDto? = null,
)

@Serializable
data class PasswordRequestDto(
    val currentPassword: String? = null,
    val newPassword: String,
    val userId: String? = null,
)

@Serializable
data class AuthUserDto(
    val id: String? = null,
    val email: String? = null,
    val name: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class AuthSessionDto(
    val userId: String,
    val isAdmin: Boolean,
)

@Serializable
data class UserProfileDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val teamIds: List<String>? = null,
    val friendIds: List<String>? = null,
    val friendRequestIds: List<String>? = null,
    val friendRequestSentIds: List<String>? = null,
    val followingIds: List<String>? = null,
    val userName: String? = null,
    val hasStripeAccount: Boolean? = null,
    val uploadedImages: List<String>? = null,
    val profileImageId: String? = null,
    // Server includes fields not present in app UserData; we keep them here only to avoid decode failures.
    val dateOfBirth: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    @SerialName("\$createdAt") val legacyCreatedAt: String? = null,
    @SerialName("\$updatedAt") val legacyUpdatedAt: String? = null,
)

@Serializable
data class AuthResponseDto(
    val user: AuthUserDto? = null,
    val session: AuthSessionDto? = null,
    val token: String? = null,
    val profile: UserProfileDto? = null,
)

@Serializable
data class OkResponseDto(
    val ok: Boolean,
)

@Serializable
data class UsersResponseDto(
    val users: List<UserProfileDto> = emptyList(),
)

@Serializable
data class UserResponseDto(
    val user: UserProfileDto? = null,
)

@Serializable
data class EnsureUserByEmailRequestDto(
    val email: String,
)

@Serializable
data class UpdateUserRequestDto(
    val data: UserUpdateDto,
)

@Serializable
data class UserUpdateDto(
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val teamIds: List<String>? = null,
    val friendIds: List<String>? = null,
    val friendRequestIds: List<String>? = null,
    val friendRequestSentIds: List<String>? = null,
    val followingIds: List<String>? = null,
    val hasStripeAccount: Boolean? = null,
    val uploadedImages: List<String>? = null,
    val profileImageId: String? = null,
)

fun AuthUserDto.toAuthAccountOrNull(): AuthAccount? {
    val userId = id?.takeIf(String::isNotBlank) ?: return null
    val emailAddr = email?.takeIf(String::isNotBlank) ?: return null
    return AuthAccount(id = userId, email = emailAddr, name = name)
}

fun UserProfileDto.toUserDataOrNull(): UserData? {
    val resolvedId = (id ?: legacyId)?.takeIf(String::isNotBlank) ?: return null
    return UserData(
        firstName = firstName.orEmpty(),
        lastName = lastName.orEmpty(),
        teamIds = teamIds ?: emptyList(),
        friendIds = friendIds ?: emptyList(),
        friendRequestIds = friendRequestIds ?: emptyList(),
        friendRequestSentIds = friendRequestSentIds ?: emptyList(),
        followingIds = followingIds ?: emptyList(),
        userName = userName.orEmpty(),
        hasStripeAccount = hasStripeAccount,
        uploadedImages = uploadedImages ?: emptyList(),
        profileImageId = profileImageId,
        id = resolvedId,
    )
}
