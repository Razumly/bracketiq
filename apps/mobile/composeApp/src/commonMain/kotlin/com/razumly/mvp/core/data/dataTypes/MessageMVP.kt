package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class MessageMVP (
    @Transient
    @PrimaryKey
    override val id: String = "",
    val userId: String,
    val body: String,
    val attachmentUrls: List<String>,
    val chatId: String,
    val readByIds: List<String>,
): MVPDocument