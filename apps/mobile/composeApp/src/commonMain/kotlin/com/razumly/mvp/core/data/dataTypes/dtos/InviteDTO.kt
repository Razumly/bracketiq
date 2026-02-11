package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class InviteDTO(
    val type: String,
    val email: String,
    val status: String? = null,
    val eventId: String? = null,
    val organizationId: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val createdBy: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    @Transient val id: String = "",
) {
    fun toInvite(id: String): Invite =
        Invite(
            type = type,
            email = email,
            status = status,
            eventId = eventId,
            organizationId = organizationId,
            teamId = teamId,
            userId = userId,
            createdBy = createdBy,
            firstName = firstName,
            lastName = lastName,
            id = id,
        )
}
