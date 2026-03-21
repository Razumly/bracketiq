package com.razumly.mvp.core.presentation

import androidx.collection.MutableObjectList
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.router.stack.ChildStack
import com.razumly.mvp.chat.ChatGroupScreen
import com.razumly.mvp.chat.ChatListScreen
import com.razumly.mvp.core.presentation.composables.MVPBottomNavBar
import com.razumly.mvp.core.presentation.composables.PlatformFocusManager
import com.razumly.mvp.core.presentation.util.backAnimation
import com.razumly.mvp.core.util.LoadingHandlerImpl
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.core.util.PopupHandlerImpl
import com.razumly.mvp.eventCreate.CreateEventScreen
import com.razumly.mvp.eventDetail.EventDetailScreen
import com.razumly.mvp.eventManagement.EventManagementScreen
import com.razumly.mvp.eventSearch.EventSearchScreen
import com.razumly.mvp.matchDetail.MatchDetailScreen
import com.razumly.mvp.organizationDetail.OrganizationDetailScreen
import com.razumly.mvp.profile.ProfileScreen
import com.razumly.mvp.profile.profileDetails.ProfileDetailsScreen
import com.razumly.mvp.refundManager.RefundManagerScreen
import com.razumly.mvp.teamManagement.TeamManagementScreen
import com.razumly.mvp.userAuth.AuthScreen
import com.razumly.mvp.userAuth.DefaultAuthComponent
import io.github.aakira.napier.Napier
import kotlinx.coroutines.launch

val LocalNavBarPadding = compositionLocalOf<PaddingValues> {
    error("No padding values provided")
}
val localAllFocusManagers =
    compositionLocalOf<MutableObjectList<PlatformFocusManager>> { error("No List Provided") }

@OptIn(ExperimentalDecomposeApi::class)
@Composable
fun App(root: RootComponent) {
    val childStack by root.childStack.subscribeAsState()
    val selectedPage by root.selectedPage.collectAsState()
    val unreadChatMessageCount by root.unreadChatMessageCount.collectAsState()

    val popupHandler = remember { PopupHandlerImpl() }
    val loadingHandler = remember { LoadingHandlerImpl() }
    val loadingState by loadingHandler.loadingState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    val allFocusManagers = MutableObjectList<PlatformFocusManager>()


    LaunchedEffect(Unit) {
        root.requestInitialPermissions()
    }

    // Handle error display from your existing HomeScreen logic
    LaunchedEffect(popupHandler) {
        popupHandler.errorState.collect { error ->
            error?.let { errorMessage ->
                coroutineScope.launch {
                    try {
                        val result = snackbarHostState.showSnackbar(
                            message = errorMessage.message,
                            actionLabel = errorMessage.actionLabel,
                            duration = errorMessage.duration
                        )
                        if (result == SnackbarResult.ActionPerformed) {
                            errorMessage.action?.invoke()
                        }
                    } catch (e: Exception) {
                        Napier.e("Failed to show error: ${e.message}")
                    } finally {
                        popupHandler.clearError()
                    }
                }
            }
        }
    }

    LaunchedEffect(root) {
        root.startupNotice.collect { notice ->
            if (!notice.isNullOrBlank()) {
                snackbarHostState.showSnackbar(message = notice)
                root.onStartupNoticeShown()
            }
        }
    }

    CompositionLocalProvider(localAllFocusManagers provides allFocusManagers) {
        CompositionLocalProvider(
            LocalPopupHandler provides popupHandler, LocalLoadingHandler provides loadingHandler
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                val currentChild = childStack.active.instance

                val shouldShowBottomNav = currentChild !is RootComponent.Child.Login &&
                    currentChild !is RootComponent.Child.Splash &&
                    currentChild !is RootComponent.Child.Chat

                MVPBottomNavBar(
                    selectedPage = selectedPage,
                    unreadChatMessageCount = unreadChatMessageCount,
                    onPageSelected = { root.onTabSelected(it) },
                    showNavBar = shouldShowBottomNav
                ) { paddingValues ->
                    Scaffold(
                        snackbarHost = {
                            SnackbarHost(
                                hostState = snackbarHostState,
                                modifier = if (shouldShowBottomNav) {
                                    Modifier.padding(paddingValues)
                                } else {
                                    Modifier
                                }
                            )
                        }
                    ) { _ ->
                        AppContent(root, childStack, if (shouldShowBottomNav) paddingValues else null)
                    }
                }

                // Global Loading Overlay from your HomeScreen
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
}

@OptIn(ExperimentalDecomposeApi::class)
@Composable
private fun AppContent(
    root: RootComponent,
    childStack: ChildStack<*, RootComponent.Child>,
    paddingValues: PaddingValues?
) {
    val navigationDirection by root.navigationAnimationDirection.collectAsState()
    CompositionLocalProvider(
        LocalNavBarPadding provides (paddingValues ?: PaddingValues())
    ) {
        ChildStack(
            stack = childStack, animation = backAnimation(
                backHandler = root.backHandler,
                onBack = root::onBackClicked,
                horizontalDirectionProvider = { navigationDirection }
            )
        ) { child ->
            when (val instance = child.instance) {
                RootComponent.Child.Splash -> {
                    StartupSplashScreen()
                }

                is RootComponent.Child.Login -> {
                    AuthScreen(instance.component as DefaultAuthComponent)
                }

                is RootComponent.Child.Search -> {
                    EventSearchScreen(instance.component, instance.mapComponent)
                }

                is RootComponent.Child.EventContent -> {
                    EventDetailScreen(instance.component, instance.mapComponent)
                }

                is RootComponent.Child.OrganizationDetail -> {
                    OrganizationDetailScreen(instance.component)
                }

                is RootComponent.Child.MatchContent -> {
                    MatchDetailScreen(instance.component, instance.mapComponent)
                }

                is RootComponent.Child.ChatList -> {
                    ChatListScreen(instance.component)
                }

                is RootComponent.Child.Chat -> {
                    ChatGroupScreen(instance.component)
                }

                is RootComponent.Child.Create -> {
                    CreateEventScreen(instance.component, instance.mapComponent)
                }

                is RootComponent.Child.Profile -> {
                    ProfileScreen(instance.component)
                }

                is RootComponent.Child.Teams -> {
                    TeamManagementScreen(instance.component)
                }

                is RootComponent.Child.EventManagement -> {
                    EventManagementScreen(instance.component)
                }

                is RootComponent.Child.RefundManager -> {
                    RefundManagerScreen(instance.component)
                }

                is RootComponent.Child.ProfileDetails -> {
                    ProfileDetailsScreen(instance.component)
                }
            }
        }
    }
}

@Composable
private fun StartupSplashScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "BracketIQ",
                style = MaterialTheme.typography.headlineMedium,
            )
            CircularProgressIndicator(modifier = Modifier.size(40.dp))
        }
    }
}


@Composable
fun LoadingOverlay(
    message: String, progress: Float? = null, modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.42f))
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
