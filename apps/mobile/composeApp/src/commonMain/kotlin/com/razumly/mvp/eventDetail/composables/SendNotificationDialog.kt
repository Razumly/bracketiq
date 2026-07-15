package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.network.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun SendNotificationDialog(
    onSend: suspend (title: String, message: String) -> Result<Unit>,
    onSent: () -> Unit,
    onDismiss: () -> Unit,
) {
    val maxMessageLength = 500
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var sendError by remember { mutableStateOf<String?>(null) }
    val isMessageValid = message.length <= maxMessageLength
    val remainingChars = maxMessageLength - message.length

    AlertDialog(onDismissRequest = { if (!isSending) onDismiss() }, title = {
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

            StandardTextField(
                value = title,
                onValueChange = {
                    title = it
                },
                label = "Title",
                placeholder = "Notification title...",
                modifier = Modifier.fillMaxWidth()
            )

            Column {
                StandardTextField(
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

            if (isSending) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CircularProgressIndicator(modifier = Modifier.padding(top = 2.dp))
                    Text("Sending notification...", style = MaterialTheme.typography.bodySmall)
                }
            }

            sendError?.let { error ->
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }, confirmButton = {
        Button(
            onClick = {
                if (!isSending) {
                    isSending = true
                    sendError = null
                    scope.launch {
                        val result = try {
                            onSend(title.trim(), message.trim())
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Throwable) {
                            Result.failure(error)
                        }
                        isSending = false
                        result.fold(
                            onSuccess = { onSent() },
                            onFailure = { error ->
                                sendError = error.userMessage("Unable to send the notification. Please try again.")
                            },
                        )
                    }
                }
            },
            enabled = !isSending && title.isNotBlank() && message.isNotBlank() && isMessageValid,
        ) {
            Text(if (isSending) "Sending..." else "Send Notification")
        }
    }, dismissButton = {
        Button(onClick = onDismiss, enabled = !isSending) {
            Text("Cancel")
        }
    })
}
