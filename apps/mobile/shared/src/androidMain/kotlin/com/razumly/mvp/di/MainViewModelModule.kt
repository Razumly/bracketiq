package com.razumly.mvp.di

import com.razumly.mvp.core.presentation.MainViewModel
import io.github.aakira.napier.DebugAntilog
import io.github.aakira.napier.Napier
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

actual val mainViewModelModule = module {
    viewModelOf(::MainViewModel)
}.also {
    Napier.base(DebugAntilog())
}