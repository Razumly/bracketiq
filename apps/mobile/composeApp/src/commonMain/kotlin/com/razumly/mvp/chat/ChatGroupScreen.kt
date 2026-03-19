@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlatformBackButton
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog
import com.razumly.mvp.core.presentation.util.timeFormat
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import androidx.compose.ui.window.Dialog
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatGroupScreen(component: ChatGroupComponent) {
    val input by component.messageInput.collectAsState()
    val chatGroupWithRelations by component.chatGroup.collectAsState()
    val friends by component.friends.collectAsState()
    val suggestedPlayers by component.suggestedPlayers.collectAsState()
    val isChatMuted by component.isChatMuted.collectAsState()
    val currentUserId = component.currentUser.id
    val chatGroup = chatGroupWithRelations?.chatGroup ?: ChatGroup.empty()
    val messages = chatGroupWithRelations?.messages ?: listOf()
    val users = chatGroupWithRelations?.users ?: listOf()
    val isHost = chatGroup.hostId == currentUserId
    val participantNames = users
        .mapNotNull { user -> user.fullName.asMeaningfulText() }
        .distinct()
        .joinToString(", ")
        .asMeaningfulText()
    val chatTitle = chatGroup.name.asMeaningfulText()
        ?: chatGroup.displayName.asMeaningfulText()
        ?: participantNames
        ?: "Chat"
    val listState = rememberLazyListState()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val latestMessageKey = messages
        .lastOrNull()
        ?.let { message -> messageKey(message, messages.lastIndex) }
        .orEmpty()
    var expandedMessageIds by remember(latestMessageKey) {
        mutableStateOf(
            if (latestMessageKey.isNotBlank()) setOf(latestMessageKey) else emptySet()
        )
    }
    var showOptionsMenu by remember { mutableStateOf(false) }
    var showDeleteChatDialog by remember { mutableStateOf(false) }
    var showLeaveChatDialog by remember { mutableStateOf(false) }
    var showManagePeopleDialog by remember { mutableStateOf(false) }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(chatTitle) },
                navigationIcon = {
                    PlatformBackButton(
                        onBack = component::onBack,
                        arrow = true,
                    )
                },
                actions = {
                    IconButton(
                        onClick = { showOptionsMenu = true }
                    ) {
                        Icon(
                            imageVector = Icons.Default.MoreVert,
                            contentDescription = "Chat options"
                        )
                    }
                    DropdownMenu(
                        expanded = showOptionsMenu,
                        onDismissRequest = { showOptionsMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Manage People") },
                            onClick = {
                                showManagePeopleDialog = true
                                showOptionsMenu = false
                            }
                        )
                        if (isHost) {
                            DropdownMenuItem(
                                text = { Text("Delete Chat") },
                                onClick = {
                                    showDeleteChatDialog = true
                                    showOptionsMenu = false
                                }
                            )
                        } else {
                            DropdownMenuItem(
                                text = { Text("Leave Chat") },
                                onClick = {
                                    showLeaveChatDialog = true
                                    showOptionsMenu = false
                                }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text(if (isChatMuted) "Unmute" else "Mute") },
                            onClick = {
                                component.toggleChatMute()
                                showOptionsMenu = false
                            }
                        )
                    }
                }
            )
        },
        contentWindowInsets = WindowInsets(0)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                contentPadding = PaddingValues(
                    bottom = 8.dp
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                itemsIndexed(
                    items = messages,
                    key = { index, message -> messageKey(message, index) }
                ) { index, message ->
                    val isCurrentUser = message.userId == currentUserId
                    val messageId = messageKey(message, index)
                    MessageCard(
                        message = message,
                        user = users.find { it.id == message.userId },
                        isCurrentUser = isCurrentUser,
                        isTimestampExpanded = messageId in expandedMessageIds,
                        onToggleTimestamp = {
                            expandedMessageIds = if (messageId in expandedMessageIds) {
                                expandedMessageIds - messageId
                            } else {
                                expandedMessageIds + messageId
                            }
                        }
                    )
                }
            }

            // Input area - fixed at bottom
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 8.dp,
                color = MaterialTheme.colorScheme.surface
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .padding(LocalNavBarPadding.current),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PlatformTextField(
                        value = input,
                        onValueChange = component::onMessageInputChange,
                        modifier = Modifier.weight(1f),
                        placeholder = "Type a message..."
                    )

                    Button(
                        onClick = {
                            component.sendMessage()
                            focusManager.clearFocus()
                            keyboardController?.hide()
                        },
                        enabled = input.isNotBlank()
                    ) {
                        Text("Send")
                    }
                }
            }
        }
    }

    if (showManagePeopleDialog) {
        ManagePeopleDialog(
            users = users,
            currentUserId = currentUserId,
            canEdit = isHost,
            friends = friends,
            suggestions = suggestedPlayers,
            onSearch = component::searchPlayers,
            onAddUser = component::addUserToChat,
            onRemoveUser = component::removeUserFromChat,
            onDismiss = { showManagePeopleDialog = false }
        )
    }

    if (showDeleteChatDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteChatDialog = false },
            title = { Text("Delete Chat?") },
            text = { Text("This deletes the chat for everyone and cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        component.deleteChat()
                        showDeleteChatDialog = false
                    }
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteChatDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (showLeaveChatDialog) {
        AlertDialog(
            onDismissRequest = { showLeaveChatDialog = false },
            title = { Text("Leave Chat?") },
            text = { Text("You will stop receiving new messages in this chat.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        component.leaveChat()
                        showLeaveChatDialog = false
                    }
                ) { Text("Leave") }
            },
            dismissButton = {
                TextButton(onClick = { showLeaveChatDialog = false }) { Text("Cancel") }
            }
        )
    }

}

