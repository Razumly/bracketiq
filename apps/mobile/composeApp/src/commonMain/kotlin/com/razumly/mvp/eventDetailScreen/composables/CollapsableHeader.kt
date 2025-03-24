package com.razumly.mvp.eventDetailScreen.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.TournamentWithPlayers
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.TournamentBracket
import com.razumly.mvp.eventDetailScreen.EventContentComponent

@Composable
fun CollapsableHeader(
    component: EventContentComponent
) {
    val selectedDivision by component.selectedDivision.collectAsState()
    val tournament by component.selectedEvent.collectAsState()
    val losersBracket by component.losersBracket.collectAsState()
    val isBracketView by component.isBracketView.collectAsState()
    val selectedEvent by component.selectedEvent.collectAsState()
    val singleDivision = selectedEvent?.event?.singleDivision

    Column {
        if (singleDivision == false) {
            tournament?.event?.divisions?.indexOf(selectedDivision)?.let {
                ScrollableTabRow(
                    selectedTabIndex = it.coerceAtLeast(0),
                    modifier = Modifier
                        .fillMaxWidth(),
                    edgePadding = 0.dp
                ) {
                    tournament!!.event.divisions.forEach { division ->
                        Tab(
                            selected = division == selectedDivision,
                            onClick = { component.selectDivision(division) },
                            text = { Text(division.name) }
                        )
                    }
                }
            }
        }

        if (selectedEvent is TournamentWithPlayers) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    modifier = Modifier.padding(end = 16.dp),
                    text = if (isBracketView) "Bracket" else "Teams",
                    style = MaterialTheme.typography.titleMedium
                )
                Switch(
                    checked = isBracketView,
                    onCheckedChange = { component.toggleBracketView() },
                    thumbContent = {
                        Icon(
                            imageVector = if (isBracketView)
                                MVPIcons.TournamentBracket
                            else
                                Icons.Default.Menu,
                            contentDescription = null,
                            modifier = Modifier.size(SwitchDefaults.IconSize)
                        )
                    }
                )
                Text(
                    modifier = Modifier.padding(end = 16.dp),
                    text = if (losersBracket) "Losers Bracket" else "Winners Bracket",
                    style = MaterialTheme.typography.titleMedium
                )
                Switch(
                    checked = losersBracket,
                    onCheckedChange = { component.toggleLosersBracket() },
                    thumbContent = {
                        Icon(
                            imageVector = if (losersBracket)
                                Icons.Default.Delete
                            else
                                Icons.Default.Star,
                            contentDescription = null,
                            modifier = Modifier.size(SwitchDefaults.IconSize)
                        )
                    }
                )
            }
        }
    }
}