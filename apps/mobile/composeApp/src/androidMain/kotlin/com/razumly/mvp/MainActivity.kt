package com.razumly.mvp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.arkivanov.decompose.retainedComponent
import com.razumly.mvp.core.presentation.App
import com.razumly.mvp.core.presentation.MVPTheme
import com.razumly.mvp.core.presentation.RootComponent
import org.koin.androidx.compose.KoinAndroidContext
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MVPTheme(
                darkTheme = false
            ) {
                KoinAndroidContext {
                    val rootComponent = retainedComponent { getKoin().get<RootComponent>{ parametersOf(it) } }
                    App(rootComponent)
                }
            }
        }
    }
}