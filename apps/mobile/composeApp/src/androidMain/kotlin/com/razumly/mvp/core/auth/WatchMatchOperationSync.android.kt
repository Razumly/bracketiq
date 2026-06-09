package com.razumly.mvp.core.auth

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.Wearable
import com.razumly.mvp.MvpApp
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry
import io.github.aakira.napier.Napier
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val WATCH_MATCH_OPERATION_SYNC_PATH = "/mvp/matches/operations"
private const val NO_CONNECTED_WATCH_CACHE_MS = 60_000L

actual fun createWatchMatchOperationSync(): WatchMatchOperationSync =
    AndroidWatchMatchOperationSync(MvpApp.applicationContext())

private class AndroidWatchMatchOperationSync(
    context: Context,
) : WatchMatchOperationSync {
    private val applicationContext = context.applicationContext
    private val json = Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }
    private var skipNodeLookupUntilElapsedMs: Long = 0L

    override suspend fun sendOperation(operation: MatchOperationOutboxEntry) {
        val nowElapsedMs = SystemClock.elapsedRealtime()
        if (nowElapsedMs < skipNodeLookupUntilElapsedMs) {
            return
        }

        val nodes = Wearable.getNodeClient(applicationContext).connectedNodes.awaitTask()
        if (nodes.isEmpty()) {
            skipNodeLookupUntilElapsedMs = nowElapsedMs + NO_CONNECTED_WATCH_CACHE_MS
            Napier.d(tag = "WatchMatchOperationSync") {
                "No connected Wear nodes for match operation sync; suppressing lookups briefly."
            }
            return
        }

        skipNodeLookupUntilElapsedMs = 0L
        val payload = json.encodeToString(operation.toWatchMessage()).encodeToByteArray()
        nodes.forEach { node ->
            runCatching {
                Wearable.getMessageClient(applicationContext)
                    .sendMessage(node.id, WATCH_MATCH_OPERATION_SYNC_PATH, payload)
                    .awaitTask()
            }.onFailure { throwable ->
                Napier.w(tag = "WatchMatchOperationSync") {
                    "Failed sending match operation ${operation.id} to ${node.displayName}: ${throwable.message}"
                }
            }
        }
    }
}

@Serializable
private data class WatchMatchOperationOutboundDto(
    val id: String,
    val eventId: String,
    val matchId: String,
    val kind: String,
    val payloadJson: String,
    val clientDeviceId: String,
    val clientCreatedAt: String,
    val clientSequence: Long,
    val sourceDevice: String,
    val status: String,
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val lastAttemptAt: String? = null,
)

private fun MatchOperationOutboxEntry.toWatchMessage(): WatchMatchOperationOutboundDto =
    WatchMatchOperationOutboundDto(
        id = id,
        eventId = eventId,
        matchId = matchId,
        kind = operationKind,
        payloadJson = payloadJson,
        clientDeviceId = clientDeviceId,
        clientCreatedAt = clientCreatedAt,
        clientSequence = clientSequence,
        sourceDevice = sourceDevice,
        status = status,
        attemptCount = attemptCount,
        lastError = lastError,
        lastAttemptAt = lastAttemptAt,
    )

private suspend fun <T> Task<T>.awaitTask(): T =
    suspendCancellableCoroutine { continuation ->
        addOnSuccessListener { result ->
            if (continuation.isActive) continuation.resume(result)
        }
        addOnFailureListener { throwable ->
            if (continuation.isActive) continuation.resumeWithException(throwable)
        }
        addOnCanceledListener {
            if (continuation.isActive) continuation.resumeWithException(CancellationException("Task was cancelled."))
        }
    }
