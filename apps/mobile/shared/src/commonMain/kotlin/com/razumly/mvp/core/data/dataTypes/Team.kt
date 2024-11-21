package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Team(
    val name: String?,
    val tournament: String,
    val seed: Int,
    val division: String,
    var wins: Int,
    var losses: Int,
    @PrimaryKey override val id: String,
) : Document()