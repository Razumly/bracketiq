package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.PlatformTextField

@Composable
fun SendNotificationDialog(
    onSend: () -> Unit, onDismiss: () -> Unit
) {
    val maxMessageLength = 500
    var title by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    val isMessageValid = message.length <= maxMessageLength
    val remainingChars = maxMessageLength - message.length

    AlertDialog(onDismissRequest = onDismiss, title = {
        Text("Send Notification")
    }, text = {
        Column(
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Send a notification to all event participants:",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            PlatformTextField(
                value = title,
                onValueChange = {
                    title = it
                },
                label = "Title",
                placeholder = "Notification title...",
                modifier = Modifier.fillMaxWidth()
            )

            Column {
                PlatformTextField(
                    value = message,
                    onValueChange = { newValue ->
                        if (newValue.length <= maxMessageLength) {
                            message = newValue
                        }
                    },
                    label = "Message",
                    placeholder = "Your message to participants...",
                    modifier = Modifier.fillMaxWidth(),
                    isError = !isMessageValid,
                    supportingText = if (!isMessageValid) {
                        "Message is too long"
                    } else {
                        ""
                    }
                )

                // Character count display
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.End
                ) {
                    Text(
                        text = "${message.length}/$maxMessageLength",
                        style = MaterialTheme.typography.bodySmall,
                        color = when {
                            remainingChars < 0 -> MaterialTheme.colorScheme.error
                            remainingChars < 50 -> MaterialTheme.colorScheme.onSurfaceVariant
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        fontWeight = if (remainingChars < 50) FontWeight.Bold else FontWeight.Normal
                    )
                }
            }
        }
    }, confirmButton = {
        Button(
            onClick = onSend,
            enabled = title.isNotBlank() && message.isNotBlank() && isMessageValid
        ) {
            Text("Send Notification")
        }
    }, dismissButton = {
        Button(onClick = onDismiss) {
            Text("Cancel")
        }
    })
}
