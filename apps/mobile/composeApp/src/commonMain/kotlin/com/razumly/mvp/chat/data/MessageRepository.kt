package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.dtos.MessageMVPDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.Databases

interface IMessageRepository {
    suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>>
    suspend fun createMessage(newMessage: MessageMVP): Result<Unit>
}

class MessageRepository(
    private val databaseService: DatabaseService,
    private val databases: Databases,
) : IMessageRepository {
    override suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>> =
        multiResponse(getRemoteData = {
            databases.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.MESSAGES_COLLECTION,
                nestedType = MessageMVPDTO::class,
                queries = listOf(Query.equal("chatId", chatGroupId))
            ).documents.map { it.data.toMessageMVP(it.id) }
        }, getLocalData = {
            databaseService.getMessageDao.getMessagesInChatGroup(chatGroupId)
        }, saveData = {
            databaseService.getMessageDao.upsertMessages(it)
        }, deleteData = { databaseService.getMessageDao.deleteMessages(it) })

    override suspend fun createMessage(newMessage: MessageMVP): Result<Unit> =
        singleResponse(networkCall = {
            databases.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.MESSAGES_COLLECTION,
                documentId = newMessage.id,
                data = newMessage.toMessageMVPDTO(),
                nestedType = MessageMVPDTO::class
            ).data.toMessageMVP(id = newMessage.id)
        }, saveCall = {
            databaseService.getMessageDao.upsertMessages(listOf(it))
        }, onReturn = {})
}