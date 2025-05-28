package com.razumly.mvp.di

import dev.icerock.moko.geo.LocationTracker
import org.koin.dsl.module

val locationTrackerModule = module {
    factory{
        LocationTracker(
            permissionsController = get()
        )
    }
}