package com.razumly.mvp.di

import org.koin.core.context.startKoin

actual class KoinInitializer {
    actual fun init() {
        startKoin {
            modules(
                mainViewModelModule,
                MVPRepositoryModule,
                eventSearchViewModelModule,
                tournamentContentViewModelModule,
                matchContentViewModelModule,
                createEventViewModelModule,
                clientModule
            )
        }
    }
}

