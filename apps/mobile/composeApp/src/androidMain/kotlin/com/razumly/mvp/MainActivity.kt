package com.razumly.mvp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.platform.LocalView
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
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

val LocalRootComponent = compositionLocalOf<RootComponent> { error("No component provided") }

class MainActivity : ComponentActivity() {
    private lateinit var rootComponent: RootComponent
    @Volatile
    private var keepSystemSplashVisible: Boolean = true

    @OptIn(ExperimentalDecomposeApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        splashScreen.setKeepOnScreenCondition { keepSystemSplashVisible }
        super.onCreate(savedInstanceState)

        NotifierManager.onCreateOrOnNewIntent(intent)
        Napier.d(tag = "intent", message = intent.data.toString())
        rootComponent = handleDeepLink { uri ->
            val deepLinkNav = uri?.extractDeepLinkNav()
            Napier.d(tag = "DeepLink", message = "Extracted DeepLinkNav: $deepLinkNav")
            retainedComponent("RootRetainedComponent") {
                getKoin().get<RootComponent> { parametersOf(it, deepLinkNav) }
            }
        } ?: return

        lifecycleScope.launch {
            rootComponent.isStartupInProgress.collect { inProgress ->
                keepSystemSplashVisible = inProgress
            }
        }

        setContent {
            val darkTheme = isSystemInDarkTheme()
            ApplyStatusBarContentStyle(darkTheme = darkTheme)

            MVPTheme(darkTheme = darkTheme) {
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
        setIntent(intent)
        NotifierManager.onCreateOrOnNewIntent(intent)
        Napier.d(tag = "intent", message = intent.data.toString())

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

    @Composable
    private fun ApplyStatusBarContentStyle(darkTheme: Boolean) {
        val view = LocalView.current
        if (view.isInEditMode) return

        SideEffect {
            val activity = view.context as? Activity ?: return@SideEffect
            val window = activity.window

            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    private fun Uri.extractDeepLinkNav(): DeepLinkNav? {
        val pathSegments = pathSegments.filter { it.isNotBlank() }
        Napier.d(tag = "DeepLink", message = "Received URI: $this")
        Napier.d(tag = "DeepLink", message = "Raw path segments: $pathSegments")

        val normalizedScheme = scheme.orEmpty().lowercase()
        val normalizedHost = host.orEmpty().lowercase()
        val segmentsWithHost = if (
            (normalizedScheme == "mvp" || normalizedScheme == "razumly") &&
            normalizedHost.isNotBlank() &&
            !normalizedHost.contains('.')
        ) {
            listOf(normalizedHost) + pathSegments
        } else {
            pathSegments
        }
        val effectiveSegments = if (segmentsWithHost.firstOrNull() == "mvp") {
            segmentsWithHost.drop(1)
        } else {
            segmentsWithHost
        }
        Napier.d(tag = "DeepLink", message = "Effective segments: $effectiveSegments")

        return when {
            effectiveSegments.size >= 2 -> {
                val route = effectiveSegments[0].lowercase()
                val eventId = effectiveSegments[1].trim()
                if (
                    route == "event" ||
                    route == "events" ||
                    route == "tournament" ||
                    route == "tournaments"
                ) {
                    if (eventId.isEmpty()) {
                        Napier.w(tag = "DeepLink", message = "Deep link event id was blank")
                        null
                    } else {
                        Napier.d(tag = "DeepLink", message = "Navigating to Event: $eventId")
                        DeepLinkNav.Event(eventId)
                    }
                } else if (route == "host" && effectiveSegments[1].lowercase() == "onboarding") {
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
                } else {
                    Napier.d(tag = "DeepLink", message = "No matching deep link pattern found")
                    null
                }
            }

            else -> {
                Napier.d(tag = "DeepLink", message = "No matching deep link pattern found")
                null
            }
        }
    }
}
