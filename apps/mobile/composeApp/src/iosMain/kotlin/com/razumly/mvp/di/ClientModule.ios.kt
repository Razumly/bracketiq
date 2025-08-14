package com.razumly.mvp.di

import com.razumly.mvp.core.util.AppSecrets
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Client
import org.koin.dsl.module

actual val clientModule = module {
    single {
        Client()
            .setEndpoint(DbConstants.APPWRITE_ENDPOINT)
            .setProject(AppSecrets.mvpProjectId)
            .setSelfSigned(true)
    }
}