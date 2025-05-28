package com.razumly.mvp.di

import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.ios.PermissionsController
import io.github.aakira.napier.Napier
import org.koin.dsl.module

val locationTrackerModule = module {
    factory {
        Napier.d(tag = "DI") { "Creating LocationTracker instance" }
        try {
            LocationTracker(
                permissionsController = get<PermissionsController>()
            ).also { _ ->
                Napier.d(tag = "DI") { "LocationTracker instance created successfully" }
            }
        } catch (e: Exception) {
            Napier.e(tag = "DI", throwable = e) { "Failed to create LocationTracker instance" }
            throw e
        }
    }
}
