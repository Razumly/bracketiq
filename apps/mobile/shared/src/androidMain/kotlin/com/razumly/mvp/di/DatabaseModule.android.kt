package com.razumly.mvp.di

import com.razumly.mvp.core.data.Database
import org.koin.core.module.Module
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

actual val databaseModule: Module = module {
    singleOf(::Database)
}