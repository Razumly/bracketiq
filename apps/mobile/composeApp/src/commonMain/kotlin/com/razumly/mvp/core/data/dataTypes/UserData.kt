package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.presentation.util.toTitleCase
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class UserData(
    val firstName: String,
    val lastName: String,
    val teamIds: List<String>,
    val friendIds: List<String>,
    val userName: String,
    val teamInvites: List<String>,
    val eventInvites: List<String>,
    val tournamentInvites: List<String>,
    val hasStripeAccount: Boolean?,
    @PrimaryKey override val id: String,
) : MVPDocument {
    companion object {
        operator fun invoke(): UserData {
            return UserData(
                firstName = "",
                lastName = "",
                teamIds = emptyList(),
                friendIds = emptyList(),
                userName = "",
                teamInvites = emptyList(),
                eventInvites = emptyList(),
                tournamentInvites = emptyList(),
                hasStripeAccount = false,
                id = ""
            )
        }
    }

    val fullName: String
        get() = "$firstName $lastName".toTitleCase()

    fun toUserDataDTO(): UserDataDTO {
        return UserDataDTO(
            firstName,
            lastName,
            teamIds,
            friendIds,
            userName,
            teamInvites,
            eventInvites,
            tournamentInvites,
            hasStripeAccount,
            id
        )
    }
}