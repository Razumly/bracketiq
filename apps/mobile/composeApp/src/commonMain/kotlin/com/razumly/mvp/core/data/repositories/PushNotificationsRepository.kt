package com.razumly.mvp.core.data.repositories

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.PayloadData
import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.AuthResponseDto
import com.razumly.mvp.core.network.dto.MessagingTopicMessageRequestDto
import com.razumly.mvp.core.network.dto.MessagingTopicSubscriptionDebugResponseDto
import com.razumly.mvp.core.network.dto.MessagingTopicSubscriptionRequestDto
import com.razumly.mvp.core.network.dto.MessagingTopicUpsertRequestDto
import io.ktor.http.encodeURLPathPart
import io.ktor.http.encodeURLQueryComponent
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.first
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
    suspend fun getDeviceTargetDebugStatus(syncBeforeCheck: Boolean = false): Result<PushDeviceTargetDebugStatus>
}

data class PushDeviceTargetDebugStatus(
    val userId: String? = null,
    val topicId: String? = null,
    val localPushToken: String? = null,
    val localPushTarget: String? = null,
    val hasAnyTargetForUser: Boolean = false,
    val hasTopicTargetForUser: Boolean = false,
    val hasProvidedTokenForUser: Boolean = false,
    val hasProvidedTokenOnTopic: Boolean = false,
    val tokenRecordPushTarget: String? = null,
    val tokenRecordPushPlatform: String? = null,
    val tokenRecordUpdatedAt: String? = null,
    val tokenRecordLastSeenAt: String? = null,
)

