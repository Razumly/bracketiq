package com.razumly.mvp.di

import dev.icerock.moko.geo.LocationTracker
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

actual val locationTrackerModule = module {
    single {
        LocationTracker(
            permissionsController = get(),
            interval = 1000L,
        )
    }
}