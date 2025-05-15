package com.razumly.mvp.di

import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import org.koin.dsl.bind
import org.koin.dsl.module

val MVPRepositoryModule = module {
    single {
        UserRepository(
            get(),
            get(),
            get(),
            get(),
            get()
        )
    } bind IMVPRepository::class
}