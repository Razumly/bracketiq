package com.razumly.mvp.wear.data

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

const val WEAR_MATCH_OPERATION_SYNC_PATH = "/mvp/matches/operations"

class WearMatchPhoneSync(
    context: Context,
    private val json: Json = createWearJson(),
) {
    private val applicationContext = context.applicationContext

    suspend fun sendOperation(operation: WearPendingMatchOperation) {
        val nodes = Wearable.getNodeClient(applicationContext).connectedNodes.awaitTask()
        if (nodes.isEmpty()) return
        val payload = json.encodeToString(operation).encodeToByteArray()
        nodes.forEach { node ->
            Wearable.getMessageClient(applicationContext)
                .sendMessage(node.id, WEAR_MATCH_OPERATION_SYNC_PATH, payload)
                .awaitTask()
        }
    }
}

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
