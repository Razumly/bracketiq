package com.razumly.mvp.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class ManagedPlayerClaimRequestDto(
    val inviteId: String,
    val confirmation: Boolean,
    val dateOfBirth: String? = null,
    val version: String? = null,
    val expiresAt: String? = null,
    val signature: String? = null,
)

@Serializable
data class ManagedPlayerClaimResponseDto(
    val ok: Boolean = false,
    val status: String? = null,
    val primaryProfileId: String? = null,
    val sourceProfileId: String? = null,
    val mergeId: String? = null,
    val error: String? = null,
)

@Serializable
data class ManagedPlayerClaimPreviewResponseDto(
    val available: Boolean = false,
    val invite: ManagedPlayerClaimPreviewInviteDto? = null,
    val profile: ManagedPlayerClaimPreviewProfileDto? = null,
    val team: ManagedPlayerClaimPreviewTeamDto? = null,
)

@Serializable
data class ManagedPlayerClaimPreviewInviteDto(
    val id: String = "",
    val profileId: String = "",
    val hasAttachedEmail: Boolean = false,
    val isMinor: Boolean = false,
    val teamId: String? = null,
)

@Serializable
data class ManagedPlayerClaimPreviewProfileDto(
    val displayName: String = "Player",
    val isManaged: Boolean = false,
)

@Serializable
data class ManagedPlayerClaimPreviewTeamDto(
    val id: String = "",
    val name: String = "",
)
