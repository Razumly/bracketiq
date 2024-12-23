package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class UserData(
    val firstName: String? = null,
    val lastName: String? = null,
    val tournamentId: String? = null,
    @PrimaryKey override val id: String,
) : Document()