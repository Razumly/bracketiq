package com.razumly.mvp.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.chat.Composables.ChatListItem
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog

@Composable
fun ChatListScreen(component: ChatListComponent) {
    val chatList by component.chatGroups.collectAsState()
    var showNewChatDialog by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            IconButton(
                onClick = { showNewChatDialog = true },
            ) {
                if (!showNewChatDialog) {
                    Icon(Icons.Default.Add, contentDescription = "Create Chat")
                }
            }
        },
        floatingActionButtonPosition = FabPosition.End
    ) {
        LazyColumn(
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
    val usersInChat by remember { mutableStateOf(listOf<UserData>()) }
    var showSearchDialog by remember { mutableStateOf(false) }
    val suggestions by component.suggestedPlayers.collectAsState()
    val friends by component.friends.collectAsState()
    val newChat by component.newChat.collectAsState()

    Dialog(onDismissRequest = { onDismiss() }) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            LazyColumn {
                items(usersInChat) {
                    PlayerCard(player = it)
                }
                item {
                    InvitePlayerCard() {
                        showSearchDialog = true
                    }
                }
            }
            Row {
                IconButton(onClick = { component.onChatCreated() }) {
                    Icon(Icons.Default.Check, contentDescription = "Create Chat")
                }
                IconButton(onClick = { onDismiss() }) {
                    Icon(Icons.Default.Close, contentDescription = "Cancel")
                }
            }
        }
        if (showSearchDialog) {
            SearchPlayerDialog(
                freeAgents = listOf(),
                friends = friends,
                onSearch = { component.searchPlayers(it) },
                onPlayerSelected = { component.updateNewChatField { copy(userIds = newChat.userIds + it.id) } },
                onDismiss = { showSearchDialog = false },
                suggestions = suggestions,
                eventName = "",
            )
        }
    }
}