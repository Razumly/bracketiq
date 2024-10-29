package com.razumly.mvp.di

import com.razumly.mvp.core.data.AppwriteRepository
import org.koin.core.module.Module
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

actual val appwriteRepositoryModule: Module = module {
    singleOf(::AppwriteRepository)
}