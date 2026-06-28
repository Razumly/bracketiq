package com.razumly.mvp.core.data.repositories

internal expect suspend fun openAppUpdateUrl(url: String): Result<Unit>
