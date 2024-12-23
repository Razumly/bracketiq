package com.razumly.mvp.di

import dev.icerock.moko.geo.LocationTracker
import org.koin.dsl.module

val locationTrackerModule = module {
    single{
        LocationTracker(
            permissionsController = get()
        )
    }
}