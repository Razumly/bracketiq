package com.razumly.mvp.core.util

import com.razumly.mvp.BuildConfig

actual object Platform {
    actual val name: String = "Android"
    actual val isIOS: Boolean = false
}

actual val projectId: String = BuildConfig.MVP_PROJECT