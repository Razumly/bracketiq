package com.razumly.mvp.core.presentation.util

import platform.AudioToolbox.AudioServicesPlaySystemSound

actual fun playMatchTimerAlert() {
    AudioServicesPlaySystemSound(1005u)
}
