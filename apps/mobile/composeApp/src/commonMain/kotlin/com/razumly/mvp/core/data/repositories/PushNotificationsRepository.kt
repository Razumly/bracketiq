package com.razumly.mvp.core.data.repositories

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.PayloadData
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface IPushNotificationsRepository {
    suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String): Result<Unit>
    suspend fun unsubscribeUserFromTeamNotifications(
        userId: String, teamId: String
    ): Result<Unit>

    suspend fun subscribeUserToEventNotifications(
        userId: String, eventId: String
    ): Result<Unit>

    suspend fun unsubscribeUserFromEventNotifications(
        userId: String, eventId: String
    ): Result<Unit>

    suspend fun subscribeUserToMatchNotifications(
        userId: String, matchId: String
    ): Result<Unit>

    suspend fun unsubscribeUserFromMatchNotifications(
        userId: String, matchId: String
    ): Result<Unit>

    suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String): Result<Unit>
    suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String): Result<Unit>

    suspend fun sendUserNotification(userId: String, title: String, body: String): Result<Unit>
    suspend fun sendTeamNotification(teamId: String, title: String, body: String): Result<Unit>
    suspend fun sendEventNotification(
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean
    ): Result<Unit>

    suspend fun sendMatchNotification(
        matchId: String,
        title: String,
        body: String
    ): Result<Unit>

    suspend fun sendChatGroupNotification(
        chatGroupId: String, title: String, body: String
    ): Result<Unit>

    suspend fun createTeamTopic(team: Team): Result<Unit>
    suspend fun deleteTopic(id: String): Result<Unit>
    suspend fun createEventTopic(event: Event): Result<Unit>
    suspend fun createTournamentTopic(event: Event): Result<Unit>
    suspend fun createChatGroupTopic(chatGroup: ChatGroup): Result<Unit>

    suspend fun addDeviceAsTarget(): Result<Unit>
    suspend fun removeDeviceAsTarget(): Result<Unit>
}

class PushNotificationsRepository(
    private val userDataSource: CurrentUserDataSource,
) : IPushNotificationsRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _pushToken =
        userDataSource.getPushToken().stateIn(scope, SharingStarted.Eagerly, "")

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
                        userDataSource.savePushToken(token)
                    }.onFailure { e ->
                        Napier.e("Error saving push token", e)
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

    override suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String) =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromTeamNotifications(userId: String, teamId: String) =
        Result.success(Unit)

    override suspend fun subscribeUserToEventNotifications(userId: String, eventId: String) =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromEventNotifications(userId: String, eventId: String) =
        Result.success(Unit)

    override suspend fun subscribeUserToMatchNotifications(userId: String, matchId: String) =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromMatchNotifications(userId: String, matchId: String) =
        Result.success(Unit)

    override suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String) =
        Result.success(Unit)

    override suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String) =
        Result.success(Unit)

    override suspend fun sendUserNotification(userId: String, title: String, body: String) =
        Result.success(Unit)

    override suspend fun sendTeamNotification(teamId: String, title: String, body: String) =
        Result.success(Unit)

    override suspend fun sendEventNotification(
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean
    ) =
        Result.success(Unit)

    override suspend fun sendMatchNotification(matchId: String, title: String, body: String) =
        Result.success(Unit)

    override suspend fun sendChatGroupNotification(
        chatGroupId: String, title: String, body: String
    ) = Result.success(Unit)

    override suspend fun createTeamTopic(team: Team) = Result.success(Unit)

    override suspend fun deleteTopic(id: String) = Result.success(Unit)

    override suspend fun createEventTopic(event: Event) = Result.success(Unit)

    override suspend fun createTournamentTopic(event: Event) = Result.success(Unit)

    override suspend fun createChatGroupTopic(chatGroup: ChatGroup) = Result.success(Unit)

    override suspend fun addDeviceAsTarget(): Result<Unit> = runCatching {
        // For now we only cache the device push token locally. Server-side push is not implemented.
        val token = NotifierManager.getPushNotifier().getToken()
        if (!token.isNullOrBlank()) {
            userDataSource.savePushToken(token)
        }
    }

    override suspend fun removeDeviceAsTarget(): Result<Unit> = runCatching {
        // Clear cached values. The platform push token may be re-fetched later via NotifierManager.
        userDataSource.savePushTarget("")
        userDataSource.savePushToken("")
    }
}
