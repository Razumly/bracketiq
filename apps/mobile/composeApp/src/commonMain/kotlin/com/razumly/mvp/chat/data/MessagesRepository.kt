package com.razumly.mvp.chat.data

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Query
import io.appwrite.services.Databases
import io.appwrite.services.Realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

interface IMessagesRepository {
    suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>>
    suspend fun createMessage(newMessage: MessageMVP): Result<Unit>
    suspend fun subscribeToChatGroup(chatGroupId: String): Result<Unit>
}

class MessagesRepository(
    private val mvpDatabase: MVPDatabase,
    private val databases: Databases,
    private val realtime: Realtime
) : IMessagesRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override suspend fun subscribeToChatGroup(chatGroupId: String): Result<Unit> = runCatching {
        val channels = listOf(DbConstants.CHAT_GROUPS_CHANNEL)
        realtime.subscribe(channels, payloadType = MessageMVP::class) { response ->
            response.payload.let {
                if (it.chatId != chatGroupId) return@subscribe
                scope.launch {
                    mvpDatabase.getMessageDao.upsertMessage(it)
                }
            }
        }
    }

    override suspend fun getMessagesInChatGroup(chatGroupId: String): Result<List<MessageMVP>> =
        multiResponse(getRemoteData = {
            databases.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.MESSAGES_COLLECTION,
                nestedType = MessageMVP::class,
                queries = listOf(Query.equal("chatGroupId", chatGroupId))
            ).documents.map { it.data.copy(id = it.id) }
        }, getLocalData = {
            mvpDatabase.getMessageDao.getMessagesInChatGroup(chatGroupId)
        }, saveData = {
            mvpDatabase.getMessageDao.upsertMessages(it)
        }, deleteData = { })

    override suspend fun createMessage(newMessage: MessageMVP): Result<Unit> =
        singleResponse(networkCall = {
            databases.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.MESSAGES_COLLECTION,
                documentId = newMessage.id,
                data = newMessage,
                nestedType = MessageMVP::class
            ).data
        }, saveCall = {
            mvpDatabase.getMessageDao.upsertMessages(listOf(it))
        }, onReturn = {})
}