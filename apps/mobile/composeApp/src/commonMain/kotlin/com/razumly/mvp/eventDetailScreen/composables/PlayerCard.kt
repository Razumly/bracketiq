package com.razumly.mvp.eventDetailScreen.composables

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.UserData

@Composable
fun PlayerCard(player: UserData, modifier: Modifier = Modifier) {
    Card(modifier.padding(vertical = 4.dp, horizontal = 8.dp)) {
        Text(
            "${player.firstName} ${player.lastName}",
            overflow = TextOverflow.Ellipsis,
            maxLines = 1,
            style = MaterialTheme.typography.bodyLarge
        )
    }
}