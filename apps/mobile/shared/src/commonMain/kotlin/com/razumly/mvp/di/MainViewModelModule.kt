package com.razumly.mvp.di

import com.razumly.mvp.core.presentation.MainViewModel
import org.koin.dsl.module

val mainViewModelModule = module {
    single { MainViewModel(
        appwriteRepository = get(),
        permissionsController = get(),
        locationTracker = get()
    ) }
}