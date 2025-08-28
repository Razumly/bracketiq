package com.razumly.mvp.chat.composables

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MessageMVP

@Composable
fun ChatListItem(modifier: Modifier = Modifier, chatName: String, lastMessage: MessageMVP?) {
    Row(modifier) {
        Card(Modifier.fillMaxWidth().padding(8.dp)) {
            Text(chatName,
                modifier = Modifier.padding(8.dp),
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
                style = MaterialTheme.typography.titleLarge)
        }
    }
}