class PushNotificationsRepository(
    private val userDataSource: CurrentUserDataSource,
    private val api: MvpApiClient,
) : IPushNotificationsRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val pushTokenState =
        userDataSource.getPushToken().stateIn(scope, SharingStarted.Eagerly, "")
    private var deferredTokenSyncJob: Job? = null

    private val managerListener = object : NotifierManager.Listener {
        override fun onNewToken(token: String) {
            scope.launch {
                runCatching {
                    deferredTokenSyncJob?.cancel()
                    deferredTokenSyncJob = null
                    userDataSource.savePushToken(token)
                    val userId = resolveCurrentOrCachedPushUserId()
                    if (!userId.isNullOrBlank()) {
                        syncDeviceTargetWithBackend(userId, token)
                    }
                }.onFailure { e ->
                    Napier.e("Failed handling push token refresh", e)
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

    init {
        if (pushTokenState.value.isBlank()) {
            scope.launch {
                delay(1_000)
                fetchPushTokenFromNotifier()
            }
        }
        NotifierManager.addListener(managerListener)
    }

    override suspend fun subscribeUserToTeamNotifications(userId: String, teamId: String) =
        subscribeUserToTopic(userId, teamTopicId(teamId))

    override suspend fun unsubscribeUserFromTeamNotifications(userId: String, teamId: String) =
        unsubscribeUserFromTopic(userId, teamTopicId(teamId))

    override suspend fun subscribeUserToEventNotifications(userId: String, eventId: String) =
        subscribeUserToTopic(userId, eventTopicId(eventId))

    override suspend fun unsubscribeUserFromEventNotifications(userId: String, eventId: String) =
        unsubscribeUserFromTopic(userId, eventTopicId(eventId))

    override suspend fun subscribeUserToMatchNotifications(userId: String, matchId: String) =
        subscribeUserToTopic(userId, matchTopicId(matchId))

    override suspend fun unsubscribeUserFromMatchNotifications(userId: String, matchId: String) =
        unsubscribeUserFromTopic(userId, matchTopicId(matchId))

    override suspend fun subscribeUserToChatGroup(userId: String, chatGroupId: String) =
        subscribeUserToTopic(userId, normalizeId(chatGroupId, "Chat group id"))

    override suspend fun unsubscribeUserFromChatGroup(userId: String, chatGroupId: String) =
        unsubscribeUserFromTopic(userId, normalizeId(chatGroupId, "Chat group id"))

    override suspend fun sendUserNotification(userId: String, title: String, body: String) =
        sendTopicNotification(
            topicId = userTopicId(userId),
            title = title,
            body = body,
            userIds = listOf(normalizeId(userId, "User id")),
        )

    override suspend fun sendTeamNotification(teamId: String, title: String, body: String) =
        sendTopicNotification(
            topicId = teamTopicId(teamId),
            title = title,
            body = body,
        )

    override suspend fun sendEventNotification(
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean
    ) =
        sendTopicNotification(
            topicId = if (isTournament) tournamentTopicId(eventId) else eventTopicId(eventId),
            title = title,
            body = body,
        )

    override suspend fun sendMatchNotification(matchId: String, title: String, body: String) =
        sendTopicNotification(
            topicId = matchTopicId(matchId),
            title = title,
            body = body,
        )

    override suspend fun sendChatGroupNotification(
        chatGroupId: String, title: String, body: String
    ) = sendTopicNotification(
        topicId = normalizeId(chatGroupId, "Chat group id"),
        title = title,
        body = body,
    )

    override suspend fun createTeamTopic(team: Team) = upsertTopic(
        topicId = teamTopicId(team.id),
        topicName = team.name,
        userIds = listOf(team.captainId) + team.playerIds + team.pending,
    )

    override suspend fun deleteTopic(id: String) = runCatching {
        val topicId = normalizeId(id, "Topic id")
        api.deleteNoResponse("api/messaging/topics/$topicId")
    }

    override suspend fun createEventTopic(event: Event) = upsertTopic(
        topicId = eventTopicId(event.id),
        topicName = event.name,
        userIds = listOf(event.hostId) + event.userIds + event.refereeIds,
    )

    override suspend fun createTournamentTopic(event: Event) = upsertTopic(
        topicId = tournamentTopicId(event.id),
        topicName = event.name,
        userIds = listOf(event.hostId) + event.userIds + event.refereeIds,
    )

    override suspend fun createChatGroupTopic(chatGroup: ChatGroup) = upsertTopic(
        topicId = normalizeId(chatGroup.id, "Chat group id"),
        topicName = chatGroup.name,
        userIds = chatGroup.userIds,
    )

    override suspend fun addDeviceAsTarget(): Result<Unit> = runCatching {
        val userId = resolveCurrentOrCachedPushUserId()
            ?: error("Cannot register push target without a signed-in user.")

        val token = currentCachedPushTokenOrNull() ?: fetchPushTokenFromNotifier()
        if (token.isNullOrBlank()) {
            Napier.w("Push token unavailable; storing backend target for later token refresh.")
            scheduleDeferredDeviceTargetSync(userId)
        }

        syncDeviceTargetWithBackend(userId, token)
    }

    override suspend fun removeDeviceAsTarget(): Result<Unit> = runCatching {
        val userId = resolveCurrentOrCachedPushUserId()
        val cachedTarget = userDataSource.getPushTarget().first().trim()

        val resolvedUserId = userId ?: userIdFromTopicId(cachedTarget)
        val localPushToken = currentCachedPushTokenOrNull()?.trim()?.takeIf(String::isNotBlank)
        val targetTopicId = when {
            cachedTarget.isNotBlank() -> cachedTarget
            !resolvedUserId.isNullOrBlank() -> userTopicId(resolvedUserId)
            else -> null
        }

        if (!targetTopicId.isNullOrBlank() && !resolvedUserId.isNullOrBlank() && !localPushToken.isNullOrBlank()) {
            runCatching {
                api.deleteNoResponse(
                    path = "api/messaging/topics/$targetTopicId/subscriptions",
                    body = MessagingTopicSubscriptionRequestDto(
                        userIds = listOf(resolvedUserId),
                        pushToken = localPushToken,
                        pushTarget = targetTopicId,
                    ),
                )
            }.onFailure { error ->
                Napier.w("Failed to remove device target from backend: ${error.message}")
            }
        } else if (!targetTopicId.isNullOrBlank() && !resolvedUserId.isNullOrBlank()) {
            Napier.w("Skipping backend push target removal because local device token is unavailable.")
        }

        deferredTokenSyncJob?.cancel()
        deferredTokenSyncJob = null
        userDataSource.savePushTarget("")
        userDataSource.savePushToken("")
    }

    override suspend fun getDeviceTargetDebugStatus(syncBeforeCheck: Boolean): Result<PushDeviceTargetDebugStatus> =
        runCatching {
            if (syncBeforeCheck) {
                addDeviceAsTarget().getOrThrow()
            }

            val userId = resolveCurrentOrCachedPushUserId()
            val localPushToken = currentCachedPushTokenOrNull()?.trim()?.takeIf(String::isNotBlank)
            val localPushTarget = userDataSource.getPushTarget().first().trim().takeIf(String::isNotBlank)
            val topicId = localPushTarget ?: userId?.let(::userTopicId)

            if (userId.isNullOrBlank() || topicId.isNullOrBlank()) {
                return@runCatching PushDeviceTargetDebugStatus(
                    userId = userId,
                    topicId = topicId,
                    localPushToken = localPushToken,
                    localPushTarget = localPushTarget,
                )
            }

            val queryParams = buildList {
                add("userId=${userId.encodeURLQueryComponent()}")
                if (!localPushToken.isNullOrBlank()) {
                    add("pushToken=${localPushToken.encodeURLQueryComponent()}")
                }
            }
            val encodedTopicId = topicId.encodeURLPathPart()
            val responsePath = if (queryParams.isNotEmpty()) {
                "api/messaging/topics/$encodedTopicId/subscriptions?${queryParams.joinToString("&")}"
            } else {
                "api/messaging/topics/$encodedTopicId/subscriptions"
            }

            val response = api.get<MessagingTopicSubscriptionDebugResponseDto>(responsePath)
            PushDeviceTargetDebugStatus(
                userId = userId,
                topicId = response.topicId.ifBlank { topicId },
                localPushToken = localPushToken,
                localPushTarget = localPushTarget,
                hasAnyTargetForUser = response.hasAnyTargetForUser,
                hasTopicTargetForUser = response.hasTopicTargetForUser,
                hasProvidedTokenForUser = response.hasProvidedTokenForUser,
                hasProvidedTokenOnTopic = response.hasProvidedTokenOnTopic,
                tokenRecordPushTarget = response.tokenRecordPushTarget,
                tokenRecordPushPlatform = response.tokenRecordPushPlatform,
                tokenRecordUpdatedAt = response.tokenRecordUpdatedAt,
                tokenRecordLastSeenAt = response.tokenRecordLastSeenAt,
            )
        }

    private suspend fun subscribeUserToTopic(userId: String, topicId: String): Result<Unit> = runCatching {
        val normalizedUserId = normalizeId(userId, "User id")
        val normalizedTopicId = normalizeId(topicId, "Topic id")
        api.postNoResponse(
            path = "api/messaging/topics/$normalizedTopicId/subscriptions",
            body = MessagingTopicSubscriptionRequestDto(
                userIds = listOf(normalizedUserId),
            ),
        )
    }

    private suspend fun unsubscribeUserFromTopic(userId: String, topicId: String): Result<Unit> = runCatching {
        val normalizedUserId = normalizeId(userId, "User id")
        val normalizedTopicId = normalizeId(topicId, "Topic id")
        api.deleteNoResponse(
            path = "api/messaging/topics/$normalizedTopicId/subscriptions",
            body = MessagingTopicSubscriptionRequestDto(
                userIds = listOf(normalizedUserId),
            ),
        )
    }

    private suspend fun sendTopicNotification(
        topicId: String,
        title: String,
        body: String,
        userIds: List<String> = emptyList(),
    ): Result<Unit> = runCatching {
        val normalizedTopicId = normalizeId(topicId, "Topic id")
        val normalizedTitle = title.trim().ifBlank { "Notification" }
        val normalizedBody = body.trim().ifBlank { "You have a new update." }
        val senderId = resolveCurrentOrCachedPushUserId()

        api.postNoResponse(
            path = "api/messaging/topics/$normalizedTopicId/messages",
            body = MessagingTopicMessageRequestDto(
                title = normalizedTitle,
                body = normalizedBody,
                userIds = userIds,
                senderId = senderId,
            ),
        )
    }

    private suspend fun upsertTopic(
        topicId: String,
        topicName: String?,
        userIds: List<String>,
    ): Result<Unit> = runCatching {
        val normalizedTopicId = normalizeId(topicId, "Topic id")
        val normalizedUserIds = userIds.map(String::trim).filter(String::isNotBlank).distinct()
        api.postNoResponse(
            path = "api/messaging/topics/$normalizedTopicId",
            body = MessagingTopicUpsertRequestDto(
                topicName = topicName?.trim()?.takeIf(String::isNotBlank),
                userIds = normalizedUserIds.takeIf { it.isNotEmpty() },
            ),
        )
    }

    private suspend fun fetchPushTokenFromNotifier(): String? {
        val notifierToken = runCatching {
            NotifierManager.getPushNotifier().getToken()
        }.getOrElse { error ->
            Napier.w("Failed to fetch push token from notifier: ${error.message}")
            null
        }

        val normalizedNotifierToken = notifierToken?.trim()?.takeIf(String::isNotBlank)
        if (normalizedNotifierToken != null) {
            userDataSource.savePushToken(normalizedNotifierToken)
            return normalizedNotifierToken
        }

        val platformToken = runCatching {
            platformPushTokenOrNull()?.trim()?.takeIf(String::isNotBlank)
        }.onFailure { error ->
            Napier.w("Failed to fetch platform push token fallback: ${error.message}")
        }.getOrNull()

        if (!platformToken.isNullOrBlank()) {
            userDataSource.savePushToken(platformToken)
            return platformToken
        }

        return null
    }

    private suspend fun currentCachedPushTokenOrNull(): String? {
        val cached = pushTokenState.value.trim().takeIf(String::isNotBlank)
        if (cached != null) return cached
        return fetchPushTokenFromNotifier()
    }

    private suspend fun syncDeviceTargetWithBackend(userId: String, pushToken: String?) {
        if (!ensureAuthTokenAvailableForPushSync()) {
            Napier.w("Skipping push target sync because auth token is missing.")
            return
        }

        val normalizedUserId = normalizeId(userId, "User id")
        val topicId = userTopicId(normalizedUserId)

        api.postNoResponse(
            path = "api/messaging/topics/$topicId/subscriptions",
            body = MessagingTopicSubscriptionRequestDto(
                userIds = listOf(normalizedUserId),
                pushToken = pushToken?.takeIf(String::isNotBlank),
                pushTarget = topicId,
            ),
        )
        userDataSource.savePushTarget(topicId)
    }

    private suspend fun ensureAuthTokenAvailableForPushSync(): Boolean {
        val existing = api.tokenStore.get().trim()
        if (existing.isNotBlank()) return true

        val refreshed = runCatching {
            api.get<AuthResponseDto>("api/auth/me").token?.trim()
        }.onFailure { error ->
            Napier.w("Failed to bootstrap auth token for push sync: ${error.message}")
        }.getOrNull()

        val token = refreshed?.takeIf(String::isNotBlank) ?: return false
        api.tokenStore.set(token)
        return true
    }

    private fun scheduleDeferredDeviceTargetSync(userId: String) {
        val activeJob = deferredTokenSyncJob
        if (activeJob != null && activeJob.isActive) return

        deferredTokenSyncJob = scope.launch {
            val normalizedUserId = normalizeId(userId, "User id")
            repeat(DEFERRED_TOKEN_SYNC_ATTEMPTS) { attempt ->
                delay(DEFERRED_TOKEN_SYNC_INTERVAL_MS * (attempt + 1))
                val token = currentCachedPushTokenOrNull()
                if (token.isNullOrBlank()) {
                    return@repeat
                }

                runCatching {
                    syncDeviceTargetWithBackend(normalizedUserId, token)
                }.onFailure { error ->
                    Napier.w("Deferred push target sync attempt failed: ${error.message}")
                }
                return@launch
            }

            Napier.w("Push token still unavailable after deferred sync attempts.")
        }
    }

    private suspend fun resolveCurrentOrCachedPushUserId(): String? {
        val userId = userDataSource.getUserId().first().trim()
        if (userId.isNotBlank()) return userId

        val cachedTarget = userDataSource.getPushTarget().first().trim()
        return userIdFromTopicId(cachedTarget)
    }

    private fun userIdFromTopicId(topicId: String): String? {
        val prefix = USER_TOPIC_PREFIX
        if (!topicId.startsWith(prefix)) return null
        return topicId.removePrefix(prefix).trim().takeIf(String::isNotBlank)
    }

    private fun userTopicId(userId: String): String = USER_TOPIC_PREFIX + normalizeId(userId, "User id")
    private fun teamTopicId(teamId: String): String = topicId(TEAM_TOPIC_PREFIX, teamId, "Team id")
    private fun eventTopicId(eventId: String): String = topicId(EVENT_TOPIC_PREFIX, eventId, "Event id")
    private fun tournamentTopicId(eventId: String): String = topicId(TOURNAMENT_TOPIC_PREFIX, eventId, "Tournament id")
    private fun matchTopicId(matchId: String): String = topicId(MATCH_TOPIC_PREFIX, matchId, "Match id")

    private fun topicId(prefix: String, id: String, label: String): String =
        "${prefix}${normalizeId(id, label)}"

    private fun normalizeId(value: String, label: String): String =
        value.trim().takeIf(String::isNotBlank) ?: error("$label cannot be blank.")

    private companion object {
        const val USER_TOPIC_PREFIX = "user_"
        const val TEAM_TOPIC_PREFIX = "team_"
        const val EVENT_TOPIC_PREFIX = "event_"
        const val TOURNAMENT_TOPIC_PREFIX = "tournament_"
        const val MATCH_TOPIC_PREFIX = "match_"
        const val DEFERRED_TOKEN_SYNC_ATTEMPTS = 6
        const val DEFERRED_TOKEN_SYNC_INTERVAL_MS = 2_000L
    }
}
