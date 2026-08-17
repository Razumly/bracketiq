package com.razumly.mvp.di

import com.razumly.mvp.core.data.CurrentUserDataSource
import org.koin.dsl.module

val currentUserDataSourceModule = module {
    single {
        CurrentUserDataSource(get())
    }
}