package com.razumly.mvp.di

import com.razumly.mvp.BuildConfig
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Client
import org.koin.dsl.module

actual val clientModule = module {
    single {
        Client(get())
            .setEndpoint(DbConstants.APPWRITE_ENDPOINT)
            .setProject(BuildConfig.MVP_PROJECT)
            .setSelfSigned(true)
    }
}