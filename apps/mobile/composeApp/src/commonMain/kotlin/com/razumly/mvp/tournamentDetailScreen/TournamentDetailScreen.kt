package com.razumly.mvp.tournamentDetailScreen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.tournamentDetailScreen.tournamentDetailComponents.TournamentBracketView
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

val LocalTournamentComponent =
    compositionLocalOf<TournamentContentComponent> { error("No tournament provided") }

@Composable
fun TournamentDetailScreen(
    component: TournamentContentComponent
) {
    val tournament by component.selectedTournament.collectAsState()
    val selectedDivision by component.selectedDivision.collectAsState()
    val losersBracket by component.losersBracket.collectAsState()
    val scrollState = rememberScrollState()
    val nestedScrollConnection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                return if (available.y < 0) { // Scrolling up
                    Offset(0f, scrollState.dispatchRawDelta(-available.y))
                } else {
                    Offset.Zero
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Box(
            modifier = Modifier
                .verticalScroll(scrollState)
                .fillMaxWidth()
        ) {
            tournament?.let { TournamentHeader(it) }
        }
        tournament?.divisions?.indexOf(selectedDivision)?.let {
            ScrollableTabRow(
                selectedTabIndex = it.coerceAtLeast(0),
                modifier = Modifier.fillMaxWidth(),
                edgePadding = 0.dp
            ) {
                tournament!!.divisions.forEach { division ->
                    Tab(
                        selected = division == selectedDivision,
                        onClick = { component.selectDivision(division) },
                        text = { Text(division) }
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                modifier = Modifier.padding(end = 16.dp),
                text = selectedDivision ?: "Select Division",
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
                })
        }

        CompositionLocalProvider(LocalTournamentComponent provides component) {
            TournamentBracketView(
                losersBracket,
                nestedScrollConnection
            ) { match ->
                component.matchSelected(match)
            }
        }
    }
}

@Composable
fun TournamentHeader(tournament: Tournament) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Text(
            text = tournament.name,
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = tournament.description,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(vertical = 8.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = "Location",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    text = tournament.location,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Column {
                Text(
                    text = "Date",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    text = "${tournament.start.toLocalDateTime(TimeZone.UTC)} - ${
                        tournament.end.toLocalDateTime(
                            TimeZone.UTC
                        )
                    }",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}
