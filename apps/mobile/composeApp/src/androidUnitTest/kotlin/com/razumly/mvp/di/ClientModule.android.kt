package com.razumly.mvp.di

import io.appwrite.Client
import org.koin.dsl.module

actual val clientModule = module {
    single {
        Client(get())
    }
}