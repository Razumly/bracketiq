package com.razumly.mvp


import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.material3.Text
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.window.ComposeUIViewController
import com.razumly.mvp.core.presentation.App
import com.razumly.mvp.core.presentation.MVPTheme
import com.razumly.mvp.core.presentation.RootComponent
import org.koin.mp.KoinPlatform.getKoin
import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.ios.PermissionsController
import kotlin.experimental.ExperimentalObjCName
import io.github.aakira.napier.Napier
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.stack.animation.predictiveback.PredictiveBackGestureOverlay
import com.arkivanov.essenty.backhandler.BackDispatcher


@ObjCName("MainViewController")
@OptIn(ExperimentalObjCName::class, ExperimentalDecomposeApi::class)
fun MainViewController() = ComposeUIViewController {
    Napier.d(tag = "Lifecycle") { "Creating MainViewController" }

    MVPTheme(darkTheme = isSystemInDarkTheme()) {
        val lifecycle = remember { LifecycleRegistry() }
        val backDispatcher = remember { BackDispatcher() }

        DisposableEffect(Unit) {
            Napier.d(tag = "Lifecycle") { "onCreate" }
            lifecycle.onCreate()
            lifecycle.onStart()
            lifecycle.onResume()

            onDispose {
                Napier.d(tag = "Lifecycle") { "Disposing MainViewController" }
                lifecycle.onPause()
                lifecycle.onStop()
                lifecycle.onDestroy()
            }
        }

        val root = remember {
            try {
                Napier.d(tag = "DI") { "Starting component creation" }

                val permissionsController = getKoin().get<PermissionsController>().also {
                    Napier.d(tag = "Permissions") { "Controller initialized" }
                }

                val locationTracker = getKoin().get<LocationTracker>().also {
                    Napier.d(tag = "Location") { "Tracker initialized" }
                }

                RootComponent(
                    componentContext = DefaultComponentContext(
                        lifecycle = lifecycle,
                        backHandler = backDispatcher  // Pass backDispatcher here
                    ),
                    permissionsController = permissionsController,
                    locationTracker = locationTracker
                ).also { component ->
                    Napier.d(tag = "Root") { "Component created" }
                    component.childStack.subscribe { stack ->
                        Napier.d(tag = "Navigation") { "Stack changed to $stack" }
                    }
                }
            } catch (e: Exception) {
                Napier.e(tag = "Root", throwable = e) { "Component creation failed" }
                null
            }
        }

        PredictiveBackGestureOverlay(
            backDispatcher = backDispatcher,
            backIcon = { progress, edge ->
                // Optional: Implement custom back icon animation based on progress and edge
            },
            modifier = Modifier,
            onClose = {
                // Optional: Handle close event
            }
        ) {
            root?.let {
                App(it)
            } ?: Box(Modifier.fillMaxSize()) {
                Text(
                    "Failed to initialize app components",
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }
    }
}






