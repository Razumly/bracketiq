package com.razumly.mvp.core.data.dataTypes.crossRef

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.razumly.mvp.core.data.dataTypes.ChatGroup

@Entity(
    tableName = "chat_user_cross_ref",
    primaryKeys = ["chatId", "userId"],
    foreignKeys = [
        ForeignKey(
            entity = ChatGroup::class,
            parentColumns = ["id"],
            childColumns = ["chatId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("chatId"),
        Index("userId")
    ]
)
class ChatUserCrossRef (
    val chatId: String,
    val userId: String
)
