package com.razumly.mvp

import com.razumly.mvp.di.KoinInitializer
import io.github.aakira.napier.DebugAntilog
import kotlin.experimental.ExperimentalObjCName
import io.github.aakira.napier.Napier
import platform.Foundation.NSBundle

@OptIn(ExperimentalObjCName::class)
@ObjCName("initKoin")
fun initKoin() {
    Napier.base(DebugAntilog())
    Napier.d(tag = "DI") { "Starting Koin initialization" }
    try {
        KoinInitializer().init()
        Napier.d(tag = "DI") { "Koin initialization completed successfully" }
    } catch (e: Exception) {
        Napier.e(tag = "DI", throwable = e) { "Failed to initialize Koin" }
        throw e
    }
}
