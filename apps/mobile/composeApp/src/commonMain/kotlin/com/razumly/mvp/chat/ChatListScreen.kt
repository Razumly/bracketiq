package com.razumly.mvp.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.chat.composables.ChatListItem
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.NoScaffoldContentInsets
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.TermsConsentDialog

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListScreen(component: ChatListComponent) {
    val chatList by component.chatGroups.collectAsState()
    val chatSummaries by component.chatSummaries.collectAsState()
    val errorMessage by component.errorState.collectAsState()
    val chatTermsState by component.chatTermsState.collectAsState()
    val isCheckingChatTerms by component.isCheckingChatTerms.collectAsState()
    val showChatTermsPrompt by component.showChatTermsPrompt.collectAsState()
    var showNewChatDialog by remember { mutableStateOf(false) }
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()
    val navBottomPadding = LocalNavBarPadding.current.calculateBottomPadding()

    Scaffold(
        contentWindowInsets = NoScaffoldContentInsets,
        topBar = {
            TopAppBar(
                title = { Text("Chats") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
                scrollBehavior = scrollBehavior,
            )
        },
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        floatingActionButton = {
            if (!showNewChatDialog) {
                FloatingActionButton(
                    onClick = {
                        component.clearChatCreationFeedback()
                        showNewChatDialog = true
                    },
                    modifier = Modifier.padding(bottom = navBottomPadding),
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Create Chat")
                }
            }
        },
        floatingActionButtonPosition = FabPosition.End
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
            contentPadding = PaddingValues(
                start = 16.dp,
                top = 16.dp,
                end = 16.dp,
                bottom = 16.dp + navBottomPadding,
            ),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            errorMessage
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?.let { message ->
                    item {
                        ChatListErrorBanner(
                            message = message,
                            onRetry = component::retryLoadingChats,
                        )
                    }
                }
            items(chatList) {
                ChatListItem(
                    modifier = Modifier.clickable { component.onChatSelected(it) },
                    chatGroup = it,
                    currentUserId = component.currentUser.id,
                    summary = chatSummaries[it.chatGroup.id],
                )
            }
        }
        AnimatedVisibility(showNewChatDialog) {
            NewChatDialog(component) { showNewChatDialog = false }
        }

        if (showChatTermsPrompt) {
            TermsConsentDialog(
                state = chatTermsState,
                loading = isCheckingChatTerms,
                onAccept = component::acceptChatTermsPrompt,
                onDismiss = component::dismissChatTermsPrompt,
                intro = "Sending chat messages in Bracket IQ requires agreement to the Terms and EULA.",
            )
        }
    }
}

@Composable
fun NewChatDialog(component: ChatListComponent, onDismiss: () -> Unit) {
    val newChat by component.newChat.collectAsState()
    val chatCreationStatus by component.chatCreationStatus.collectAsState()
    val chatCreationError by component.chatCreationError.collectAsState()
    var showSearchDialog by remember { mutableStateOf(false) }
    var waitingForCreationResult by remember { mutableStateOf(false) }
    val suggestions by component.suggestedPlayers.collectAsState()
    val friends by component.friends.collectAsState()
    val currentUserId = component.currentUser.id
    val selectedUserIds = newChat.users.map { it.id }.toSet()
    val selectedOtherUsers = newChat.users.filter { it.id != currentUserId }
    var isValid by remember { mutableStateOf(false) }

    fun dismissDialog() {
        if (chatCreationStatus == ChatCreationStatus.CREATING) return
        waitingForCreationResult = false
        component.clearChatCreationFeedback()
        onDismiss()
    }

    LaunchedEffect(newChat) {
        isValid = newChat.chatGroup.userIds.distinct().size > 1
    }
    LaunchedEffect(chatCreationStatus, waitingForCreationResult) {
        if (!waitingForCreationResult) return@LaunchedEffect
        when (chatCreationStatus) {
            ChatCreationStatus.SUCCEEDED -> dismissDialog()
            ChatCreationStatus.FAILED -> waitingForCreationResult = false
            ChatCreationStatus.IDLE, ChatCreationStatus.CREATING -> Unit
        }
    }

    Dialog(onDismissRequest = ::dismissDialog) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                StandardTextField(
                    value = newChat.chatGroup.name,
                    onValueChange = {
                        component.updateNewChatField { newChat.chatGroup.copy(name = it) }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = "Chat Name (Optional)",
                )
                chatCreationError
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let { message ->
                        ChatCreationErrorMessage(message)
                    }
                LazyColumn {
                    items(selectedOtherUsers) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            PlayerCard(player = it, modifier = Modifier.weight(1f))
                            Button(onClick = {
                                component.removeUserFromNewChat(it)
                            }) {
                                Text("Remove")
                            }
                        }
                    }
                    item {
                        InvitePlayerCard() {
                            showSearchDialog = true
                        }
                    }
                }
                Row {
                    Button(
                        enabled = isValid && chatCreationStatus != ChatCreationStatus.CREATING,
                        onClick = {
                            waitingForCreationResult = true
                            component.onChatCreated()
                        },
                    ) {
                        Text(
                            when (chatCreationStatus) {
                                ChatCreationStatus.CREATING -> "Creating…"
                                ChatCreationStatus.FAILED -> "Retry"
                                ChatCreationStatus.IDLE, ChatCreationStatus.SUCCEEDED -> "Create chat"
                            }
                        )
                    }
                    TextButton(
                        enabled = chatCreationStatus != ChatCreationStatus.CREATING,
                        onClick = ::dismissDialog,
                    ) {
                        Text("Cancel")
                    }
                }
            }
        }
        if (showSearchDialog) {
            SearchPlayerDialog(
                freeAgents = listOf(),
                friends = friends.filter { friend ->
                    friend.id != currentUserId && !selectedUserIds.contains(friend.id)
                },
                onSearch = { component.searchPlayers(it) },
                onPlayerSelected = { component.addUserToNewChat(it) },
                onDismiss = { showSearchDialog = false },
                suggestions = suggestions.filter { suggestedUser ->
                    suggestedUser.id != currentUserId && !selectedUserIds.contains(suggestedUser.id)
                },
                eventName = "",
            )
        }
    }
}

@Composable
internal fun ChatListErrorBanner(
    message: String,
    onRetry: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Unable to update chats", style = MaterialTheme.typography.titleSmall)
            Text(message, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = onRetry) {
                Text("Retry")
            }
        }
    }
}

@Composable
private fun ChatCreationErrorMessage(message: String) {
    Text(
        text = "Couldn't create this chat. Your draft is still here. $message",
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.fillMaxWidth(),
    )
}
