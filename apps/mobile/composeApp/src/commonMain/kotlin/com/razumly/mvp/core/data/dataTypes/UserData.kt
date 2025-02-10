package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class UserData(
    val firstName: String? = null,
    val lastName: String? = null,
    val tournaments: List<String>,
    @PrimaryKey override val id: String,
) : MVPDocument()

fun UserData.toUserDataDTO(): UserDataDTO {
    return UserDataDTO(firstName, lastName, tournaments, id)
}