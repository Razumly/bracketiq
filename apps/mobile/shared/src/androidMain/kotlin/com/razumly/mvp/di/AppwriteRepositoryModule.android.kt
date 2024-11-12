package com.razumly.mvp.di

import com.razumly.mvp.core.data.AppwriteRepositoryImplementation
import com.razumly.mvp.core.data.IAppwriteRepository
import org.koin.core.module.Module
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.bind
import org.koin.dsl.module

actual val AppwriteRepositoryImplementationModule: Module = module {
    singleOf(::AppwriteRepositoryImplementation).bind<IAppwriteRepository>()
}