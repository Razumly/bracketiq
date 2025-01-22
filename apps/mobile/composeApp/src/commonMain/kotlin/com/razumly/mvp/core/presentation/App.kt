package com.razumly.mvp.core.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.request.crossfade
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.core.presentation.util.backAnimation
import com.razumly.mvp.home.HomeScreen
import com.razumly.mvp.userAuth.loginScreen.LoginScreen
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import dev.icerock.moko.permissions.compose.BindEffect
import io.github.aakira.napier.DebugAntilog
import io.github.aakira.napier.Napier
import kotlinx.datetime.Clock


@Composable
fun App(root: RootComponent) {
    val childStack by root.childStack.subscribeAsState()
    Napier.base(DebugAntilog())
    Napier.d(tag = "Navigation") { "Current child: ${childStack.active.instance}" }

    setSingletonImageLoaderFactory { context ->
        ImageLoader
            .Builder(context)
            .crossfade(true)
            .build()
    }

    var lastNavigationTime by remember { mutableStateOf(0L) }
    var lastInstance by remember { mutableStateOf<Any?>(null) }

    LaunchedEffect(childStack.active.instance) {
        val currentTime = Clock.System.now().toEpochMilliseconds()
        val currentInstance = childStack.active.instance

        if (currentInstance != lastInstance && currentTime - lastNavigationTime < 300) {
            Napier.d(tag = "Navigation") { "Preventing rapid navigation: ${lastInstance} -> $currentInstance" }
            return@LaunchedEffect
        }

        lastInstance = currentInstance
        lastNavigationTime = currentTime
    }

    LogCompositions("iOS Nav", "App childStack")

    setSingletonImageLoaderFactory { context ->
        ImageLoader
            .Builder(context)
            .crossfade(true)
            .build()
    }
    BindEffect(root.permissionsController)
    BindLocationTrackerEffect(root.locationTracker)

    // Only animate root-level transitions with your custom iOS slides
    Children(
        stack = childStack,
        animation = backAnimation(
            backHandler = root.backHandler,
            onBack = {
                // If top is Home, do nothing (no going back to Login)
                val top = childStack.active.instance
                if (top is RootComponent.Child.Home) {
                    Napier.d(tag="Navigation") { "Ignoring back - at Home screen." }
                } else {
                    root.onBackClicked()
                }
            }
        )
    ) { child ->
        when (val instance = child.instance) {
            is RootComponent.Child.Login -> {
                Napier.d(tag = "Navigation") { "Navigating to Login Screen" }
                LoginScreen(component = instance.component)
            }
            is RootComponent.Child.Home -> {
                Napier.d(tag = "Navigation") { "Navigating to Home Screen" }
                HomeScreen(instance.component)
            }
        }
    }
}

class RecompositionCounter(var value: Int)

@Composable
inline fun LogCompositions(tag: String, msg: String) {
    val recompositionCounter = remember { RecompositionCounter(0) }
    Napier.d(tag = tag) { "$msg Count=${recompositionCounter.value}" }
    recompositionCounter.value++
}


