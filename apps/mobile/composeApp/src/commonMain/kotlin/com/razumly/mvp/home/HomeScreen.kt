package com.razumly.mvp.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProgressIndicatorDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.fade
import com.arkivanov.decompose.extensions.compose.experimental.stack.animation.stackAnimation
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.chat.ChatGroupScreen
import com.razumly.mvp.chat.ChatListScreen
import com.razumly.mvp.core.presentation.composables.MVPBottomNavBar
import com.razumly.mvp.core.util.ErrorHandlerImpl
import com.razumly.mvp.core.util.LoadingHandlerImpl
import com.razumly.mvp.core.util.LocalErrorHandler
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.eventCreate.CreateEventScreen
import com.razumly.mvp.eventDetail.EventDetailScreen
import com.razumly.mvp.eventManagement.EventManagementScreen
import com.razumly.mvp.eventSearch.EventSearchScreen
import com.razumly.mvp.matchDetail.MatchDetailScreen
import com.razumly.mvp.profile.ProfileScreen
import com.razumly.mvp.teamManagement.TeamManagementScreen
import io.github.aakira.napier.Napier
import kotlinx.coroutines.launch

val LocalNavBarPadding = compositionLocalOf<PaddingValues> { error("No padding values provided") }

@Composable
fun HomeScreen(component: HomeComponent) {
    val selectedPage by component.selectedPage.collectAsState()
    val errorHandler = remember { ErrorHandlerImpl() }
    val loadingHandler = remember { LoadingHandlerImpl() }
    val loadingState by loadingHandler.loadingState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    CompositionLocalProvider(
        LocalErrorHandler provides errorHandler,
        LocalLoadingHandler provides loadingHandler
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            MVPBottomNavBar(
                selectedPage = selectedPage,
                onPageSelected = {
                    Napier.i(tag = "Navigation") { "Tab selected: $it" }
                    component.onTabSelected(it)
                },
            ) { paddingValues ->
                Scaffold(
                    snackbarHost = {
                        SnackbarHost(
                            hostState = snackbarHostState,
                            modifier = Modifier.padding(paddingValues)
                        )
                    }
                ) { innerPadding ->
                    HomeContent(paddingValues, component)
                }
            }

            // Global Loading Overlay
            if (loadingState.isLoading) {
                LoadingOverlay(
                    message = loadingState.message,
                    progress = loadingState.progress,
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@OptIn(ExperimentalDecomposeApi::class)
@Composable
private fun HomeContent(
    paddingValues: PaddingValues,
    component: HomeComponent
) {
    val childStack by component.childStack.subscribeAsState()
    Napier.d(tag = "HomeScreen") { "Current tab: ${childStack.active.configuration}" }
    CompositionLocalProvider(LocalNavBarPadding provides paddingValues) {
        ChildStack(
            stack = childStack, animation = stackAnimation(fade())
        ) { child ->
            Box(
                modifier = Modifier.fillMaxSize()
            ) {
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

                    is HomeComponent.Child.Events -> {
                        Napier.d(tag = "Navigation") { "Navigating to Events Screen" }
                        EventManagementScreen(instance.component)
                    }
                }
            }
        }
    }
}

@Composable
fun LoadingOverlay(
    message: String,
    progress: Float? = null,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.6f))
            .clickable(enabled = false) { }, // Prevent interaction
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.padding(32.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                if (progress != null) {
                    // Determinate progress indicator
                    CircularProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.size(48.dp),
                        trackColor = ProgressIndicatorDefaults.circularIndeterminateTrackColor,
                    )
                    Text("${(progress * 100).toInt()}%")
                } else {
                    // Indeterminate progress indicator
                    CircularProgressIndicator(
                        modifier = Modifier.size(48.dp)
                    )
                }

                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}