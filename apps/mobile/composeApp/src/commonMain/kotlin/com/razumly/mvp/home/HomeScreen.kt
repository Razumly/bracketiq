package com.razumly.mvp.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.core.presentation.composables.MVPBottomNavBar
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.util.backAnimation
import com.razumly.mvp.eventCreate.CreateEventScreen
import com.razumly.mvp.eventFollowing.EventFollowingScreen
import com.razumly.mvp.eventSearch.EventSearchScreen
import com.razumly.mvp.matchDetailScreen.MatchDetailScreen
import com.razumly.mvp.profile.ProfileScreen
import com.razumly.mvp.tournamentDetailScreen.TournamentDetailScreen
import io.github.aakira.napier.Napier

val LocalNavBarPadding = compositionLocalOf<PaddingValues> { error("No padding values provided") }

@Composable
fun HomeScreen(component: HomeComponent) {
    val childStack by component.childStack.subscribeAsState()
    val selectedPage = component.selectedPage.value
    Napier.d(tag = "HomeScreen") { "Current tab: ${childStack.active.configuration}" }

    MVPBottomNavBar(
        selectedPage = selectedPage,
        onPageSelected = {
            Napier.i(tag = "Navigation") { "Tab selected: $it" }
            component.onTabSelected(it)
        },
    ) { paddingValues ->
        CompositionLocalProvider(LocalNavBarPadding provides paddingValues) {
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