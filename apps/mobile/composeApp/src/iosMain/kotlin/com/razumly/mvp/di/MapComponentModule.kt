package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.util.AppSecrets
import com.razumly.mvp.eventMap.MapComponent
import org.koin.dsl.module


val mapComponentModule = module {
    factory { (componentContext: ComponentContext, doGetEvents: Boolean) ->
        MapComponent(componentContext, doGetEvents, get(), get(), AppSecrets.googleMapsApiKey)
    }
}