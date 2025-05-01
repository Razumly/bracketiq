package com.razumly.mvp.chat.Composables

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.ChatGroup

@Composable
fun ChatListItem(modifier: Modifier = Modifier, chatGroup: ChatGroup) {
    Row(modifier) {
        Card(Modifier.fillMaxWidth()) {
            Text(chatGroup.name)
        }
    }
}