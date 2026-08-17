package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.MessageMVPDTO
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Entity
@Serializable
@OptIn(ExperimentalTime::class)
data class MessageMVP (
    @Transient
    @PrimaryKey
    override val id: String = "",
    val userId: String,
    val body: String,
    val attachmentUrls: List<String>,
    val chatId: String,
    val readByIds: List<String>,
    @Contextual
    val sentTime: Instant
): MVPDocument {
    fun toMessageMVPDTO() = MessageMVPDTO(
        id = id,
        userId = userId,
        body = body,
        attachmentUrls = attachmentUrls,
        chatId = chatId,
        readByIds = readByIds,
        sentTime = sentTime.toString()
    )
}