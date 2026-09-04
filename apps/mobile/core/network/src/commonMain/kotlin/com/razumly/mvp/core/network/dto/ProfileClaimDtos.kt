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
