package com.razumly.mvp.app

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitViewController
import com.razumly.mvp.LocalNativeViewFactory

@Composable
actual fun StartupSplashScreen() {
    if (!IosNativeScreenFlags.startupSplash) {
        ComposeStartupSplashScreen()
        return
    }

    val factory = LocalNativeViewFactory.current
    UIKitViewController(
        modifier = Modifier.fillMaxSize(),
        factory = factory::createNativeStartupSplashViewController,
    )
}
