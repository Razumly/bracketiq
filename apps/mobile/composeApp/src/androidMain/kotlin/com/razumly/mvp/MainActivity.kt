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
import io.github.aakira.napier.Napier
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

val LocalRootComponent = compositionLocalOf<RootComponent> { error("No component provided") }

class MainActivity : ComponentActivity() {
    private lateinit var rootComponent: RootComponent

    @OptIn(ExperimentalDecomposeApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotifierManager.onCreateOrOnNewIntent(intent)
        rootComponent = handleDeepLink { uri ->
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

        // Handle deep links when app is already open
        intent.data?.let { uri ->
            Napier.d(tag = "DeepLink", message = "Received deep link in onNewIntent: $uri")
            val deepLinkNav = uri.extractDeepLinkNav()
            if (deepLinkNav != null) {
                Napier.d(tag = "DeepLink", message = "Extracted DeepLinkNav: $deepLinkNav")
                rootComponent.handleDeepLink(deepLinkNav)
            } else {
                Napier.w(tag = "DeepLink", message = "Failed to extract DeepLinkNav from URI: $uri")
            }
        } ?: run {
            Napier.d(tag = "DeepLink", message = "No URI data in intent")
        }
    }

    private fun Uri.extractDeepLinkNav(): DeepLinkNav? {
        val pathSegments = pathSegments
        Napier.d(tag = "DeepLink", message = "Received URI: $this")
        Napier.d(tag = "DeepLink", message = "Path segments: $pathSegments")

        val effectiveSegments = if (pathSegments.isNotEmpty() && pathSegments[0] == "mvp") {
            pathSegments.drop(1)
        } else {
            pathSegments
        }

        return when {
            effectiveSegments.size >= 2 && effectiveSegments[0] == "event" -> {
                Napier.d(tag = "DeepLink", message = "Navigating to Event: ${effectiveSegments[1]}")
                DeepLinkNav.Event(effectiveSegments[1])
            }

            effectiveSegments.size >= 2 && effectiveSegments[0] == "tournament" -> {
                Napier.d(
                    tag = "DeepLink", message = "Navigating to Tournament: ${effectiveSegments[1]}"
                )
                DeepLinkNav.Tournament(effectiveSegments[1])
            }

            effectiveSegments.size >= 2 && effectiveSegments[0] == "host" && effectiveSegments[1] == "onboarding" -> {
                val isRefresh = getQueryParameter("refresh")?.toBoolean() == true
                val isReturn = getQueryParameter("success")?.toBoolean() == true
                Napier.d(
                    tag = "DeepLink",
                    message = "Host Onboarding - Refresh: $isRefresh, Return: $isReturn"
                )
                when {
                    isRefresh -> DeepLinkNav.Refresh
                    isReturn -> DeepLinkNav.Return
                    else -> null
                }
            }

            else -> {
                Napier.d(tag = "DeepLink", message = "No matching deep link pattern found")
                null
            }
        }
    }
}