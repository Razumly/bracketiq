package com.razumly.mvp.di

import com.razumly.mvp.eventCreate.presentation.CreateEventViewModel
import org.koin.dsl.module

val createEventViewModelModule= module {
    single {
        CreateEventViewModel(
            appwriteRepository = get(),
            permissionsController = get(),
            locationTracker = get()
        )
    }
}