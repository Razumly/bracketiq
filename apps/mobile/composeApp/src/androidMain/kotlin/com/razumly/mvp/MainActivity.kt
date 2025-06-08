package com.razumly.mvp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import com.arkivanov.decompose.retainedComponent
import com.mmk.kmpnotifier.extensions.onCreateOrOnNewIntent
import com.mmk.kmpnotifier.notification.NotifierManager
import com.razumly.mvp.core.presentation.App
import com.razumly.mvp.core.presentation.MVPTheme
import com.razumly.mvp.core.presentation.RootComponent
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

val LocalRootComponent = compositionLocalOf<RootComponent> { error("No component provided") }

class MainActivity : ComponentActivity() {
    private val rootComponent: RootComponent by lazy {
        retainedComponent("RootRetainedComponent") { getKoin().get<RootComponent>{ parametersOf(it) } }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotifierManager.onCreateOrOnNewIntent(intent)
        setContent {
            MVPTheme {
                CompositionLocalProvider(LocalRootComponent provides rootComponent) {
                    App(rootComponent)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        NotifierManager.onCreateOrOnNewIntent(intent)
    }
}