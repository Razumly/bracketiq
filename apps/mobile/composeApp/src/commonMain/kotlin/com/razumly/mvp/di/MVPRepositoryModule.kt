package com.razumly.mvp.di

import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.MVPRepository
import org.koin.dsl.bind
import org.koin.dsl.module

val MVPRepositoryModule = module {
    single {
        MVPRepository(
            client = get(),
            tournamentDB = get(),
            currentUserDataSource = get()
        )
    } bind IMVPRepository::class
}