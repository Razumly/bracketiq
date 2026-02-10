package com.razumly.mvp.di

import io.github.aakira.napier.Napier
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import org.koin.core.context.startKoin

actual class KoinInitializer : SynchronizedObject() {
    companion object {
        private var isInitialized = false
    }

    actual fun init() {
        Napier.d(tag = "Koin") { "Attempting to initialize Koin" }

        if (!isInitialized) {
            synchronized(this) {
                if (!isInitialized) {
                    try {
                        Napier.d(tag = "Koin") { "Starting Koin initialization" }
                        startKoin {
                            modules(
                                MVPRepositoryModule,
                                permissionsControllerModule,
                                locationTrackerModule,
                                roomDBModule,
                                componentModule,
                                datastoreModule,
                                currentUserDataSourceModule,
                                networkModule,
                                mapComponentModule
                            )
                        }
                        isInitialized = true
                        Napier.d(tag = "Koin") { "Koin initialization completed successfully" }
                    } catch (e: Exception) {
                        Napier.e(tag = "Koin", throwable = e) { "Failed to initialize Koin" }
                        throw e
                    }
                } else {
                    Napier.d(tag = "Koin") { "Koin already initialized in synchronized block" }
                }
            }
        } else {
            Napier.d(tag = "Koin") { "Koin already initialized" }
        }
    }
}



