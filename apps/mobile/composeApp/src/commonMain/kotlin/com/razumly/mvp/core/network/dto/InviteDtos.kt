package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.serialization.Serializable

@Serializable
data class InvitesResponseDto(
    val invites: List<Invite> = emptyList(),
)

@Serializable
data class InviteCreateDto(
    val type: String,
    val email: String? = null,
    val status: String? = null,
    val eventId: String? = null,
    val organizationId: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val createdBy: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
)

@Serializable
data class CreateInvitesRequestDto(
    val invites: List<InviteCreateDto> = emptyList(),
)

@Serializable
data class DeleteInvitesRequestDto(
    val userId: String? = null,
    val teamId: String? = null,
    val type: String? = null,
)

