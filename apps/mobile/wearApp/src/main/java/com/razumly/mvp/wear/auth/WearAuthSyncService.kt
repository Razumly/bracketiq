package com.razumly.mvp.wear.auth

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.razumly.mvp.wear.data.WearApiClient
import com.razumly.mvp.wear.data.WearApiException
import com.razumly.mvp.wear.data.WearAuthResponseDto
import com.razumly.mvp.wear.data.WearAuthTokenStore
import com.razumly.mvp.wear.data.WearWatchExchangeRequestDto
import com.razumly.mvp.wear.data.WearWatchSetupMessageDto
import com.razumly.mvp.wear.data.createWearJson
import com.razumly.mvp.wear.data.normalizedText
import com.razumly.mvp.wear.data.resolveUserId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString

private const val WATCH_AUTH_SETUP_PATH = "/mvp/auth/watch-setup"
private const val WEAR_AUTH_SYNC_TAG = "WearAuthSync"

class WearAuthSyncService : WearableListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = createWearJson()

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != WATCH_AUTH_SETUP_PATH) return
        val setupToken = runCatching {
            json.decodeFromString<WearWatchSetupMessageDto>(messageEvent.data.decodeToString())
        }.getOrNull()
            ?.setupToken
            .normalizedText()
            ?: return

        scope.launch {
            runCatching {
                val tokenStore = WearAuthTokenStore(applicationContext)
                val api = WearApiClient(tokenStore)
                val response = api.post<WearWatchExchangeRequestDto, WearAuthResponseDto>(
                    path = "api/auth/watch/exchange",
                    body = WearWatchExchangeRequestDto(setupToken = setupToken),
                )
                if (!response.error.isNullOrBlank()) {
                    throw WearApiException(response.error)
                }
                val token = response.token.normalizedText()
                    ?: throw WearApiException("Watch setup did not return a session token.")
                val userId = response.resolveUserId()
                    ?: throw WearApiException("Watch setup did not return a user id.")
                val label = response.profile?.label()
                    ?: response.user?.name.normalizedText()
                    ?: response.user?.email.normalizedText()
                    ?: userId

                tokenStore.save(token = token, userId = userId, label = label)
                WearAuthSyncEvents.notifyTokenUpdated()
            }.onFailure { throwable ->
                Log.w(WEAR_AUTH_SYNC_TAG, "Failed to exchange watch setup token.", throwable)
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
