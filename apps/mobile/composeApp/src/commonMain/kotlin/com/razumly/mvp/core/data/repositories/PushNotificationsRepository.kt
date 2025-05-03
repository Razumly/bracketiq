package com.razumly.mvp.core.data.repositories

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.PayloadData
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import io.appwrite.ID
import io.appwrite.models.Message
import io.appwrite.models.Subscriber
import io.appwrite.models.Topic
import io.appwrite.services.Account
import io.appwrite.services.Messaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

interface IPushNotificationsRepository {
    suspend fun subscribeUserToTeamNotifications(user: UserData, team: Team): Result<Subscriber>
    suspend fun unsubscribeUserFromTeamNotifications(user: UserData, team: Team): Result<Any>
    suspend fun subscribeUserToEventNotifications(
        user: UserData, event: EventAbs
    ): Result<Subscriber>

    suspend fun unsubscribeUserFromEventNotifications(user: UserData, event: EventAbs): Result<Any>
    suspend fun subscribeUserToMatchNotifications(
        user: UserData, match: MatchMVP
    ): Result<Subscriber>

    suspend fun unsubscribeUserFromMatchNotifications(user: UserData, match: MatchMVP): Result<Any>
    suspend fun subscribeUserToChatGroup(user: UserData, chatGroup: ChatGroup): Result<Subscriber>
    suspend fun unsubscribeUserFromChatGroup(user: UserData, chatGroup: ChatGroup): Result<Any>

    suspend fun sendUserNotification(user: UserData, title: String, body: String): Result<Message>
    suspend fun sendTeamNotification(team: Team, title: String, body: String): Result<Message>
    suspend fun sendEventNotification(event: EventAbs, title: String, body: String): Result<Message>
    suspend fun sendMatchNotification(match: MatchMVP, title: String, body: String): Result<Message>
    suspend fun sendChatGroupNotification(
        chatGroup: ChatGroup, title: String, body: String
    ): Result<Message>

    suspend fun createTeamTopic(team: Team): Result<Topic>
    suspend fun deleteTeamTopic(team: Team): Result<Any>
    suspend fun createEventTopic(event: EventImp): Result<Topic>
    suspend fun deleteEventTopic(event: EventImp): Result<Any>
    suspend fun createMatchTopic(matchId: String): Result<Topic>
    suspend fun deleteMatchTopic(matchId: String): Result<Any>
    suspend fun createChatGroupTopic(chatGroup: ChatGroup): Result<Topic>
    suspend fun deleteChatGroupTopic(chatGroup: ChatGroup): Result<Any>

    suspend fun addDeviceAsTarget(): Result<Unit>
    suspend fun removeDeviceAsTarget(): Result<Unit>
}

