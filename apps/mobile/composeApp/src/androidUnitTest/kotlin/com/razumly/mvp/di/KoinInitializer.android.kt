package com.razumly.mvp.di

import android.content.Context
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.GlobalContext

actual class KoinInitializer(
    private val context: Context
) {
    actual fun init() {
        if (GlobalContext.getOrNull() == null) {
            GlobalContext.startKoin {
                androidContext(context)
                modules(
                    MVPRepositoryModule,
                    permissionsControllerModule,
                    locationTrackerModule,
                    clientModule,
                    roomDBModule,
                    componentModule,
                    testDatastoreModule
                )
            }
        }
    }
}