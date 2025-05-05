package com.razumly.mvp.home

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.fade
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.stackAnimation
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.chat.ChatGroupScreen
import com.razumly.mvp.chat.ChatListScreen
import com.razumly.mvp.core.presentation.composables.MVPBottomNavBar
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.eventCreate.CreateEventScreen
import com.razumly.mvp.eventDetail.EventDetailScreen
import com.razumly.mvp.eventSearch.EventSearchScreen
import com.razumly.mvp.matchDetail.MatchDetailScreen
import com.razumly.mvp.profile.ProfileScreen
import com.razumly.mvp.teamManagement.TeamManagementScreen
import io.github.aakira.napier.Napier

val LocalNavBarPadding = compositionLocalOf<PaddingValues> { error("No padding values provided") }
val LocalAnimatedVisibilityScope =
    compositionLocalOf<AnimatedVisibilityScope> { error("No Animated Visibility Scope provided") }

@OptIn(ExperimentalSharedTransitionApi::class)
val LocalSharedTransitionScope =
    compositionLocalOf<SharedTransitionScope> { error("No Animated Visibility Scope provided") }

@OptIn(ExperimentalSharedTransitionApi::class, ExperimentalDecomposeApi::class)
@Composable
fun HomeScreen(component: HomeComponent) {
    val childStack by component.childStack.subscribeAsState()
    val selectedPage by component.selectedPage.collectAsState()

    Napier.d(tag = "HomeScreen") { "Current tab: ${childStack.active.configuration}" }

    MVPBottomNavBar(
        selectedPage = selectedPage,
        onPageSelected = {
            Napier.i(tag = "Navigation") { "Tab selected: $it" }
            component.onTabSelected(it)
        },
    ) { paddingValues ->
        CompositionLocalProvider(LocalNavBarPadding provides paddingValues) {
            SharedTransitionLayout {
                ChildStack(
                    stack = childStack, animation = stackAnimation(fade())
                ) { child ->
                    CompositionLocalProvider(LocalAnimatedVisibilityScope provides this) {
                        CompositionLocalProvider(LocalSharedTransitionScope provides this@SharedTransitionLayout) {
                            Box(
                                modifier = Modifier.fillMaxSize()
                            ) {
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
                                        EventSearchScreen(
                                            instance.component,
                                            instance.mapComponent
                                        )
                                    }

                                    is HomeComponent.Child.EventContent -> {
                                        Napier.d(tag = "Navigation") { "Navigating to Event Detail Screen" }
                                        EventDetailScreen(instance.component, instance.mapComponent)
                                    }

                                    is HomeComponent.Child.MatchContent -> {
                                        Napier.d(tag = "Navigation") { "Navigating to Match Detail Screen" }
                                        MatchDetailScreen(instance.component)
                                    }

                                    is HomeComponent.Child.ChatList -> {
                                        Napier.d(tag = "Navigation") { "Navigating to Messages Screen" }
                                        ChatListScreen(instance.component)
                                    }

                                    is HomeComponent.Child.Chat -> {
                                        Napier.d(tag = "Navigation") { "Navigating to Chat Screen" }
                                        ChatGroupScreen(instance.component)
                                    }

                                    is HomeComponent.Child.Create -> {
                                        Napier.d(tag = "Navigation") { "Navigating to Create Event Screen" }
                                        CreateEventScreen(instance.component, instance.mapComponent)
                                    }

                                    is HomeComponent.Child.Profile -> {
                                        Napier.d(tag = "Navigation") { "Navigating to Profile Screen" }
                                        ProfileScreen(instance.component)
                                    }

                                    is HomeComponent.Child.Teams -> {
                                        Napier.d(tag = "Navigation") { "Navigating to Team Management Screen" }
                                        TeamManagementScreen(instance.component)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
