package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class UserDataDTO(
    val firstName: String,
    val lastName: String,
    val tournamentIds: List<String>,
    val eventIds: List<String>,
    val teamIds: List<String>,
    val friendIds: List<String>,
    val userName: String,
    @Transient
    val id: String = "",
) {
    companion object {
        operator fun invoke(firstName: String, lastName: String, userName: String, userId: String): UserDataDTO {
            return UserDataDTO(firstName, lastName, listOf(), listOf(), listOf(), listOf(), userName, userId)
        }
    }
}

fun UserDataDTO.toUserData(id: String): UserData {
    return UserData(
        firstName,
        lastName,
        tournamentIds,
        eventIds,
        teamIds,
        friendIds,
        userName,
        id
    )
}