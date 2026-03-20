@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.chat.composables.ChatHeader
import com.razumly.mvp.chat.composables.ChatMessageBubble
import com.razumly.mvp.chat.composables.shouldAutoScrollToLatest
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.InvitePlayerCard
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.composables.PlatformTextFieldStyle
import com.razumly.mvp.core.presentation.composables.PlayerCard
import com.razumly.mvp.core.presentation.composables.SearchPlayerDialog
import com.razumly.mvp.core.presentation.util.timeFormat
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.coroutines.launch
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.math.max
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private const val CHAT_MOTION_DURATION_MS = 220
private const val CHAT_NEAR_BOTTOM_THRESHOLD = 1

@OptIn(ExperimentalMaterial3Api::class, ExperimentalHazeMaterialsApi::class)
@Composable
fun ChatGroupScreen(component: ChatGroupComponent) {
    val input by component.messageInput.collectAsState()
    val chatGroupWithRelations by component.chatGroup.collectAsState()
    val friends by component.friends.collectAsState()
    val suggestedPlayers by component.suggestedPlayers.collectAsState()
    val isChatMuted by component.isChatMuted.collectAsState()
    val currentUserId = component.currentUser.id
    val chatGroup = chatGroupWithRelations?.chatGroup ?: ChatGroup.empty()
    val messages = chatGroupWithRelations?.messages ?: emptyList()
    val users = chatGroupWithRelations?.users ?: emptyList()
    val isHost = chatGroup.hostId == currentUserId
    val participantNames = users
        .mapNotNull { user -> user.fullName.asMeaningfulText() ?: user.userName.asMeaningfulText() }
        .distinct()
        .joinToString(", ")
        .asMeaningfulText()
    val chatTitle = chatGroup.name.asMeaningfulText()
        ?: chatGroup.displayName.asMeaningfulText()
        ?: participantNames
        ?: "Chat"
    val chatSubtitle = when {
        users.size > 2 -> "${users.size} members"
        participantNames != null && participantNames != chatTitle -> participantNames
        else -> null
    }
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val hazeState = rememberHazeState()
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
    var showJumpToLatest by remember { mutableStateOf(false) }
    var previousMessageCount by remember { mutableIntStateOf(0) }
    var lastProcessedMessageKey by remember { mutableStateOf<String?>(null) }
    var headerHeightPx by remember { mutableIntStateOf(0) }
    var composerHeightPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current

    val headerHeight = with(density) { headerHeightPx.toDp() }
    val composerHeight = with(density) { composerHeightPx.toDp() }
    val isNearBottom by remember(messages.size, listState) {
        derivedStateOf {
            isNearBottom(
                lastVisibleItemIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1,
                lastMessageIndex = messages.lastIndex,
                threshold = CHAT_NEAR_BOTTOM_THRESHOLD,
            )
        }
    }

    LaunchedEffect(isNearBottom) {
        if (isNearBottom) {
            showJumpToLatest = false
        }
    }

    LaunchedEffect(latestMessageKey, messages.size, isNearBottom) {
        if (messages.isEmpty() || latestMessageKey.isBlank()) {
            previousMessageCount = 0
            lastProcessedMessageKey = null
            showJumpToLatest = false
            return@LaunchedEffect
        }

        if (latestMessageKey == lastProcessedMessageKey) {
            previousMessageCount = messages.size
            return@LaunchedEffect
        }

        val latestMessageUserId = messages.lastOrNull()?.userId
        val shouldScroll = shouldAutoScrollToLatest(
            isNearBottom = isNearBottom,
            latestMessageUserId = latestMessageUserId,
            currentUserId = currentUserId,
            previousMessageCount = previousMessageCount,
        )

        if (shouldScroll) {
            listState.animateScrollToItem(messages.lastIndex)
            showJumpToLatest = false
        } else {
            showJumpToLatest = true
        }

        lastProcessedMessageKey = latestMessageKey
        previousMessageCount = messages.size
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .hazeSource(hazeState)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(
                top = headerHeight + 16.dp,
                bottom = composerHeight + 16.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(
                items = messages,
                key = { index, message -> messageKey(message, index) },
            ) { index, message ->
                val isCurrentUser = message.userId == currentUserId
                val messageId = messageKey(message, index)
                val senderName = users
                    .firstOrNull { it.id == message.userId }
                    ?.fullName
                    ?.asMeaningfulText()
                    ?: users
                        .firstOrNull { it.id == message.userId }
                        ?.userName
                        ?.asMeaningfulText()
                    ?: "Unknown User"

                ChatMessageBubble(
                    message = message,
                    isCurrentUser = isCurrentUser,
                    senderName = senderName,
                    timestampText = message.sentTime.toTimestampLabel(),
                    isTimestampExpanded = messageId in expandedMessageIds,
                    onToggleTimestamp = {
                        expandedMessageIds = if (messageId in expandedMessageIds) {
                            expandedMessageIds - messageId
                        } else {
                            expandedMessageIds + messageId
                        }
                    },
                )
            }
        }

        ChatHeader(
            title = chatTitle,
            subtitle = chatSubtitle,
            hazeState = hazeState,
            onBack = component::onBack,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth(),
            trailingContent = {
                IconButton(onClick = { showOptionsMenu = true }) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "Chat options",
                    )
                }
                DropdownMenu(
                    expanded = showOptionsMenu,
                    onDismissRequest = { showOptionsMenu = false },
                ) {
                    DropdownMenuItem(
                        text = { Text("Manage People") },
                        onClick = {
                            showManagePeopleDialog = true
                            showOptionsMenu = false
                        },
                    )
                    if (isHost) {
                        DropdownMenuItem(
                            text = { Text("Delete Chat") },
                            onClick = {
                                showDeleteChatDialog = true
                                showOptionsMenu = false
                            },
                        )
                    } else {
                        DropdownMenuItem(
                            text = { Text("Leave Chat") },
                            onClick = {
                                showLeaveChatDialog = true
                                showOptionsMenu = false
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text(if (isChatMuted) "Unmute" else "Mute") },
                        onClick = {
                            component.toggleChatMute()
                            showOptionsMenu = false
                        },
                    )
                }
            },
            onHeightMeasured = { headerHeightPx = it },
        )

        AnimatedVisibility(
            visible = showJumpToLatest,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .imePadding()
                .navigationBarsPadding()
                .padding(bottom = composerHeight + 12.dp),
            enter = slideInVertically(
                initialOffsetY = { it / 2 },
                animationSpec = tween(CHAT_MOTION_DURATION_MS),
            ) + fadeIn(animationSpec = tween(CHAT_MOTION_DURATION_MS)),
            exit = slideOutVertically(
                targetOffsetY = { it / 2 },
                animationSpec = tween(CHAT_MOTION_DURATION_MS),
            ) + fadeOut(animationSpec = tween(CHAT_MOTION_DURATION_MS)),
        ) {
            FilledIconButton(
                onClick = {
                    coroutineScope.launch {
                        listState.animateScrollToItem(max(messages.lastIndex, 0))
                    }
                },
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.KeyboardArrowDown,
                    contentDescription = "Jump to latest",
                )
            }
        }

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding(),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .hazeEffect(
                        state = hazeState,
                        style = HazeMaterials.ultraThin(MaterialTheme.colorScheme.surface),
                    )
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.78f))
                    .onSizeChanged { composerHeightPx = it.height }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PlatformTextField(
                    value = input,
                    onValueChange = component::onMessageInputChange,
                    modifier = Modifier.weight(1f),
                    placeholder = "Type a message...",
                    height = 44.dp,
                    imeAction = androidx.compose.ui.text.input.ImeAction.Send,
                    style = PlatformTextFieldStyle.GlassPill,
                    onImeAction = component::sendMessage,
                )

                Button(
                    onClick = component::sendMessage,
                    enabled = input.isNotBlank(),
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.10f),
                        contentColor = MaterialTheme.colorScheme.onSurface,
                        disabledContainerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.06f),
                        disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
                    ),
                ) {
                    Text("Send")
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
            onDismiss = { showManagePeopleDialog = false },
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
                    },
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteChatDialog = false }) { Text("Cancel") }
            },
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
                    },
                ) { Text("Leave") }
            },
            dismissButton = {
                TextButton(onClick = { showLeaveChatDialog = false }) { Text("Cancel") }
            },
        )
    }
}

private fun String?.asMeaningfulText(): String? =
    this
        ?.trim()
        ?.takeIf { value -> value.isNotEmpty() && !value.equals("null", ignoreCase = true) }

private fun messageKey(message: MessageMVP, index: Int): String =
    message.id.ifBlank { "message-$index-${message.sentTime}" }

private fun isNearBottom(
    lastVisibleItemIndex: Int,
    lastMessageIndex: Int,
    threshold: Int,
): Boolean {
    if (lastMessageIndex < 0) return true
    return lastVisibleItemIndex >= max(lastMessageIndex - threshold, 0)
}

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
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    text = if (canEdit) "Manage People" else "People",
                    style = MaterialTheme.typography.titleLarge,
                )
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(users, key = { _, user -> user.id }) { _, user ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            PlayerCard(
                                player = user,
                                modifier = Modifier.weight(1f),
                            )
                            if (canEdit && user.id != currentUserId) {
                                Button(
                                    onClick = { onRemoveUser(user) },
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
            entryLabel = "Person",
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
