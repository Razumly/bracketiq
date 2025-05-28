package com.razumly.mvp.di

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.util.AppSecrets
import com.razumly.mvp.eventMap.MapComponent
import org.koin.dsl.module
import platform.Foundation.NSBundle


val mapComponentModule = module {
    factory { (componentContext: ComponentContext) ->
        MapComponent(componentContext, get(), get(), AppSecrets.googlePlacesApiKey, NSBundle.mainBundle.bundleIdentifier ?: "unknown")
    }
}