package com.razumly.mvp.di

import io.appwrite.Client
import org.koin.core.module.Module
import org.koin.dsl.module

actual val clientModule: Module = module {
    single {
        Client()
            .setEndpoint("https://cloud.appwrite.io/v1")
            .setProject("6656a4d60016b753f942")
    }
}
