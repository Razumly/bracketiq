package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.util.toTitleCase

@Composable
fun TeamCard(team: TeamWithPlayers, modifier: Modifier = Modifier) {
    Card(modifier.padding(vertical = 4.dp, horizontal = 8.dp)) {
        Row(modifier = Modifier.padding(8.dp)) {
            if (!team.team.name.isNullOrBlank()) {
                Text(
                    team.team.name.toString(),
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1,
                    style = MaterialTheme.typography.bodyLarge
                )
            } else {
                team.players.forEachIndexed { index, player ->
                    Text(
                        "${player.firstName}.${player.lastName.first()}".toTitleCase(),
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 1,
                        style = MaterialTheme.typography.bodyLarge
                    )
                    if (index != team.players.size-1) {
                        Text("-", style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
    }
}