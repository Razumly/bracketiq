package com.razumly.mvp.core.auth

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.Wearable
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.WatchSetupMessageDto
import com.razumly.mvp.core.network.dto.WatchSetupRequestDto
import com.razumly.mvp.core.network.dto.WatchSetupResponseDto
import io.github.aakira.napier.Napier
import java.time.Instant
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val WATCH_AUTH_SETUP_PATH = "/mvp/auth/watch-setup"

actual fun createWatchAuthSync(api: MvpApiClient): WatchAuthSync =
    AndroidWatchAuthSync(
        context = requireWatchSyncContext(),
        api = api,
    )

private class AndroidWatchAuthSync(
    private val context: Context,
    private val api: MvpApiClient,
) : WatchAuthSync {
    private val json = Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    override suspend fun syncAuthenticatedWatch() {
        if (api.tokenStore.get().isBlank()) return

        val setup = api.post<WatchSetupRequestDto, WatchSetupResponseDto>(
            path = "api/auth/watch/setup",
            body = WatchSetupRequestDto(),
        )
        if (setup.setupToken.isBlank()) return

        val nodes = Wearable.getNodeClient(context).connectedNodes.awaitTask()
        if (nodes.isEmpty()) {
            Napier.d(tag = "WatchAuthSync") { "No connected Wear nodes for auth sync." }
            return
        }

        val payload = json.encodeToString(
            WatchSetupMessageDto(
                setupToken = setup.setupToken,
                issuedAt = Instant.now().toString(),
            ),
        ).encodeToByteArray()

        nodes.forEach { node ->
            Wearable.getMessageClient(context)
                .sendMessage(node.id, WATCH_AUTH_SETUP_PATH, payload)
                .awaitTask()
            Napier.i(tag = "WatchAuthSync") { "Sent watch auth setup token to node=${node.displayName}." }
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
