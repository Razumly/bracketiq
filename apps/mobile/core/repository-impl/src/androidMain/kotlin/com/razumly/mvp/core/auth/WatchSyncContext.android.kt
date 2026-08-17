package com.razumly.mvp.core.auth

import android.content.Context

private var watchSyncContext: Context? = null

fun configureWatchSyncContext(context: Context) {
    watchSyncContext = context.applicationContext
}

internal fun requireWatchSyncContext(): Context =
    checkNotNull(watchSyncContext) {
        "configureWatchSyncContext must be called before creating watch sync services."
    }
