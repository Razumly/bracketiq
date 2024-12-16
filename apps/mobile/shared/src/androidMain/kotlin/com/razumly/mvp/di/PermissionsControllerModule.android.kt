package com.razumly.mvp.di

import dev.icerock.moko.permissions.PermissionsController
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.Module
import org.koin.dsl.module

actual val permissionsControllerModule: Module = module {
    single { PermissionsController(get()) }
}