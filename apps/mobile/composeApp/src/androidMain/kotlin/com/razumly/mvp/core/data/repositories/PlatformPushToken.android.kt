package com.razumly.mvp.core.data.repositories

import com.google.android.gms.tasks.Task
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import io.github.aakira.napier.Napier
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

internal actual suspend fun platformPushTokenOrNull(): String? {
    val messaging = runCatching { FirebaseMessaging.getInstance() }
        .onFailure { error ->
            Napier.w("FirebaseMessaging instance unavailable: ${error.message}")
        }
        .getOrNull() ?: return null

    runCatching { messaging.isAutoInitEnabled = true }
        .onFailure { error ->
            Napier.w("Failed to enable FirebaseMessaging auto-init: ${error.message}")
        }

    var shouldResetInstallation = false
    repeat(TOKEN_ATTEMPTS) { attempt ->
        val tokenTask = runCatching { messaging.token }
            .onFailure { error ->
                Napier.w("Failed to start Firebase token task: ${error.message}")
            }
            .getOrNull()

        val token = tokenTask?.awaitTokenResultOrNull { error ->
            val message = error?.message.orEmpty()
            val details = message.ifBlank { error?.javaClass?.simpleName ?: "unknown" }
            Napier.w("Firebase token fetch failed (attempt ${attempt + 1}/$TOKEN_ATTEMPTS): $details")
            if (
                message.contains("FIS_AUTH_ERROR", ignoreCase = true) ||
                message.contains("FirebaseInstallationsException", ignoreCase = true)
            ) {
                shouldResetInstallation = true
            }
        }

        if (!token.isNullOrBlank()) return token

        if (shouldResetInstallation) {
            shouldResetInstallation = false
            runCatching { FirebaseInstallations.getInstance().delete() }
                .onSuccess {
                    Napier.w("Deleted Firebase Installation after token auth error; retrying token fetch.")
                }
                .onFailure { error ->
                    Napier.w("Failed to delete Firebase Installation during token recovery: ${error.message}")
                }
        }

        if (attempt < TOKEN_ATTEMPTS - 1) {
            delay(TOKEN_RETRY_DELAYS_MS[attempt.coerceAtMost(TOKEN_RETRY_DELAYS_MS.lastIndex)])
        }
    }

    Napier.w(
        "Firebase push token is unavailable after retries. " +
            "Check Firebase Installations / API key restrictions for Android."
    )
    return null
}

private suspend fun Task<String>.awaitTokenResultOrNull(onFailure: (Exception?) -> Unit): String? =
    suspendCancellableCoroutine { continuation ->
        addOnCompleteListener { completedTask ->
            val token = if (completedTask.isSuccessful) {
                completedTask.result?.trim()?.takeIf(String::isNotBlank)
            } else {
                val error = completedTask.exception
                    ?: Exception(completedTask.exception?.message ?: "Token task failed.")
                onFailure(error)
                null
            }
            if (continuation.isActive) {
                continuation.resume(token)
            }
        }
    }

private const val TOKEN_ATTEMPTS = 4
private val TOKEN_RETRY_DELAYS_MS = longArrayOf(1_000L, 3_000L, 7_000L, 15_000L)
