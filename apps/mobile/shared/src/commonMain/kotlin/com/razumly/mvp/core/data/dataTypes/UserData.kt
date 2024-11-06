package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class UserData(
    val firstName: String?,
    val lastName: String?,
    val tournament: String?,
    override val id: String,
) : Document()