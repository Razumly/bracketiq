package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.NotificationSettings
import com.razumly.mvp.core.data.dataTypes.defaultNotificationSettings
import com.razumly.mvp.core.data.dataTypes.normalizeNotificationSettings
import com.razumly.mvp.core.data.util.toNameCase
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.Clock

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
data class AppleMobileLoginRequestDto(
    val identityToken: String,
    val authorizationCode: String,
    val user: String? = null,
    val email: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
)

@Serializable
data class WatchSetupRequestDto(
    val platform: String = "android",
)

@Serializable
data class WatchSetupResponseDto(
    val setupToken: String,
    val expiresInSeconds: Int,
)

@Serializable
data class WatchSetupMessageDto(
    val setupToken: String,
    val issuedAt: String,
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
data class DeleteAccountRequestDto(
    val confirmationText: String,
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
    val sessionVersion: Int? = null,
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
    val blockedUserIds: List<String>? = null,
    val hiddenEventIds: List<String>? = null,
    val userName: String? = null,
    val hasStripeAccount: Boolean? = null,
    val uploadedImages: List<String>? = null,
    val profileImageId: String? = null,
    val displayName: String? = null,
    val isMinor: Boolean? = null,
    val isIdentityHidden: Boolean? = null,
    val chatTermsAcceptedAt: String? = null,
    val chatTermsVersion: String? = null,
    val notificationSettings: NotificationSettings? = null,
    // Server includes fields not present in app UserData; we keep them here only to avoid decode failures.
    val dateOfBirth: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    @SerialName("\$createdAt") val legacyCreatedAt: String? = null,
    @SerialName("\$updatedAt") val legacyUpdatedAt: String? = null,
)

@Serializable
data class AuthResponseDto(
    val error: String? = null,
    val code: String? = null,
    val email: String? = null,
    val requiresEmailVerification: Boolean? = null,
    val verificationEmailSent: Boolean? = null,
    val requiresProfileCompletion: Boolean? = null,
    val missingProfileFields: List<String> = emptyList(),
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
    val dateOfBirth: String? = null,
    val userName: String? = null,
    val teamIds: List<String>? = null,
    val friendIds: List<String>? = null,
    val friendRequestIds: List<String>? = null,
    val friendRequestSentIds: List<String>? = null,
    val followingIds: List<String>? = null,
    val hasStripeAccount: Boolean? = null,
    val uploadedImages: List<String>? = null,
    val profileImageId: String? = null,
    val notificationSettings: NotificationSettings? = null,
)

fun AuthUserDto.toAuthAccountOrNull(isAdmin: Boolean = false): AuthAccount? {
    val userId = id?.takeIf(String::isNotBlank) ?: return null
    val emailAddr = email?.takeIf(String::isNotBlank) ?: return null
    return AuthAccount(id = userId, email = emailAddr, name = name, isAdmin = isAdmin)
}

fun UserProfileDto.toUserDataOrNull(): UserData? {
    val resolvedId = (id ?: legacyId)?.takeIf(String::isNotBlank) ?: return null
    return UserData(
        firstName = firstName.orEmpty().toNameCase(),
        lastName = lastName.orEmpty().toNameCase(),
        teamIds = teamIds ?: emptyList(),
        friendIds = friendIds ?: emptyList(),
        friendRequestIds = friendRequestIds ?: emptyList(),
        friendRequestSentIds = friendRequestSentIds ?: emptyList(),
        followingIds = followingIds ?: emptyList(),
        blockedUserIds = blockedUserIds ?: emptyList(),
        hiddenEventIds = hiddenEventIds ?: emptyList(),
        userName = userName.orEmpty(),
        hasStripeAccount = hasStripeAccount,
        uploadedImages = uploadedImages ?: emptyList(),
        profileImageId = profileImageId,
        privacyDisplayName = displayName,
        isMinor = isMinor ?: inferIsMinorFromDateOfBirth(dateOfBirth),
        isIdentityHidden = isIdentityHidden ?: false,
        chatTermsAcceptedAt = chatTermsAcceptedAt,
        chatTermsVersion = chatTermsVersion,
        notificationSettings = normalizeNotificationSettings(notificationSettings ?: defaultNotificationSettings()),
        id = resolvedId,
    )
}

private fun inferIsMinorFromDateOfBirth(dateOfBirth: String?, ageThreshold: Int = 18): Boolean {
    val normalizedDatePart = dateOfBirth
        ?.substringBefore('T')
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: return false
    val birthDate = runCatching { LocalDate.parse(normalizedDatePart) }.getOrNull() ?: return false
    val today = Clock.System.now().toLocalDateTime(TimeZone.UTC).date

    var age = today.year - birthDate.year
    if (today.month < birthDate.month ||
        (today.month == birthDate.month && today.day < birthDate.day)
    ) {
        age -= 1
    }

    return age in 0 until ageThreshold
}
