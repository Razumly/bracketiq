package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class UserDataDTO(
    val firstName: String? = null,
    val lastName: String? = null,
    val tournamentIds: List<String>,
    val pickupGameIds: List<String>,
    @Transient
    val id: String = "",
)

fun UserDataDTO.toUserData(id: String): UserData {
    return UserData(
        firstName,
        lastName,
        tournamentIds,
        pickupGameIds,
        id
    )
}