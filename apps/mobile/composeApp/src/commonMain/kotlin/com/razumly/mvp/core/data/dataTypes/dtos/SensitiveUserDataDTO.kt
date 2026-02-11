package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.SensitiveUserData
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class SensitiveUserDataDTO(
    val userId: String,
    val email: String,
    @Transient val id: String = "",
) {
    fun toSensitiveUserData(id: String): SensitiveUserData =
        SensitiveUserData(
            userId = userId,
            email = email,
            id = id
        )
}
