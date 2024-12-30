package com.razumly.mvp.core.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.request.crossfade
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.stack.animation.fade
import com.arkivanov.decompose.extensions.compose.stack.animation.plus
import com.arkivanov.decompose.extensions.compose.stack.animation.scale
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimation
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

@Composable
fun App(root: RootComponent) {
    val childStack by root.childStack.subscribeAsState()

    setSingletonImageLoaderFactory { context ->
        ImageLoader.Builder(context)
            .crossfade(true)
            .build()
    }
    BindEffect(root.permissionsController)
    BindLocationTrackerEffect(root.locationTracker)

    Children(
        stack = childStack,
        animation = stackAnimation(fade() + scale())
    ) { child ->
        when (val instance = child.instance) {
            is RootComponent.Child.Login -> LoginScreen(
                component = instance.component
            )
            is RootComponent.Child.Home -> HomeScreen(instance.component)
        }
    }
}

@Composable
fun HomeScreen(component: HomeComponent) {
    val childStack by component.childStack.subscribeAsState()

    MVPBottomNavBar(
        selectedPage = childStack.active.configuration,
        onPageSelected = component::onTabSelected,
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            Children(
                stack = childStack,
                animation = stackAnimation(fade() + scale())
            ) { child ->
                when (val instance = child.instance) {
                    is HomeComponent.Child.Search -> EventSearchScreen(
                        component = instance.component,
                    )
                    is HomeComponent.Child.TournamentContent -> TournamentDetailScreen(
                        component = instance.component,
                    )
                    is HomeComponent.Child.MatchContent -> MatchDetailScreen(
                        component = instance.component
                    )
                    is HomeComponent.Child.Following -> EventFollowingScreen(
                        component = instance.component
                    )
                    is HomeComponent.Child.Create -> CreateEventScreen(
                        component = instance.component
                    )
                    is HomeComponent.Child.Profile -> ProfileScreen(
                        component = instance.component
                    )
                }
            }
        }
    }
}
