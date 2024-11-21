package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Field(
    val inUse: Boolean,
    val fieldNumber: Int,
    val divisions: List<String>,
    val matches: List<String>,
    val tournament: String,
    @PrimaryKey override val id: String,
) : Document()