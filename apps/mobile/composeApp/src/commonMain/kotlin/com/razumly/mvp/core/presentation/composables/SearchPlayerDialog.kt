package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.razumly.mvp.core.data.dataTypes.UserData

private enum class InviteEntryMode {
    SearchPlayers,
    InviteByEmail,
}

@Composable
fun SearchPlayerDialog(
    freeAgents: List<UserData>,
    friends: List<UserData>,
    onSearch: (query: String) -> Unit,
    onPlayerSelected: (UserData) -> Unit,
    onInviteByEmail: ((email: String) -> Unit)? = null,
    onDismiss: () -> Unit,
    suggestions: List<UserData>,
    eventName: String,
    entryLabel: String = "User",
) {
    var searchQuery by remember { mutableStateOf("") }
    var showSearchOverlay by remember { mutableStateOf(false) }
    var mode by remember(onInviteByEmail) { mutableStateOf(InviteEntryMode.SearchPlayers) }

    val isEmailMode = mode == InviteEntryMode.InviteByEmail
    val normalizedQuery = searchQuery.trim()
    val showInviteByEmail = onInviteByEmail != null && isEmailMode && normalizedQuery.isProbablyEmail()

    Dialog(
        onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f))
                .padding(16.dp)
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() }
                ) {
                    onDismiss()
                }
        ) {
            Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Top
            ) {
                Card(
                    modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Add $entryLabel", style = MaterialTheme.typography.titleLarge
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        SearchBox(
                            placeholder = if (isEmailMode) "Invite $entryLabel by email" else "Search $entryLabel",
                            filter = false,
                            onChange = { newQuery ->
                                searchQuery = newQuery
                                if (!isEmailMode) {
                                    onSearch(newQuery)
                                }
                            },
                            onSearch = {
                                searchQuery = it
                                if (!isEmailMode) {
                                    onSearch(it)
                                }
                            },
                            modifier = Modifier,
                            onFocusChange = { isFocused ->
                                if (isFocused) {
                                    showSearchOverlay = true
                                } else if (searchQuery.isEmpty()) {
                                    showSearchOverlay = false
                                }
                            },
                            onPositionChange = { _, _ ->
                            },
                            onFilterChange = { },
                            onToggleFilter = { },
                            rowAction = onInviteByEmail?.let {
                                {
                                    OutlinedButton(onClick = {
                                        mode = if (isEmailMode) {
                                            InviteEntryMode.SearchPlayers
                                        } else {
                                            InviteEntryMode.InviteByEmail
                                        }
                                        searchQuery = ""
                                        if (!isEmailMode) {
                                            onSearch("")
                                        }
                                        showSearchOverlay = true
                                    }) {
                                        Text(
                                            text = if (isEmailMode) "Search $entryLabel"
                                            else "Invite by Email"
                                        )
                                    }
                                }
                            },
                        )
                    }
                }
                SearchOverlay(
                    modifier = Modifier.fillMaxSize(),
                    isVisible = showSearchOverlay,
                    searchQuery = searchQuery,
                    onDismiss = {
                        showSearchOverlay = false
                    },
                    initial = {
                        if (!isEmailMode) {
                            LazyColumn {
                                if (freeAgents.isNotEmpty()) {
                                    item {
                                        Card(
                                            Modifier.padding(vertical = 4.dp, horizontal = 8.dp)
                                                .fillMaxWidth()
                                        ) {
                                            Text(
                                                text = "Free Agents of $eventName",
                                                modifier = Modifier.padding(8.dp),
                                                overflow = TextOverflow.Ellipsis,
                                                maxLines = 1,
                                                style = MaterialTheme.typography.bodyLarge
                                            )
                                        }
                                    }
                                }
                                items(freeAgents) { player ->
                                    Row(modifier = Modifier.fillMaxWidth().clickable {
                                        onPlayerSelected(player)
                                        onDismiss()
                                    }.padding(8.dp)) {
                                        PlayerCard(player)
                                    }
                                }
                                if (friends.isNotEmpty()) {
                                    item {
                                        Card(
                                            Modifier.padding(vertical = 4.dp, horizontal = 8.dp)
                                                .fillMaxWidth()
                                        ) {
                                            Text(
                                                text = "Friends",
                                                modifier = Modifier.padding(8.dp),
                                                overflow = TextOverflow.Ellipsis,
                                                maxLines = 1,
                                                style = MaterialTheme.typography.bodyLarge
                                            )
                                        }
                                    }
                                    items(friends) { friend ->
                                        Row(modifier = Modifier.fillMaxWidth().clickable {
                                            onPlayerSelected(friend)
                                            onDismiss()
                                        }.padding(8.dp)) {
                                            PlayerCard(friend)
                                        }
                                    }
                                }
                            }
                        } else {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Text(
                                        text = "Enter an email and tap Invite by Email.",
                                        modifier = Modifier.padding(12.dp),
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                }
                            }
                        }
                    },
                    suggestions = {
                        LazyColumn {
                            if (isEmailMode) {
                                when {
                                    showInviteByEmail -> {
                                        item {
                                            Card(
                                                Modifier
                                                    .padding(vertical = 4.dp, horizontal = 8.dp)
                                                    .fillMaxWidth()
                                                    .clickable {
                                                        onInviteByEmail?.invoke(normalizedQuery)
                                                        onDismiss()
                                                    }
                                            ) {
                                                Text(
                                                    text = "Invite $normalizedQuery as $entryLabel",
                                                    modifier = Modifier.padding(12.dp),
                                                    overflow = TextOverflow.Ellipsis,
                                                    maxLines = 1,
                                                    style = MaterialTheme.typography.bodyLarge
                                                )
                                            }
                                        }
                                    }

                                    normalizedQuery.isNotBlank() -> {
                                        item {
                                            Card(
                                                Modifier
                                                    .padding(vertical = 4.dp, horizontal = 8.dp)
                                                    .fillMaxWidth()
                                            ) {
                                                Text(
                                                    text = "Enter a valid email address to invite $entryLabel.",
                                                    modifier = Modifier.padding(12.dp),
                                                    style = MaterialTheme.typography.bodyLarge
                                                )
                                            }
                                        }
                                    }
                                }
                            } else {
                                items(suggestions) { player ->
                                    Row(modifier = Modifier.fillMaxWidth().clickable {
                                        onPlayerSelected(player)
                                        onDismiss()
                                    }.padding(8.dp)) {
                                        PlayerCard(player)
                                    }
                                }
                            }
                        }
                    })
            }
        }
    }
}

private fun String.isProbablyEmail(): Boolean {
    val s = trim()
    if (s.isBlank()) return false
    if (s.length > 254) return false
    if (s.any { it.isWhitespace() }) return false
    val at = s.indexOf('@')
    if (at <= 0 || at != s.lastIndexOf('@')) return false
    val dot = s.lastIndexOf('.')
    return dot > at + 1 && dot < s.length - 1
}
