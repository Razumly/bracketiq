package com.razumly.mvp.di

import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.MVPRepository
import org.koin.dsl.bind
import org.koin.dsl.module

val MVPRepositoryModule = module {
    single {
        MVPRepository(
            client = get(),
            tournamentDB = get()
        )
    } bind IMVPRepository::class
}