class PushNotificationsRepository(
    private val account: Account,
    private val userDataSource: CurrentUserDataSource,
    private val messaging: Messaging,
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
                runBlocking {
                    if (_pushTarget.value.isNotBlank()) {
                        account.updatePushTarget(_pushTarget.value, token)
                        userDataSource.savePushToken(token)
                    }
                }
            }

            override fun onNotificationClicked(data: PayloadData) {
                super.onNotificationClicked(data)
                println("Notification clicked, Notification payloadData: $data")
            }

            override fun onPushNotificationWithPayloadData(
                title: String?, body: String?, data: PayloadData
            ) {
                println("Push Notification is received: Title: $title and Body: $body and Notification payloadData: $data")
            }
        }
        NotifierManager.addListener(managerListener)
    }

    override suspend fun subscribeUserToTeamNotifications(user: UserData, team: Team) =
        runCatching {
            messaging.createSubscriber(team.id, user.id, _pushTarget.value)
        }

    override suspend fun unsubscribeUserFromTeamNotifications(user: UserData, team: Team) =
        runCatching {
            messaging.deleteSubscriber(team.id, user.id)
        }

    override suspend fun subscribeUserToEventNotifications(user: UserData, event: EventAbs) =
        runCatching {
            messaging.createSubscriber(event.id, user.id, _pushTarget.value)
        }

    override suspend fun unsubscribeUserFromEventNotifications(user: UserData, event: EventAbs) =
        runCatching {
            messaging.deleteSubscriber(event.id, user.id)
        }

    override suspend fun subscribeUserToMatchNotifications(user: UserData, match: MatchMVP) =
        runCatching {
            messaging.createSubscriber(match.id, user.id, _pushTarget.value)
        }

    override suspend fun unsubscribeUserFromMatchNotifications(user: UserData, match: MatchMVP) =
        runCatching {
            messaging.deleteSubscriber(match.id, user.id)
        }

    override suspend fun subscribeUserToChatGroup(user: UserData, chatGroup: ChatGroup) =
        runCatching {
            messaging.createSubscriber("chat-${chatGroup.id}", user.id, _pushTarget.value)
        }

    override suspend fun unsubscribeUserFromChatGroup(user: UserData, chatGroup: ChatGroup) =
        runCatching {
            messaging.deleteSubscriber("chat-${chatGroup.id}", user.id)
        }

    override suspend fun sendUserNotification(user: UserData, title: String, body: String) =
        runCatching {
            messaging.createPush(
                messageId = ID.unique(),
                title = title,
                body = body,
                users = listOf(user.id),
            )
        }

    override suspend fun sendTeamNotification(team: Team, title: String, body: String) =
        runCatching {
            messaging.createPush(
                messageId = ID.unique(),
                title = title,
                body = body,
                topics = listOf("team-${team.id}"),
            )
        }

    override suspend fun sendEventNotification(event: EventAbs, title: String, body: String) =
        runCatching {
            messaging.createPush(
                messageId = ID.unique(),
                title = title,
                body = body,
                topics = listOf("event-${event.id}"),
            )
        }

    override suspend fun sendMatchNotification(match: MatchMVP, title: String, body: String) =
        runCatching {
            messaging.createPush(
                messageId = ID.unique(),
                title = title,
                body = body,
                topics = listOf("match-${match.id}"),
            )
        }

    override suspend fun sendChatGroupNotification(
        chatGroup: ChatGroup, title: String, body: String
    ) = runCatching {
        messaging.createPush(
            messageId = ID.unique(),
            title = title,
            body = body,
            topics = listOf("chat-${chatGroup.id}"),
        )
    }

    override suspend fun createTeamTopic(team: Team) = runCatching {
        messaging.createTopic(team.id, "team-${team.id}")
    }

    override suspend fun deleteTeamTopic(team: Team) = runCatching {
        messaging.deleteTopic(team.id)
    }

    override suspend fun createEventTopic(event: EventImp) = runCatching {
        messaging.createTopic(event.id, "event-${event.id}")
    }

    override suspend fun deleteEventTopic(event: EventImp) = runCatching {
        messaging.deleteTopic(event.id)
    }

    override suspend fun createMatchTopic(matchId: String) = runCatching {
        messaging.createTopic(matchId, "match-${matchId}")
    }

    override suspend fun deleteMatchTopic(matchId: String) = runCatching {
        messaging.deleteTopic(matchId)
    }

    override suspend fun createChatGroupTopic(chatGroup: ChatGroup) = runCatching {
        messaging.createTopic(chatGroup.id, "chat-${chatGroup.id}")
    }

    override suspend fun deleteChatGroupTopic(chatGroup: ChatGroup) = runCatching {
        messaging.deleteTopic(chatGroup.id)
    }

    override suspend fun addDeviceAsTarget(): Result<Unit> = runCatching {
        val target = account.createPushTarget(ID.unique(), _pushToken.value)
        userDataSource.savePushTarget(target.id)
    }

    override suspend fun removeDeviceAsTarget(): Result<Unit> = runCatching {
        if (_pushTarget.value.isBlank()) return Result.failure(Exception("No push target found"))
        account.deletePushTarget(_pushTarget.value)
        userDataSource.savePushTarget("")
    }
}