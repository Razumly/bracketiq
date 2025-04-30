package com.razumly.mvp.core.data.dataTypes.daos

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import com.razumly.mvp.core.data.dataTypes.MessageMVP

@Dao
interface MessageDao {
    @Upsert
    suspend fun upsertMessages(messageMVPs: List<MessageMVP>)

    @Delete
    suspend fun deleteMessage(messageMVP: MessageMVP)

    @Query("DELETE FROM MessageMVP WHERE id = :id")
    suspend fun deleteMessageById(id: String)

    @Query("SELECT * FROM MessageMVP WHERE id = :id")
    fun getMessageById(id: String): MessageMVP?

    @Query("SELECT * FROM MessageMVP WHERE chatId = :chatGroupId")
    fun getMessagesInChatGroup(chatGroupId: String): List<MessageMVP>
}