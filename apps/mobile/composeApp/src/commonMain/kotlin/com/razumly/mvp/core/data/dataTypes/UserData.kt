package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class UserData(
    val firstName: String,
    val lastName: String,
    val tournamentIds: List<String>,
    val eventIds: List<String>,
    val teamIds: List<String>,
    val friendIds: List<String>,
    val userName: String,
    val teamInvites: List<String>,
    val eventInvites: List<String>,
    val tournamentInvites: List<String>,
    @PrimaryKey override val id: String,
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