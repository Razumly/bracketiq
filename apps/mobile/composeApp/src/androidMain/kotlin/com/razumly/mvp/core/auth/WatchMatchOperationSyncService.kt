package com.razumly.mvp.core.auth

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry
import com.razumly.mvp.eventDetail.data.IMatchRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.koin.core.context.GlobalContext

private const val WATCH_MATCH_OPERATION_SYNC_PATH = "/mvp/matches/operations"
private const val WATCH_MATCH_OPERATION_SYNC_TAG = "WatchMatchOperationSync"

class WatchMatchOperationSyncService : WearableListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != WATCH_MATCH_OPERATION_SYNC_PATH) return
        val operation = runCatching {
            json.decodeFromString<WatchMatchOperationMessageDto>(messageEvent.data.decodeToString())
        }.getOrElse { error ->
            Log.w(WATCH_MATCH_OPERATION_SYNC_TAG, "Ignoring malformed watch match operation.", error)
            return
        }

        scope.launch {
            runCatching {
                val koin = GlobalContext.get()
                val databaseService = koin.get<DatabaseService>()
                val matchRepository = koin.get<IMatchRepository>()
                databaseService.getMatchOperationOutboxDao.upsertOperation(
                    MatchOperationOutboxEntry(
                        id = operation.id,
                        eventId = operation.eventId,
                        matchId = operation.matchId,
                        operationKind = operation.kind,
                        payloadJson = operation.payloadJson,
                        status = operation.status,
                        sourceDevice = operation.sourceDevice,
                        clientDeviceId = operation.clientDeviceId,
                        clientSequence = operation.clientSequence,
                        clientCreatedAt = operation.clientCreatedAt,
                        attemptCount = operation.attemptCount,
                        lastError = operation.lastError,
                        lastAttemptAt = operation.lastAttemptAt,
                    ),
                )
                matchRepository.syncPendingMatchOperations(operation.matchId)
            }.onFailure { error ->
                Log.w(WATCH_MATCH_OPERATION_SYNC_TAG, "Failed to import watch match operation.", error)
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}

@Serializable
private data class WatchMatchOperationMessageDto(
    val id: String,
    val eventId: String,
    val matchId: String,
    val kind: String,
    val payloadJson: String,
    val clientDeviceId: String,
    val clientCreatedAt: String,
    val clientSequence: Long,
    val sourceDevice: String = "WEAR_OS",
    val status: String = "PENDING",
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val lastAttemptAt: String? = null,
)
