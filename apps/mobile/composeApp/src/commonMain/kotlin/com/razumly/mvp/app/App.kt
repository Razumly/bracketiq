package com.razumly.mvp.app

import androidx.collection.MutableObjectList
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.arkivanov.decompose.ExperimentalDecomposeApi
import com.arkivanov.decompose.extensions.compose.experimental.stack.ChildStack
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.router.stack.ChildStack
import com.razumly.mvp.chat.ChatGroupScreen
import com.razumly.mvp.chat.ChatListScreen
import com.razumly.mvp.core.analytics.AnalyticsTracker
import com.razumly.mvp.core.data.repositories.AppUpdatePrompt
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.MVPBottomNavBar
import com.razumly.mvp.core.presentation.composables.PlatformFocusManager
import com.razumly.mvp.core.presentation.guides.GuideController
import com.razumly.mvp.core.presentation.guides.GuideHost
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.core.presentation.localAllFocusManagers
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
import com.razumly.mvp.profileCompletion.ProfileCompletionScreen
import com.razumly.mvp.refundManager.RefundManagerScreen
import com.razumly.mvp.teamManagement.TeamManagementScreen
import com.razumly.mvp.userAuth.AuthScreen
import com.razumly.mvp.userAuth.DefaultAuthComponent
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@OptIn(ExperimentalDecomposeApi::class)
@Composable
fun App(root: RootComponent) {
    val childStack by root.childStack.subscribeAsState()
    val selectedPage by root.selectedPage.collectAsState()
    val unreadChatMessageCount by root.unreadChatMessageCount.collectAsState()
    val pendingInviteCount by root.pendingInviteCount.collectAsState()
    val appUpdatePrompt by root.appUpdatePrompt.collectAsState()
    val centerNavAction by root.centerNavAction.collectAsState()
    val accountGuideCompletionState by root.accountGuideCompletionState.collectAsState()
    val currentUserResult by root.currentUser.collectAsState()
    val activeEventTeamCheckInPrompt by root.activeEventTeamCheckInPrompt.collectAsState()
    val activeEventTeamCheckInSaving by root.activeEventTeamCheckInSaving.collectAsState()
    val activeEventTeamCheckInError by root.activeEventTeamCheckInError.collectAsState()
    val currentGuideAccountId = currentUserResult
        .getOrNull()
        ?.id
        ?.trim()
        ?.takeIf(String::isNotBlank)

    val popupHandler = remember { PopupHandlerImpl() }
    val loadingHandler = remember { LoadingHandlerImpl() }
    val loadingState by loadingHandler.loadingState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    val composeFocusManager = LocalFocusManager.current
    val allFocusManagers = remember { MutableObjectList<PlatformFocusManager>() }
    val guideController = remember(root) {
        GuideController(onGuideCompleted = root::markGuideCompleted)
    }
    var analyticsUserId by remember { mutableStateOf<String?>(null) }


    LaunchedEffect(Unit) {
        root.requestInitialPermissions()
    }

    LaunchedEffect(currentUserResult) {
        val userId = currentUserResult.getOrNull()?.id?.trim().orEmpty()
        if (userId.isNotEmpty()) {
            if (analyticsUserId != userId) {
                AnalyticsTracker.identify(userId)
                analyticsUserId = userId
            }
        } else if (analyticsUserId != null) {
            AnalyticsTracker.reset()
            analyticsUserId = null
        }
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
                    } catch (cancelled: CancellationException) {
                        throw cancelled
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

    LaunchedEffect(currentGuideAccountId, accountGuideCompletionState) {
        guideController.updateAccount(currentGuideAccountId)
        guideController.updateCompletedGuideIds(
            accountId = accountGuideCompletionState.accountId,
            ids = accountGuideCompletionState.completedGuideIds,
            loaded = accountGuideCompletionState.isLoaded,
        )
    }

    CompositionLocalProvider(localAllFocusManagers provides allFocusManagers) {
        CompositionLocalProvider(
            LocalPopupHandler provides popupHandler,
            LocalLoadingHandler provides loadingHandler,
            LocalGuideController provides guideController,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .dismissKeyboardOnBackgroundInteraction(composeFocusManager)
            ) {
                val currentChild = childStack.active.instance

                val shouldShowBottomNav = currentChild !is RootComponent.Child.Login &&
                    currentChild !is RootComponent.Child.Splash &&
                    currentChild !is RootComponent.Child.Chat &&
                    currentChild !is RootComponent.Child.MatchContent &&
                    currentChild !is RootComponent.Child.ProfileCompletion

                MVPBottomNavBar(
                    selectedPage = selectedPage,
                    unreadChatMessageCount = unreadChatMessageCount,
                    pendingInviteCount = pendingInviteCount,
                    centerAction = centerNavAction,
                    onCenterActionClick = root::onCenterNavActionSelected,
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

                appUpdatePrompt?.let { prompt ->
                    AppUpdateDialog(
                        prompt = prompt,
                        onUpdateNow = root::openAppUpdate,
                        onDismiss = root::dismissAppUpdatePrompt,
                    )
                }

                activeEventTeamCheckInPrompt?.takeIf { appUpdatePrompt == null }?.let { prompt ->
                    AlertDialog(
                        onDismissRequest = {
                            if (!activeEventTeamCheckInSaving) {
                                root.dismissActiveEventTeamCheckInPrompt()
                            }
                        },
                        title = { Text("Team event check-in") },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Check in ${prompt.teamName} for ${prompt.eventName}.")
                                activeEventTeamCheckInError?.let { error ->
                                    Text(error, color = MaterialTheme.colorScheme.error)
                                }
                            }
                        },
                        confirmButton = {
                            Button(
                                onClick = root::confirmActiveEventTeamCheckIn,
                                enabled = !activeEventTeamCheckInSaving,
                            ) {
                                Text(if (activeEventTeamCheckInSaving) "Saving..." else "Check in")
                            }
                        },
                        dismissButton = {
                            Button(
                                onClick = root::dismissActiveEventTeamCheckInPrompt,
                                enabled = !activeEventTeamCheckInSaving,
                            ) {
                                Text("Later")
                            }
                        },
                    )
                }

                if (!loadingState.isLoading && appUpdatePrompt == null) {
                    GuideHost(
                        controller = guideController,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }
}

@Composable
private fun AppUpdateDialog(
    prompt: AppUpdatePrompt,
    onUpdateNow: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = {
            if (!prompt.updateRequired) onDismiss()
        },
        properties = DialogProperties(
            dismissOnBackPress = !prompt.updateRequired,
            dismissOnClickOutside = !prompt.updateRequired,
        ),
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 420.dp),
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = if (prompt.updateRequired) "Update required" else "Update available",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            text = "Version ${prompt.versionName} is ready.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!prompt.updateRequired) {
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier.size(40.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close",
                            )
                        }
                    }
                }

                if (prompt.updateRequired) {
                    Text(
                        text = "This update is required to keep using Bracket IQ.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 220.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val showReleaseHeaders = prompt.releases.size > 1
                    prompt.releases.forEach { release ->
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            if (showReleaseHeaders) {
                                Text(
                                    text = "Version ${release.versionName}",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                            release.changes.forEach { change ->
                                Text(
                                    text = "- $change",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    }
                }

                Button(
                    onClick = onUpdateNow,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Update now")
                }
            }
        }
    }
}

private fun Modifier.dismissKeyboardOnBackgroundInteraction(
    focusManager: FocusManager
): Modifier = pointerInput(focusManager) {
    awaitPointerEventScope {
        while (true) {
            val event = awaitPointerEvent(PointerEventPass.Final)
            val changes = event.changes
            if (changes.any { it.positionChanged() && it.isConsumed }) {
                focusManager.clearFocus(force = true)
                continue
            }
            if (changes.any { it.changedToUpIgnoreConsumed() } && changes.none { it.isConsumed }) {
                focusManager.clearFocus(force = true)
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

                is RootComponent.Child.ProfileCompletion -> {
                    ProfileCompletionScreen(instance.component)
                }

                is RootComponent.Child.Search -> {
                    EventSearchScreen(instance.component, instance.mapComponent)
                }

                is RootComponent.Child.EventContent -> {
                    EventDetailScreen(instance.component, instance.mapComponent, instance.initialTab)
                }

                is RootComponent.Child.OrganizationDetail -> {
                    OrganizationDetailScreen(instance.component)
                }

                is RootComponent.Child.MatchContent -> {
                    MatchDetailScreen(instance.component, instance.mapComponent, root::onBackClicked)
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
    // A platform Dialog gives assistive technologies a true modal boundary and
    // prevents keyboard focus from escaping to controls behind the overlay.
    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.42f))
                .semantics { contentDescription = "Loading. $message" },
            contentAlignment = Alignment.Center,
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
                        CircularProgressIndicator(
                            progress = { progress },
                            modifier = Modifier.size(48.dp),
                            trackColor = ProgressIndicatorDefaults.circularIndeterminateTrackColor,
                        )
                        Text("${(progress * 100).toInt()}%")
                    } else {
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
}
