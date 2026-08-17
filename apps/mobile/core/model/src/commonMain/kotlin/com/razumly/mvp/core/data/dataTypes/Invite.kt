package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Invite(
    val type: String = "",
    val email: String = "",
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
    @PrimaryKey
    override val id: String = "",
) : MVPDocument
