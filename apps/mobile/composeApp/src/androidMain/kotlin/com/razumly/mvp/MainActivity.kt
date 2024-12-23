package com.razumly.mvp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import com.arkivanov.decompose.DefaultComponentContext
import com.razumly.mvp.core.presentation.App
import com.razumly.mvp.core.presentation.MVPTheme
import com.razumly.mvp.core.presentation.RootComponent
import dev.icerock.moko.permissions.PermissionsController
import dev.icerock.moko.permissions.compose.PermissionsControllerFactory
import dev.icerock.moko.permissions.compose.rememberPermissionsControllerFactory
import kotlinx.coroutines.CoroutineScope
import org.koin.androidx.compose.KoinAndroidContext
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MVPTheme(
                darkTheme = true
            ) {
                KoinAndroidContext {
                    val rootComponent = getKoin().get<RootComponent>{
                        parametersOf(DefaultComponentContext(lifecycle))
                    }
                    App(rootComponent)
                }
            }
        }
    }
}