package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class Message (
    @PrimaryKey override val id: String,
    val userId: String,
    val body: String,
    val attachmentUrls: String,
    val chatId: String
): MVPDocument