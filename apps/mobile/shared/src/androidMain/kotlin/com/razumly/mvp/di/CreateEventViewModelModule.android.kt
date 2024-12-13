package com.razumly.mvp.di

import com.razumly.mvp.eventCreate.presentation.CreateEventViewModel
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

actual val createEventViewModelModule = module {
    viewModelOf(::CreateEventViewModel)
}