private fun String?.asMeaningfulText(): String? =
    this
        ?.trim()
        ?.takeIf { value -> value.isNotEmpty() && !value.equals("null", ignoreCase = true) }

@Composable
fun MessageCard(
    message: MessageMVP,
    user: UserData?,
    isCurrentUser: Boolean = false,
    isTimestampExpanded: Boolean,
    onToggleTimestamp: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isCurrentUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.75f)
                .clickable(onClick = onToggleTimestamp),
            horizontalAlignment = if (isCurrentUser) Alignment.End else Alignment.Start
        ) {
            Text(
                user?.fullName ?: "Unknown User",
                style = MaterialTheme.typography.labelSmall
            )

            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (isCurrentUser) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    }
                )
            ) {
                Text(
                    text = message.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isCurrentUser) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.padding(12.dp)
                )
            }

            AnimatedVisibility(
                visible = isTimestampExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Text(
                    text = message.sentTime.toTimestampLabel(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private fun messageKey(message: MessageMVP, index: Int): String =
    message.id.ifBlank { "message-$index-${message.sentTime}" }

@Composable
private fun ManagePeopleDialog(
    users: List<UserData>,
    currentUserId: String,
    canEdit: Boolean,
    friends: List<UserData>,
    suggestions: List<UserData>,
    onSearch: (String) -> Unit,
    onAddUser: (UserData) -> Unit,
    onRemoveUser: (UserData) -> Unit,
    onDismiss: () -> Unit,
) {
    var showSearchDialog by remember { mutableStateOf(false) }
    val selectedUserIds = users.map { it.id }.toSet()

    Dialog(onDismissRequest = onDismiss) {
        Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = if (canEdit) "Manage People" else "People",
                    style = MaterialTheme.typography.titleLarge
                )
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(users, key = { _, user -> user.id }) { _, user ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            PlayerCard(
                                player = user,
                                modifier = Modifier.weight(1f)
                            )
                            if (canEdit && user.id != currentUserId) {
                                Button(
                                    onClick = { onRemoveUser(user) }
                                ) {
                                    Text("Remove")
                                }
                            }
                        }
                    }
                    if (canEdit) {
                        item {
                            InvitePlayerCard {
                                showSearchDialog = true
                            }
                        }
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text("Done")
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
            onSearch = onSearch,
            onPlayerSelected = { user ->
                onAddUser(user)
                showSearchDialog = false
            },
            onDismiss = { showSearchDialog = false },
            suggestions = suggestions.filter { user ->
                user.id != currentUserId && !selectedUserIds.contains(user.id)
            },
            eventName = "",
            entryLabel = "Person"
        )
    }
}

private fun Instant.toTimestampLabel(timeZone: TimeZone = TimeZone.currentSystemDefault()): String {
    val localDateTime = toLocalDateTime(timeZone)
    val day = localDateTime.date.day
    val dayOfWeek = localDateTime.date.dayOfWeek.toDisplayLabel()
    val month = localDateTime.date.month.toShortLabel()
    val time = timeFormat.format(localDateTime.time)
    return "$dayOfWeek, $month $day • $time"
}

private fun DayOfWeek.toDisplayLabel(): String = when (this) {
    DayOfWeek.MONDAY -> "Monday"
    DayOfWeek.TUESDAY -> "Tuesday"
    DayOfWeek.WEDNESDAY -> "Wednesday"
    DayOfWeek.THURSDAY -> "Thursday"
    DayOfWeek.FRIDAY -> "Friday"
    DayOfWeek.SATURDAY -> "Saturday"
    DayOfWeek.SUNDAY -> "Sunday"
}

private fun Month.toShortLabel(): String = when (this) {
    Month.JANUARY -> "Jan"
    Month.FEBRUARY -> "Feb"
    Month.MARCH -> "Mar"
    Month.APRIL -> "Apr"
    Month.MAY -> "May"
    Month.JUNE -> "Jun"
    Month.JULY -> "Jul"
    Month.AUGUST -> "Aug"
    Month.SEPTEMBER -> "Sep"
    Month.OCTOBER -> "Oct"
    Month.NOVEMBER -> "Nov"
    Month.DECEMBER -> "Dec"
}
