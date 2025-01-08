package com.razumly.mvp.di

import dev.icerock.moko.permissions.ios.PermissionsController
import io.github.aakira.napier.Napier
import org.koin.dsl.module

val permissionsControllerModule = module {
    single<PermissionsController> {
        Napier.d(tag = "DI") { "Creating PermissionsController instance" }
        try {
            PermissionsController().also { controller ->
                Napier.d(tag = "DI") { "PermissionsController instance created successfully" }
            }
        } catch (e: Exception) {
            Napier.e(tag = "DI", throwable = e) { "Failed to create PermissionsController instance" }
            throw e
        }
    }
}

