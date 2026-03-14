package com.razumly.mvp.core.data.repositories

internal expect suspend fun platformPushTokenOrNull(): String?
