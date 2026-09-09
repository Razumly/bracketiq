package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class EventManagementAuthority(
    val type: String,
    val organizationId: String,
    val ownerUserId: String,
)

@Serializable
data class EventAuthorityCapabilities(
    val viewerUserId: String? = null,
    val canEdit: Boolean = false,
    val canManageStaff: Boolean = false,
    val canDelegateHost: Boolean = false,
    val readOnly: Boolean = true,
    val readOnlyReason: String? = null,
    val managementAuthority: EventManagementAuthority? = null,
    val eventHostId: String? = null,
    val viewerIsEventHost: Boolean = false,
    val organizationOwnershipStatus: String? = null,
) {
    fun canEditFor(userId: String): Boolean =
        userId.isNotBlank() && viewerUserId == userId && canEdit && !readOnly
}
