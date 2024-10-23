package com.razumly.mvp.di

import com.razumly.mvp.core.presentation.MainViewModel
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.module

actual val mainViewModelModule = module {
    singleOf(::MainViewModel)
}