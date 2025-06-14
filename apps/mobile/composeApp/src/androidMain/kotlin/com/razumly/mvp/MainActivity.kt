package com.razumly.mvp

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.handleDeepLink
import com.arkivanov.decompose.retainedComponent
import com.mmk.kmpnotifier.extensions.onCreateOrOnNewIntent
import com.mmk.kmpnotifier.notification.NotifierManager
import com.razumly.mvp.core.presentation.App
import com.razumly.mvp.core.presentation.MVPTheme
import com.razumly.mvp.core.presentation.RootComponent
import com.razumly.mvp.core.presentation.RootComponent.DeepLinkNav
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect
import dev.icerock.moko.permissions.compose.BindEffect
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

val LocalRootComponent = compositionLocalOf<RootComponent> { error("No component provided") }

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalDecomposeApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotifierManager.onCreateOrOnNewIntent(intent)
        val rootComponent = handleDeepLink { uri ->
            val deepLinkNav = uri?.extractDeepLinkNav()
            retainedComponent("RootRetainedComponent") {
                getKoin().get<RootComponent> { parametersOf(it, deepLinkNav) }
            }
        } ?: return
        setContent {
            MVPTheme {
                CompositionLocalProvider(LocalRootComponent provides rootComponent) {
                    BindLocationTrackerEffect(rootComponent.locationTracker)
                    BindEffect(rootComponent.permissionsController)
                    App(rootComponent)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        NotifierManager.onCreateOrOnNewIntent(intent)
    }

    private fun Uri.extractDeepLinkNav(): DeepLinkNav? {
        val pathSegments = pathSegments
        return when {
            pathSegments.size >= 2 && pathSegments[0] == "event" -> {
                DeepLinkNav.Event(pathSegments[1])
            }

            pathSegments.size >= 2 && pathSegments[0] == "tournament" -> {
                DeepLinkNav.Tournament(pathSegments[1])
            }

            pathSegments.size >= 2 && pathSegments[0] == "host" && pathSegments[1] == "onboarding" -> {
                val isRefresh = getQueryParameter("refresh")?.toBoolean() == true
                val isReturn = getQueryParameter("success")?.toBoolean() == true
                when {
                    isRefresh -> DeepLinkNav.Refresh
                    isReturn -> DeepLinkNav.Return
                    else -> null
                }
            }

            else -> null
        }
    }
}