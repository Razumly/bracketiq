package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity
data class ChatGroup (
    @PrimaryKey override val id: String,
    val name: String,
    val userIds: List<String>
): MVPDocument