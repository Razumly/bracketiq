package com.razumly.mvp.di

import io.appwrite.Client
import org.koin.core.module.Module
import org.koin.dsl.module

actual val clientModule = module {
    single {
        Client(get())
            .setEndpoint("https://cloud.appwrite.io/v1") // Your API Endpoint
            .setProject("6656a4d60016b753f942") // Your project ID
    }
}