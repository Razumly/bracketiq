package com.razumly.mvp


import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
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
import com.arkivanov.decompose.extensions.compose.stack.animation.predictiveback.PredictiveBackGestureIcon
import com.arkivanov.decompose.extensions.compose.stack.animation.predictiveback.PredictiveBackGestureOverlay
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.razumly.mvp.core.presentation.composables.NativeViewFactory

val LocalNativeViewFactory = staticCompositionLocalOf<NativeViewFactory> {
    error("NativeViewFactory not provided")
}

@ObjCName("MainViewController")
@OptIn(ExperimentalObjCName::class, ExperimentalDecomposeApi::class)
fun MainViewController(
    nativeViewFactory: NativeViewFactory,
    deepLinkNav: RootComponent.DeepLinkNav? = null
) = ComposeUIViewController {
    Napier.d(tag = "Lifecycle") { "Creating MainViewController with deepLink: $deepLinkNav" }

    CompositionLocalProvider(LocalNativeViewFactory provides nativeViewFactory) {
        MVPTheme(darkTheme = isSystemInDarkTheme()) {
            val lifecycle = remember { LifecycleRegistry() }
            val backDispatcher = remember { BackDispatcher() }

            DisposableEffect(Unit) {
                lifecycle.onCreate()
                lifecycle.onStart()
                lifecycle.onResume()

                onDispose {
                    lifecycle.onPause()
                    lifecycle.onStop()
                    lifecycle.onDestroy()
                }
            }

            val root = remember {
                try {
                    val permissionsController = getKoin().get<PermissionsController>()

                    RootComponent(
                        componentContext = DefaultComponentContext(
                            lifecycle = lifecycle,
                            backHandler = backDispatcher
                        ),
                        permissionsController = permissionsController,
                        locationTracker = getKoin().get<LocationTracker>(),
                        deepLinkNav = deepLinkNav
                    )
                } catch (e: Exception) {
                    Napier.e(tag = "Root", throwable = e) { "Component creation failed" }
                    null
                }
            }

            PredictiveBackGestureOverlay(
                backDispatcher = backDispatcher,
                backIcon = { progress, _ ->
                    PredictiveBackGestureIcon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        progress = progress,
                    )
                },
                modifier = Modifier.fillMaxSize(),
                endEdgeEnabled = false,
                onClose = { }
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
}
