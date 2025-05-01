package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
@Entity
data class ChatGroup (
    @Transient
    @PrimaryKey
    override val id: String = "",
    val name: String,
    val userIds: List<String>,
    val hostId: String,
): MVPDocument