package com.razumly.mvp.core.data.repositories

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.PayloadData
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import io.appwrite.ID
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

class PushNotificationsRepository(
    private val account: Account,
    private val userDataSource: CurrentUserDataSource,
    private val messaging: Messaging,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _pushToken = userDataSource.getPushToken().stateIn(scope, SharingStarted.Eagerly, "")
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

    suspend fun subscribeUserToTeamNotifications(user: UserData, team: Team) =
        runCatching {
        messaging.createSubscriber(team.id, user.id, _pushTarget.value)
    }

    suspend fun unsubscribeUserFromTeamNotifications(user: UserData, team: Team) =
        runCatching {
        messaging.deleteSubscriber(team.id, user.id)
    }

    suspend fun subscribeUserToEventNotifications(user: UserData, event: EventAbs) =
        runCatching {
        messaging.createSubscriber(event.id, user.id, _pushTarget.value)
    }

    suspend fun unsubscribeUserFromEventNotifications(user: UserData, event: EventAbs) =
        runCatching {
            messaging.deleteSubscriber(event.id, user.id)
        }

    suspend fun subscribeUserToMatchNotifications(user: UserData, match: MatchMVP) =
        runCatching {
        messaging.createSubscriber(match.id, user.id, _pushTarget.value)
    }

    suspend fun unsubscribeUserFromMatchNotifications(user: UserData, match: MatchMVP) =
        runCatching {
            messaging.deleteSubscriber(match.id, user.id)
        }

    suspend fun sendUserNotification(user: UserData, title: String, body: String) = runCatching {
        messaging.createPush(
            messageId = ID.unique(),
            title = title,
            body = body,
            users = listOf(user.id),
        )
    }

    suspend fun sendTeamNotification(team: Team, title: String, body: String) = runCatching {
        messaging.createPush(
            messageId = ID.unique(),
            title = title,
            body = body,
            topics = listOf("team-${team.id}"),
        )
    }

    suspend fun sendEventNotification(event: EventAbs, title: String, body: String) = runCatching {
        messaging.createPush(
            messageId = ID.unique(),
            title = title,
            body = body,
            topics = listOf("event-${event.id}"),
        )
    }

    suspend fun sendMatchNotification(match: MatchMVP, title: String, body: String) = runCatching {
        messaging.createPush(
            messageId = ID.unique(),
            title = title,
            body = body,
            topics = listOf("match-${match.id}"),
        )
    }

    suspend fun createTeamTopic(team: Team) = runCatching {
        messaging.createTopic(team.id, "team-${team.id}")
    }

    suspend fun deleteTeamTopic(team: Team) = runCatching {
        messaging.deleteTopic(team.id)
    }

    suspend fun createEventTopic(event: EventImp) = runCatching {
        messaging.createTopic(event.id, "event-${event.id}")
    }

    suspend fun deleteEventTopic(event: EventImp) = runCatching {
        messaging.deleteTopic(event.id)
    }

    suspend fun createMatchTopic(matchId: String) = runCatching {
        messaging.createTopic(matchId, "match-${matchId}")
    }

    suspend fun deleteMatchTopic(matchId: String) = runCatching {
        messaging.deleteTopic(matchId)
    }

    suspend fun addDeviceAsTarget(): Result<Unit> = runCatching {
        val target = account.createPushTarget(ID.unique(), _pushToken.value)
        userDataSource.savePushTarget(target.id)
    }

    suspend fun removeDeviceAsTarget(): Result<Unit> = runCatching {
        if (_pushTarget.value.isBlank()) return Result.failure(Exception("No push target found"))
        account.deletePushTarget(_pushTarget.value)
        userDataSource.savePushTarget("")
    }
}