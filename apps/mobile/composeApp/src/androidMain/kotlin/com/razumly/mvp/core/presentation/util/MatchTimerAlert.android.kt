package com.razumly.mvp.core.presentation.util

import android.media.AudioManager
import android.media.ToneGenerator
import kotlin.concurrent.thread

actual fun playMatchTimerAlert() {
    thread(name = "match-timer-alert") {
        val toneGenerator = try {
            ToneGenerator(AudioManager.STREAM_ALARM, 100)
        } catch (_: RuntimeException) {
            return@thread
        }

        try {
            toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 900)
            Thread.sleep(1_000L)
        } catch (_: RuntimeException) {
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        } finally {
            toneGenerator.release()
        }
    }
}
