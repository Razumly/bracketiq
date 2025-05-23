package com.razumly.mvp.di

import com.razumly.mvp.core.util.AppSecrets
import io.appwrite.Client
import org.koin.dsl.module

actual val clientModule = module {
    single {
        Client()
            .setEndpoint("https://cloud.appwrite.io/v1")
            .setProject(AppSecrets.mvpProjectId)
            .setSelfSigned(true)
    }
}