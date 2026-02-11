package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class Invite(
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
    override val id: String = "",
) : MVPDocument
