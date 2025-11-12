package com.razumly.mvp.core.data.repositories

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.PayloadData
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import io.appwrite.ID
import io.appwrite.models.Execution
import io.appwrite.services.Account
import io.appwrite.services.Functions
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

interface IPushNotificationsRepository {
    suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String): Result<Execution>
    suspend fun unsubscribeUserFromTeamNotifications(
        userId: String, teamId: String
    ): Result<Execution>

    suspend fun subscribeUserToEventNotifications(
        userId: String, eventId: String
    ): Result<Execution>

    suspend fun unsubscribeUserFromEventNotifications(
        userId: String, eventId: String
    ): Result<Execution>

    suspend fun subscribeUserToMatchNotifications(
        userId: String, matchId: String
    ): Result<Execution>

    suspend fun unsubscribeUserFromMatchNotifications(
        userId: String, matchId: String
    ): Result<Execution>

    suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String): Result<Execution>
    suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String): Result<Execution>

    suspend fun sendUserNotification(userId: String, title: String, body: String): Result<Execution>
    suspend fun sendTeamNotification(teamId: String, title: String, body: String): Result<Execution>
    suspend fun sendEventNotification(
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean
    ): Result<Execution>

    suspend fun sendMatchNotification(
        matchId: String,
        title: String,
        body: String
    ): Result<Execution>

    suspend fun sendChatGroupNotification(
        chatGroupId: String, title: String, body: String
    ): Result<Execution>

    suspend fun createTeamTopic(team: Team): Result<Execution>
    suspend fun deleteTopic(id: String): Result<Execution>
    suspend fun createEventTopic(event: Event): Result<Execution>
    suspend fun createTournamentTopic(event: Event): Result<Execution>
    suspend fun createChatGroupTopic(chatGroup: ChatGroup): Result<Execution>

    suspend fun addDeviceAsTarget(): Result<Unit>
    suspend fun removeDeviceAsTarget(): Result<Unit>
}

