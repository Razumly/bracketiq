package com.razumly.mvp.eventDetail

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import kotlin.time.Clock
import kotlin.time.Instant

@Composable
internal fun rememberRegistrationHoldRemainingLabel(
    expiresAt: String?,
    onExpired: () -> Unit,
): String? {
    val expiresAtInstant = remember(expiresAt) {
        expiresAt
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { raw -> runCatching { Instant.parse(raw) }.getOrNull() }
    }
    var now by remember(expiresAtInstant) { mutableStateOf(Clock.System.now()) }

    LaunchedEffect(expiresAtInstant) {
        if (expiresAtInstant == null) return@LaunchedEffect
        while (true) {
            now = Clock.System.now()
            if (expiresAtInstant <= now) {
                onExpired()
                return@LaunchedEffect
            }
            delay(1_000)
        }
    }

    val remainingSeconds = expiresAtInstant
        ?.let { (it - now).inWholeSeconds.coerceAtLeast(0) }
        ?: return null
    if (remainingSeconds <= 0) return null

    val minutes = remainingSeconds / 60
    val seconds = remainingSeconds % 60
    return "${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}"
}
