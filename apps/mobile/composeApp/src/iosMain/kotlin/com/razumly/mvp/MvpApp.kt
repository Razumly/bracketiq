package com.razumly.mvp

import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.di.KoinInitializer
import io.github.aakira.napier.DebugAntilog
import kotlin.experimental.ExperimentalObjCName
import io.github.aakira.napier.Napier
import platform.Foundation.NSBundle

@OptIn(ExperimentalObjCName::class)
@ObjCName("initKoin")
fun initKoin() {
    if (Platform.isDebugBuild) {
        Napier.base(DebugAntilog())
        Napier.d(tag = "DI") { "Starting Koin initialization" }
    }
    try {
        KoinInitializer().init()
        if (Platform.isDebugBuild) {
            Napier.d(tag = "DI") { "Koin initialization completed successfully" }
        }
    } catch (e: Exception) {
        if (Platform.isDebugBuild) {
            Napier.e(tag = "DI", throwable = e) { "Failed to initialize Koin" }
        }
        throw e
    }
}
