package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Invite(
    val viewerId: String = "",
    val createdAt: String? = null,
    val finalizedAt: String? = null,
    val actedBy: String? = null,
    val actingGuardianId: String? = null,
    val senderName: String? = null,
    val actingGuardianName: String? = null,
    val declineBlockScope: String? = null,
    val linkExpiresAt: String? = null,
    val sentAt: String? = null,
    val canBlockSender: Boolean = false,
    val isCurrentAttempt: Boolean = true,
    val invitationLabel: String? = null,
    val deliveries: List<InviteDelivery> = emptyList(),
    val type: String = "",
    val role: String = "player",
    val email: String = "",
    val playerEmail: String? = null,
    val phone: String? = null,
    val status: String? = null,
    val staffTypes: List<String> = emptyList(),
    val eventId: String? = null,
    val organizationId: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val createdBy: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val childUserId: String? = null,
    val childFirstName: String? = null,
    val childLastName: String? = null,
    val childFullName: String? = null,
    val viewerCanAcceptForChild: Boolean = false,
    val isAssigned: Boolean = false,
    val claimUrl: String? = null,
    val isMinor: Boolean = false,
    val dateOfBirth: String? = null,
    val guardianEmail: String? = null,
    @PrimaryKey
    override val id: String = "",
) : MVPDocument

@Serializable
data class InviteDelivery(
    val id: String,
    val kind: String,
    val status: String,
    val createdAt: String,
    val completedAt: String? = null,
    val sentAt: String? = null,
)

@Entity(primaryKeys = ["id", "viewerId"])
@Serializable
data class TeamBlock(
    override val id: String,
    val playerId: String,
    val teamId: String,
    val createdBy: String,
    val createdAt: String,
    val playerName: String? = null,
    val teamName: String? = null,
    val viewerId: String = "",
) : MVPDocument

@Entity(primaryKeys = ["viewerId", "identity"])
data class InvitationOperation(
    val viewerId: String,
    val identity: String,
    val requestKey: String,
)
