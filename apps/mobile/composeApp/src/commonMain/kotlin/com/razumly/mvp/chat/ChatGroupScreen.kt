package com.razumly.mvp.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.home.LocalNavBarPadding
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatGroupScreen(component: ChatGroupComponent) {
    val input by component.messageInput.collectAsState()
    val chatGroupWithRelations by component.chatGroup.collectAsState()
    val currentUserId = component.currentUser.id
    val chatGroup = chatGroupWithRelations.chatGroup
    val messages = chatGroupWithRelations.messages
    val users = chatGroupWithRelations.users

    Scaffold(topBar = { TopAppBar(title = { Text(chatGroup.name) }) }) { values ->
        Box(
            Modifier.fillMaxSize().padding(top = values.calculateTopPadding()).padding(16.dp)
                .padding(LocalNavBarPadding.current)
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize()
            ) {
                items(messages) { message ->
                    val isCurrentUser = message.userId == currentUserId
                    MessageCard(
                        message = message,
                        user = users.find { it.id == message.userId },
                        isCurrentUser = isCurrentUser
                    )
                }
            }

            Row(Modifier.fillMaxWidth().align(Alignment.BottomCenter), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = input,
                    onValueChange = component::onMessageInputChange,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Type a message...") })
                Spacer(Modifier.width(8.dp))
                Button(onClick = component::sendMessage) {
                    Text("Send")
                }
            }
        }
    }
}

@Composable
fun MessageCard(message: MessageMVP, user: UserData?, isCurrentUser: Boolean = false) {

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isCurrentUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(0.75f),
            horizontalAlignment = if (isCurrentUser) Alignment.End else Alignment.Start
        ) {
            Text(
                user?.fullName ?: "Unknown User", style = MaterialTheme.typography.labelSmall
            )
            Card {
                Text(
                    text = message.body, style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(8.dp),
                )
            }
            Text(
                "Sent at: " + message.sentTime.toLocalDateTime(TimeZone.currentSystemDefault())
                    .format(dateTimeFormat), style = MaterialTheme.typography.labelSmall
            )
        }
    }
}
