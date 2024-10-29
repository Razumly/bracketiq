package com.razumly.mvp.di

import com.razumly.mvp.eventSearch.presentation.EventSearchViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

actual val eventSearchViewModelModule = module {
    viewModel {
        EventSearchViewModel(get(), get())
    }
}