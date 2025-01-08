package com.razumly.mvp.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.request.crossfade
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.eventCreate.presentation.CreateEventScreen
import com.razumly.mvp.eventContent.presentation.matchDetailScreen.MatchDetailScreen
import com.razumly.mvp.eventContent.presentation.tournamentDetailScreen.TournamentDetailScreen
import com.razumly.mvp.eventFollowing.presentation.EventFollowingScreen
import com.razumly.mvp.eventSearch.presentation.EventSearchScreen
import com.razumly.mvp.profile.presentation.ProfileScreen
import com.razumly.mvp.userAuth.presentation.loginScreen.LoginScreen
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

@Composable
fun HomeScreen(component: HomeComponent) {
    val childStack by component.childStack.subscribeAsState()
    Napier.d(tag = "HomeScreen") { "Current tab: ${childStack.active.configuration}" }

    MVPBottomNavBar(
        selectedPage = childStack.active.configuration,
        onPageSelected = {
            Napier.i(tag = "Navigation") { "Tab selected: $it" }
            component.onTabSelected(it)
        },
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            Children(
                stack = childStack,
                animation = backAnimation(
                    backHandler = (component as ComponentContext).backHandler,
                    onBack = { component.onBack() }
                )
            ) { child ->
                Box(modifier = Modifier.fillMaxSize()) {
                    // Only show back button if we have screens to go back to
                    if (childStack.backStack.isNotEmpty()) {
                        PlatformBackButton(
                            onBack = { component.onBack() },
                            modifier = Modifier.zIndex(1f)
                        )
                    }

                    // Screen content
                    when (val instance = child.instance) {
                        is HomeComponent.Child.Search -> {
                            Napier.d(tag = "Navigation") { "Navigating to Search Screen" }
                            EventSearchScreen(instance.component)
                        }
                        is HomeComponent.Child.TournamentContent -> {
                            Napier.d(tag = "Navigation") { "Navigating to Tournament Detail Screen" }
                            TournamentDetailScreen(instance.component)
                        }
                        is HomeComponent.Child.MatchContent -> {
                            Napier.d(tag = "Navigation") { "Navigating to Match Detail Screen" }
                            MatchDetailScreen(instance.component)
                        }
                        is HomeComponent.Child.Following -> {
                            Napier.d(tag = "Navigation") { "Navigating to Following Screen" }
                            EventFollowingScreen(instance.component)
                        }
                        is HomeComponent.Child.Create -> {
                            Napier.d(tag = "Navigation") { "Navigating to Create Event Screen" }
                            CreateEventScreen(instance.component)
                        }
                        is HomeComponent.Child.Profile -> {
                            Napier.d(tag = "Navigation") { "Navigating to Profile Screen" }
                            ProfileScreen(instance.component)
                        }
                    }
                }
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


