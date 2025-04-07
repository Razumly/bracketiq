package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.util.toTitleCase

@Composable
fun PlayerCard(player: UserData, isPending: Boolean = false, modifier: Modifier = Modifier) {
    Card(modifier.padding(vertical = 4.dp, horizontal = 8.dp)) {
        if (isPending) {
            Text(
                text = "Invite Sent",
                modifier = Modifier.padding(8.dp),
                style = MaterialTheme.typography.labelSmall
            )
        }
        Text(
            text = "${player.firstName} ${player.lastName}".toTitleCase(),
            modifier = Modifier.padding(8.dp),
            overflow = TextOverflow.Ellipsis,
            maxLines = 1,
            style = MaterialTheme.typography.bodyLarge
        )
    }
}