package com.razumly.mvp.di

import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.IMVPRepository
import org.koin.core.module.Module
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.bind
import org.koin.dsl.module

actual val MVPRepositoryModule: Module = module {
    singleOf(::MVPRepository).bind<IMVPRepository>()
}