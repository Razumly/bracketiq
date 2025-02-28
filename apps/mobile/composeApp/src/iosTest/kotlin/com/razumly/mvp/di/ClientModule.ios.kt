package com.razumly.mvp.di

import io.appwrite.Client
import org.koin.core.module.Module
import org.koin.dsl.module

actual val clientModule = module {
    single {
        Client()
            .setEndpoint("https://cloud.appwrite.io/v1") // Your API Endpo  int
            .setProject("6656a4d60016b753f942") // Your project ID
            .setSelfSigned(true)
    }
}