package com.razumly.mvp.messaging.data

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.Databases

class MessagesRepository(
    private val mvpDatabase: MVPDatabase,
    private val database: Databases
): IMessagesRepository {
    override suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>> = multiResponse(
        getRemoteData = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.MESSAGES_COLLECTION,
                nestedType = MessageMVP::class,
                queries = listOf(Query.equal("chatGroupId", chatGroupId))
            ).documents.map { it.data }
        },
        getLocalData = {
            mvpDatabase.getMessageDao.getMessagesInChatGroup(chatGroupId)
        },
        saveData = {
            mvpDatabase.getMessageDao.upsertMessages(it)
        },
        deleteData = { }
    )

    override suspend fun createMessage(newMessage: MessageMVP): Result<Unit> = singleResponse(
        networkCall = {
            database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.MESSAGES_COLLECTION,
                documentId = newMessage.id,
                data = newMessage,
                nestedType = MessageMVP::class
            ).data
        },
        saveCall = {
            mvpDatabase.getMessageDao.upsertMessages(listOf(it))
        },
        onReturn = {}
    )
}