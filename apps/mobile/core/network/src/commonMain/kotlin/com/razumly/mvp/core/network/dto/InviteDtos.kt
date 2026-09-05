package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.serialization.Serializable

@Serializable
data class InvitesResponseDto(
    val invites: List<Invite> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class InviteResponseDto(
    val invite: Invite? = null,
)

@Serializable
data class InviteCreateDto(
    val type: String,
    val email: String? = null,
    val playerEmail: String? = null,
    val status: String? = null,
    val staffTypes: List<String> = emptyList(),
    val replaceStaffTypes: Boolean? = null,
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

@Serializable
data class EmailMembershipLookupRequestDto(
    val emails: List<String> = emptyList(),
    val userIds: List<String> = emptyList(),
)

@Serializable
data class UserEmailMembershipMatchDto(
    val email: String,
    val userId: String,
)

@Serializable
data class EmailMembershipLookupResponseDto(
    val matches: List<UserEmailMembershipMatchDto> = emptyList(),
)

@Serializable
data class DeclineTeamInvitationRequestDto(
    val blockScope: String? = null,
    val leaveSharedChats: Boolean = false,
)

@Serializable
data class InvitationRequestKeyDto(val idempotencyKey: String)

@Serializable
data class InvitationDeliveryResponseDto(
    val failed: Boolean = false,
    val status: String? = null,
    val error: String? = null,
)

@Serializable
data class InvitationBlockResponseDto(
    val scope: String,
    val active: Boolean,
    val playerId: String? = null,
    val teamId: String? = null,
    val targetUserId: String? = null,
)

@Serializable
data class InvitationActionResponseDto(
    val ok: Boolean = false,
    val invite: Invite? = null,
    val block: InvitationBlockResponseDto? = null,
    val teamBlock: com.razumly.mvp.core.data.dataTypes.TeamBlock? = null,
    val user: UserProfileDto? = null,
    val removedChatIds: List<String> = emptyList(),
    val delivery: InvitationDeliveryResponseDto? = null,
)

@Serializable
data class TeamBlocksResponseDto(val blocks: List<com.razumly.mvp.core.data.dataTypes.TeamBlock> = emptyList())
