package com.razumly.mvp.di

import org.koin.core.context.startKoin


class KoinInitializer {
    actual fun init() {
        startKoin {
            modules(mainViewModelModule )
        }

    }
}