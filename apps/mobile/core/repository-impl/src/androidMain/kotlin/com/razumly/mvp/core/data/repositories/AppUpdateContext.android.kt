package com.razumly.mvp.core.data.repositories

import android.content.Context

private var appUpdateContext: Context? = null

fun configureAppUpdateUrlOpener(context: Context) {
    appUpdateContext = context.applicationContext
}

internal fun requireAppUpdateContext(): Context =
    checkNotNull(appUpdateContext) {
        "configureAppUpdateUrlOpener must be called before opening app update URLs."
    }