class PushNotificationsRepository(
    private val account: Account,
    private val userDataSource: CurrentUserDataSource,
    private val functions: Functions,
) : IPushNotificationsRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _pushToken =
        userDataSource.getPushToken().stateIn(scope, SharingStarted.Eagerly, "")
    private val _pushTarget =
        userDataSource.getPushTarget().stateIn(scope, SharingStarted.Eagerly, "")

    init {
        if (_pushToken.value.isBlank()) {
            scope.launch {
                delay(1000)
                val newToken = NotifierManager.getPushNotifier().getToken()
                if (newToken != null) {
                    userDataSource.savePushToken(newToken)
                }
            }
        }
        val managerListener = object : NotifierManager.Listener {
            override fun onNewToken(token: String) {
                scope.launch {
                    runCatching {
                        if (_pushTarget.value.isNotBlank()) {
                            account.updatePushTarget(_pushTarget.value, token)
                            userDataSource.savePushToken(token)
                        }
                    }.onFailure {
                        try {
                            account.createPushTarget(_pushTarget.value, token)
                        } catch (e: Exception) {
                            Napier.e("Error updating push target", e)
                        }
                    }
                }
            }

            override fun onNotificationClicked(data: PayloadData) {
                super.onNotificationClicked(data)
                Napier.d(
                    tag = "PushNotificationsRepository",
                    message = "Notification clicked: $data"
                )
            }

            override fun onPushNotificationWithPayloadData(
                title: String?, body: String?, data: PayloadData
            ) {
                super.onPushNotificationWithPayloadData(title, body, data)
                Napier.d(
                    tag = "PushNotificationsRepository",
                    message = "Push notification with payload data: $data"
                )
            }
        }
        NotifierManager.addListener(managerListener)
    }

    private suspend fun mvpMessagingFunction(body: MessageBody): Execution {
        return functions.createExecution("mvpMessaging", Json.encodeToString(body), async = false)
    }

    override suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String) =
        runCatching {
            val messageBody = MessageBody("subscribe", teamId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun unsubscribeUserFromTeamNotifications(userId: String, teamId: String) =
        runCatching {
            val messageBody =
                MessageBody("unsubscribe", teamId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun subscribeUserToEventNotifications(userId: String, eventId: String) =
        runCatching {
            val messageBody = MessageBody("subscribe", eventId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun unsubscribeUserFromEventNotifications(userId: String, eventId: String) =
        runCatching {
            val messageBody =
                MessageBody("unsubscribe", eventId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun subscribeUserToMatchNotifications(userId: String, matchId: String) =
        runCatching {
            val messageBody = MessageBody("subscribe", matchId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun unsubscribeUserFromMatchNotifications(userId: String, matchId: String) =
        runCatching {
            val messageBody =
                MessageBody("unsubscribe", matchId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String) =
        runCatching {
            val messageBody =
                MessageBody("subscribe", chatGroupId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String) =
        runCatching {
            val messageBody =
                MessageBody("unsubscribe", chatGroupId, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun sendUserNotification(userId: String, title: String, body: String) =
        runCatching {
            val messageBody =
                MessageBody("send", "", title = title, body = body, userIds = listOf(userId))
            mvpMessagingFunction(messageBody)
        }

    override suspend fun sendTeamNotification(teamId: String, title: String, body: String) =
        runCatching {
            val messageBody = MessageBody("send", teamId, title = title, body = body)
            mvpMessagingFunction(messageBody)
        }

    override suspend fun sendEventNotification(
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean
    ) =
        runCatching {
            val messageBody = MessageBody(
                "send",
                eventId,
                title = title,
                body = body,
                isTournament = isTournament
            )
            mvpMessagingFunction(messageBody)
        }

    override suspend fun sendMatchNotification(matchId: String, title: String, body: String) =
        runCatching {
            val messageBody = MessageBody("send", matchId, title = title, body = body)
            mvpMessagingFunction(messageBody)
        }

    override suspend fun sendChatGroupNotification(
        chatGroupId: String, title: String, body: String
    ) = runCatching {
        val messageBody = MessageBody("send", chatGroupId, title = title, body = body)
        mvpMessagingFunction(messageBody)
    }

    override suspend fun createTeamTopic(team: Team) = runCatching {
        val messageBody = MessageBody("create", team.id, "team-${team.id}", listOf(team.captainId))
        mvpMessagingFunction(messageBody)
    }

    override suspend fun deleteTopic(id: String) = runCatching {
        val messageBody = MessageBody("delete", id)
        mvpMessagingFunction(messageBody)
    }

    override suspend fun createEventTopic(event: Event) = runCatching {
        val messageBody = MessageBody("create", event.id, "event-${event.id}", listOf(event.hostId))
        mvpMessagingFunction(messageBody)
    }

    override suspend fun createTournamentTopic(event: Event) = runCatching {
        val messageBody = MessageBody(
            "create", event.id, "tournament-${event.id}", listOf(event.hostId)
        )
        mvpMessagingFunction(messageBody)
    }

    override suspend fun createChatGroupTopic(chatGroup: ChatGroup) = runCatching {
        val messageBody =
            MessageBody("create", chatGroup.id, "chat-${chatGroup.id}", chatGroup.userIds)
        mvpMessagingFunction(messageBody)
    }

    override suspend fun addDeviceAsTarget(): Result<Unit> = runCatching {
        account.createPushTarget(ID.unique(), _pushToken.value)
    }.onSuccess {
        userDataSource.savePushTarget(it.id)
    }.map {}

    override suspend fun removeDeviceAsTarget(): Result<Unit> = runCatching {
        if (_pushTarget.value.isBlank()) return Result.failure(Exception("No push target found"))
        account.deletePushTarget(_pushTarget.value)
    }.onSuccess {
        userDataSource.savePushTarget("")
    }.map {}
}

@Serializable
data class MessageBody(
    val command: String,
    val topicId: String,
    val topicName: String = "",
    val userIds: List<String> = listOf(),
    val title: String = "",
    val body: String = "",
    val action: String = "",
    val isTournament: Boolean = false,
)