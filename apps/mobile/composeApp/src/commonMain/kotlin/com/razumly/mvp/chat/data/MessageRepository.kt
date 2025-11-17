package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.dtos.MessageMVPDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.TablesDB

interface IMessageRepository {
    suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>>
    suspend fun createMessage(newMessage: MessageMVP): Result<Unit>
}

class MessageRepository(
    private val databaseService: DatabaseService,
    private val tablesDb: TablesDB,
) : IMessageRepository {
    override suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>> =
        multiResponse(getRemoteData = {
            tablesDb.listRows<MessageMVPDTO>(
                DbConstants.DATABASE_NAME,
                DbConstants.MESSAGES_TABLE,
                queries = listOf(Query.equal("chatId", chatGroupId)),
                nestedType = MessageMVPDTO::class
            ).rows.map { it.data.toMessageMVP(it.id) }
        }, getLocalData = {
            databaseService.getMessageDao.getMessagesInChatGroup(chatGroupId)
        }, saveData = {
            databaseService.getMessageDao.upsertMessages(it)
        }, deleteData = { databaseService.getMessageDao.deleteMessages(it) })

    override suspend fun createMessage(newMessage: MessageMVP): Result<Unit> =
        singleResponse(networkCall = {
            tablesDb.createRow<MessageMVPDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.MESSAGES_TABLE,
                rowId = newMessage.id,
                data = newMessage.toMessageMVPDTO(),
                nestedType = MessageMVPDTO::class
            ).data.toMessageMVP(id = newMessage.id)
        }, saveCall = {
            databaseService.getMessageDao.upsertMessages(listOf(it))
        }, onReturn = {})
}
