package com.razumly.mvp.di

import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.network.createSecureAuthTokenStore
import com.razumly.mvp.core.network.createMvpHttpClient
import io.github.aakira.napier.Napier
import org.koin.dsl.bind
import org.koin.dsl.module

val networkModule = module {
    single { createSecureAuthTokenStore() } bind AuthTokenStore::class
    single { createMvpHttpClient() }
    single {
        Napier.i("NetworkModule: resolved apiBaseUrl=$apiBaseUrl")
        MvpApiClient(get(), apiBaseUrl, get())
    }
}
