package com.razumly.mvp.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog
import com.razumly.mvp.home.LocalNavBarPadding

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListScreen(component: ChatListComponent) {
    val chatList by component.chatGroups.collectAsState()
    var showNewChatDialog by remember { mutableStateOf(false) }
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        topBar = {
            TopAppBar(
                { Text("Chats") },
                scrollBehavior = scrollBehavior
            )
        },
        modifier = Modifier.padding(LocalNavBarPadding.current)
            .nestedScroll(scrollBehavior.nestedScrollConnection), floatingActionButton = {
            IconButton(
                onClick = { showNewChatDialog = true },
            ) {
                if (!showNewChatDialog) {
                    Icon(Icons.Default.Add, contentDescription = "Create Chat")
                }
            }
        }, floatingActionButtonPosition = FabPosition.End
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding).padding(16.dp).fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(chatList) {
                ChatListItem(
                    modifier = Modifier.clickable { component.onChatSelected(it) }, chatGroup = it
                )
            }
        }
        AnimatedVisibility(showNewChatDialog) {
            NewChatDialog(component) { showNewChatDialog = false }
        }
    }
}

@Composable
fun NewChatDialog(component: ChatListComponent, onDismiss: () -> Unit) {
    val newChat by component.newChat.collectAsState()
    var showSearchDialog by remember { mutableStateOf(false) }
    val suggestions by component.suggestedPlayers.collectAsState()
    val friends by component.friends.collectAsState()
    var isValid by remember { mutableStateOf(false) }

    LaunchedEffect(newChat) {
        isValid = newChat.chatGroup.name.isNotEmpty() && newChat.users.size > 1
    }

    Dialog(onDismissRequest = { onDismiss() }) {
        Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                OutlinedTextField(
                    value = newChat.chatGroup.name,
                    onValueChange = {
                        component.updateNewChatField { newChat.chatGroup.copy(name = it) }
                    },
                    label = { Text("Chat Name") },
                    modifier = Modifier.fillMaxWidth(),
                )
                LazyColumn {
                    items(newChat.users) {
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
                    IconButton(enabled = isValid, onClick = {
                        component.onChatCreated()
                        onDismiss()
                    }) {
                        Icon(Icons.Default.Check, contentDescription = "Create Chat")
                    }
                    IconButton(onClick = { onDismiss() }) {
                        Icon(Icons.Default.Close, contentDescription = "Cancel")
                    }
                }
            }
        }
        if (showSearchDialog) {
            SearchPlayerDialog(
                freeAgents = listOf(),
                friends = friends,
                onSearch = { component.searchPlayers(it) },
                onPlayerSelected = { component.addUserToNewChat(it) },
                onDismiss = { showSearchDialog = false },
                suggestions = suggestions.filter { suggestedUser ->
                    !newChat.users.map { chatUser -> chatUser.id }.contains(suggestedUser.id)
                },
                eventName = "",
            )
        }
    }
}