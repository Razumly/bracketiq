package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData

@Composable
fun TeamDetailsDialog(
    team: TeamWithPlayers,
    currentUser: UserData,
    onDismiss: () -> Unit,
    onPlayerMessage: (UserData) -> Unit,
    onPlayerAction: (UserData, PlayerAction) -> Unit = { _, _ -> }
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp)
            ) {
                // Team Header
                Text(
                    text = team.team.name ?: "Team ${
                        team.players.joinToString(" & ") {
                            "${it.firstName} ${it.lastName.first()}."
                        }
                    }",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = "${team.players.size}/${team.team.teamSize} Players",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Players List
                Text(
                    text = "Team Members",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )

                Spacer(modifier = Modifier.height(8.dp))

                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(team.players) { player ->
                        PlayerCardWithActions(
                            player = player,
                            currentUser = currentUser,
                            onMessage = { user -> onPlayerMessage(user) },
                            onSendFriendRequest = { user ->
                                onPlayerAction(
                                    user,
                                    PlayerAction.FRIEND_REQUEST
                                )
                            },
                            onFollow = { user -> onPlayerAction(user, PlayerAction.FOLLOW) },
                            onUnfollow = { user -> onPlayerAction(user, PlayerAction.UNFOLLOW) },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    // Show pending players if any
                    if (team.pendingPlayers.isNotEmpty()) {
                        item {
                            Text(
                                text = "Pending Invitations",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }

                        items(team.pendingPlayers) { player ->
                            PlayerCard(
                                player = player,
                                isPending = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Actions
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(
                        onClick = onDismiss
                    ) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

enum class PlayerAction {
    FRIEND_REQUEST,
    FOLLOW,
    UNFOLLOW
}
