package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class UserData(
    val firstName: String = "",
    val lastName: String = "",
    val tournamentIds: List<String> = emptyList(),
    val eventIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    val friendIds: List<String> = emptyList(),
    val userName: String = "",
    val teamInvites: List<String> = emptyList(),
    val eventInvites: List<String> = emptyList(),
    val tournamentInvites: List<String> = emptyList(),
    @PrimaryKey override val id: String = "",
) : MVPDocument

fun UserData.toUserDataDTO(): UserDataDTO {
    return UserDataDTO(
        firstName,
        lastName,
        tournamentIds,
        eventIds,
        teamIds,
        friendIds,
        userName,
        teamInvites,
        eventInvites,
        tournamentInvites,
        id
    )
}