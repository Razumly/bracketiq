package com.razumly.mvp.di

import dev.icerock.moko.permissions.PermissionsController
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

val permissionsControllerModule = module {
    single{
        PermissionsController(get())
    }
}