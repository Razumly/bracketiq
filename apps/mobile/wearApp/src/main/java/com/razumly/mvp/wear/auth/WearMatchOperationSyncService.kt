package com.razumly.mvp.wear.auth

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.razumly.mvp.wear.data.WEAR_MATCH_OPERATION_SYNC_PATH
import com.razumly.mvp.wear.data.WearApiClient
import com.razumly.mvp.wear.data.WearAuthTokenStore
import com.razumly.mvp.wear.data.WearMatchOperationStore
import com.razumly.mvp.wear.data.WearMatchRepository
import com.razumly.mvp.wear.data.WearPendingMatchOperation
import com.razumly.mvp.wear.data.createWearJson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString

private const val WEAR_MATCH_OPERATION_SYNC_TAG = "WearMatchOperationSync"

class WearMatchOperationSyncService : WearableListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = createWearJson()

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != WEAR_MATCH_OPERATION_SYNC_PATH) return
        val operation = runCatching {
            json.decodeFromString<WearPendingMatchOperation>(messageEvent.data.decodeToString())
        }.getOrElse { error ->
            Log.w(WEAR_MATCH_OPERATION_SYNC_TAG, "Ignoring malformed phone match operation.", error)
            return
        }

        scope.launch {
            runCatching {
                val tokenStore = WearAuthTokenStore(applicationContext)
                val operationStore = WearMatchOperationStore(applicationContext)
                val repository = WearMatchRepository(
                    api = WearApiClient(tokenStore),
                    tokenStore = tokenStore,
                    operationStore = operationStore,
                )
                if (repository.importPhoneOperation(operation)) {
                    WearMatchSyncEvents.notifyMatchUpdated(operation.matchId)
                }
            }.onFailure { error ->
                Log.w(WEAR_MATCH_OPERATION_SYNC_TAG, "Failed to import phone match operation.", error)
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
