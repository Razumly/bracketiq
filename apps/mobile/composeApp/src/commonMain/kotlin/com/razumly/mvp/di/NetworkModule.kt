package com.razumly.mvp.di

import com.razumly.mvp.core.network.AuthTokenStore
import com.razumly.mvp.core.network.DataStoreAuthTokenStore
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.network.createMvpHttpClient
import org.koin.dsl.bind
import org.koin.dsl.module

val networkModule = module {
    single { DataStoreAuthTokenStore(get()) } bind AuthTokenStore::class
    single { createMvpHttpClient() }
    single { MvpApiClient(get(), apiBaseUrl, get()) }
}
