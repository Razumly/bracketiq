package com.razumly.mvp.di

import com.razumly.mvp.BuildConfig
import io.appwrite.Client
import org.koin.dsl.module

actual val clientModule = module {
    single {
        Client(get())
            .setEndpoint("https://cloud.appwrite.io/v1")
            .setProject(BuildConfig.MVP_PROJECT)
            .setSelfSigned(true)
    }
}