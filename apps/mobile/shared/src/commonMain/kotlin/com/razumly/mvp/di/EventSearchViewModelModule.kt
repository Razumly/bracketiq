package com.razumly.mvp.di

import com.razumly.mvp.eventSearch.presentation.EventSearchViewModel
import org.koin.dsl.module

val eventSearchViewModelModule = module {
    single {
        EventSearchViewModel(get(), get())
    }
}