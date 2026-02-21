package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.razumly.mvp.core.data.dataTypes.UserData

@Composable
fun PlayerCardWithActions(
    player: UserData,
    currentUser: UserData,
    modifier: Modifier = Modifier,
    onMessage: (UserData) -> Unit,
    onSendFriendRequest: (UserData) -> Unit,
    onFollow: (UserData) -> Unit,
    onUnfollow: (UserData) -> Unit,
    onInviteToTeam: ((UserData) -> Unit)? = null,
) {
    var showPopup by remember { mutableStateOf(false) }
    val isFollowing = currentUser.followingIds.contains(player.id)
    val isFriend = currentUser.friendIds.contains(player.id)
    val hasSentFriendRequest = currentUser.friendRequestSentIds.contains(player.id)
    val isCurrentUser = currentUser.id == player.id

    Box {
        PlayerCard(
            player = player,
            modifier = modifier.clickable(enabled = !isCurrentUser) {
                showPopup = true
            }
        )

        if (showPopup && !isCurrentUser) {
            Popup(
                alignment = Alignment.Center,
                properties = PopupProperties(
                    dismissOnBackPress = true,
                    dismissOnClickOutside = true
                ),
                onDismissRequest = { showPopup = false }
            ) {
                PlayerActionPopup(
                    player = player,
                    isFollowing = isFollowing,
                    isFriend = isFriend,
                    hasSentFriendRequest = hasSentFriendRequest,
                    onMessage = {
                        onMessage(player)
                        showPopup = false
                    },
                    onSendFriendRequest = {
                        onSendFriendRequest(player)
                        showPopup = false
                    },
                    onFollow = {
                        if (isFollowing) {
                            onUnfollow(player)
                        } else {
                            onFollow(player)
                        }
                        showPopup = false
                    },
                    onInviteToTeam = onInviteToTeam?.let { invite ->
                        {
                            invite(player)
                            showPopup = false
                        }
                    },
                    onDismiss = { showPopup = false }
                )
            }
        }
    }
}

@Composable
private fun PlayerActionPopup(
    player: UserData,
    isFollowing: Boolean,
    isFriend: Boolean,
    hasSentFriendRequest: Boolean,
    onMessage: () -> Unit,
    onSendFriendRequest: () -> Unit,
    onFollow: () -> Unit,
    onInviteToTeam: (() -> Unit)? = null,
    onDismiss: () -> Unit
) {
    Card(
        modifier = Modifier
            .padding(16.dp)
            .width(200.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = player.fullName,
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = "@${player.userName.ifBlank { "user" }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            HorizontalDivider()

            OutlinedButton(
                onClick = onMessage,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.AutoMirrored.Filled.Message, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Message")
            }

            onInviteToTeam?.let { inviteAction ->
                OutlinedButton(
                    onClick = inviteAction,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.PersonAdd, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Invite to Team")
                }
            }

            if (!isFriend) {
                OutlinedButton(
                    onClick = onSendFriendRequest,
                    enabled = !hasSentFriendRequest,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.PersonAdd, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        if (hasSentFriendRequest) "Request Sent" else "Add Friend"
                    )
                }
            }

            OutlinedButton(
                onClick = onFollow,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    if (isFollowing) Icons.Default.PersonRemove else Icons.Default.Person,
                    contentDescription = null
                )
                Spacer(Modifier.width(8.dp))
                Text(if (isFollowing) "Unfollow" else "Follow")
            }
        }
    }
}
