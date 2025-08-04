@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.matchCard
import com.razumly.mvp.core.presentation.matchCardBottom
import com.razumly.mvp.core.presentation.matchCardTop
import com.razumly.mvp.core.presentation.util.timeFormat
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime

@Composable
fun MatchCard(
    match: MatchWithRelations?, onClick: () -> Unit, modifier: Modifier = Modifier
) {
    val component = LocalTournamentComponent.current
    val teams by component.divisionTeams.collectAsState()
    val matches by component.divisionMatches.collectAsState()
    val fields by component.divisionFields.collectAsState()
    val matchCardColor = if (match != null && match.match.losersBracket) {
        MaterialTheme.colorScheme.tertiaryContainer
    } else {
        matchCard
    }
    Box(
        modifier = modifier
    ) {
        match?.let {
            FloatingBox(
                modifier = Modifier.align(Alignment.TopCenter).offset(y = (-20).dp).zIndex(1f),
                color = matchCardTop
            ) {
                Text(
                    text = timeFormat.format(
                        match.match.start.toLocalDateTime(TimeZone.currentSystemDefault()).time
                    ),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.labelLarge
                )
            }
            Card(
                modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
                elevation = CardDefaults.cardElevation(4.dp),
                colors = CardDefaults.cardColors(
                    containerColor = matchCardColor,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MatchInfoSection(match, fields)
                    VerticalDivider()
                    TeamsSection(
                        team1 = teams[match.match.team1],
                        team2 = teams[match.match.team2],
                        match = match,
                        matches = matches,
                    )
                }
            }
            FloatingBox(
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = 20.dp),
                color = matchCardBottom
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        "Ref: ", style = MaterialTheme.typography.labelLarge
                    )
                    teams[match.match.refId]?.players?.forEach { player ->
                        Text(
                            "${player.firstName}.${player.lastName.first()}",
                            modifier = Modifier.padding(start = 4.dp),
                            style = MaterialTheme.typography.labelLarge,
                            overflow = TextOverflow.Ellipsis,
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FloatingBox(modifier: Modifier, color: Color, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = color,
        shadowElevation = 5.dp
    ) {
        content()
    }
}

@Composable
private fun MatchInfoSection(match: MatchWithRelations, fields: List<FieldWithMatches>) {
    Column(
        modifier = Modifier.padding(8.dp).width(IntrinsicSize.Max),
        verticalArrangement = Arrangement.SpaceEvenly
    ) {
        Text("M: ${match.match.matchNumber}")
        HorizontalDivider()
        Text("F: ${fields.find { it.field.id == match.match.field }?.field?.fieldNumber}")
    }
}

@Composable
private fun TeamsSection(
    team1: TeamWithPlayers?,
    team2: TeamWithPlayers?,
    match: MatchWithRelations,
    matches: Map<String, MatchWithRelations>,
) {
    Column(
        modifier = Modifier.padding(8.dp).fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val leftMatch = matches[match.previousLeftMatch?.id]
        val rightMatch = matches[match.previousRightMatch?.id]
        TeamRow(team1, match.match.team1Points, leftMatch, match.match.losersBracket)
        HorizontalDivider(thickness = 1.dp)
        TeamRow(team2, match.match.team2Points, rightMatch, match.match.losersBracket)
    }
}

@Composable
private fun TeamRow(
    team: TeamWithPlayers?,
    points: List<Int>,
    previousMatch: MatchWithRelations?,
    isLosersBracket: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
    ) {
        team?.let { currentTeam ->
            if (!currentTeam.team.name.isNullOrBlank()) {
                Text(
                    currentTeam.team.name.toString(),
                    Modifier.weight(1f),
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1
                )
            } else {
                currentTeam.players.forEach { player ->
                    Text(
                        "${player.firstName}.${player.lastName.first()}",
                        Modifier.weight(1f),
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 1
                    )
                }
            }
            Text(" ${points.joinToString(separator = ", ")}")
        } ?: run {
            previousMatch?.match?.matchNumber?.let { matchNumber ->
                val prefix =
                    if (isLosersBracket && !previousMatch.match.losersBracket) "Loser" else "Winner"
                Text("$prefix of match #$matchNumber", Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun EditableMatchCard(
    match: MatchWithRelations?,
    onUpdateMatch: ((MatchMVP) -> MatchMVP) -> Unit,
    onSelectTeam1: () -> Unit,
    onSelectTeam2: () -> Unit,
    onSelectRef: () -> Unit,
    modifier: Modifier = Modifier
) {
    val component = LocalTournamentComponent.current
    val teams by component.divisionTeams.collectAsState()
    val fields by component.divisionFields.collectAsState()

    if (match == null) return

    Card(
        modifier = modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer
        )
    ) {
        Column(
            modifier = Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Match number and time
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "M${match.match.matchNumber}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = timeFormat.format(
                        match.match.start.toLocalDateTime(TimeZone.currentSystemDefault()).time
                    ), style = MaterialTheme.typography.labelSmall
                )
            }

            HorizontalDivider(thickness = 0.5.dp)

            // Team 1 - Clickable for selection
            TeamEditRow(
                label = "T1:",
                team = teams[match.match.team1],
                points = match.match.team1Points,
                onClick = onSelectTeam1,
                onPointsChange = { newPoints ->
                    onUpdateMatch { it.copy(team1Points = newPoints) }
                })

            // Team 2 - Clickable for selection
            TeamEditRow(
                label = "T2:",
                team = teams[match.match.team2],
                points = match.match.team2Points,
                onClick = onSelectTeam2,
                onPointsChange = { newPoints ->
                    onUpdateMatch { it.copy(team2Points = newPoints) }
                })

            HorizontalDivider(thickness = 0.5.dp)

            // Referee - Clickable for selection
            Row(
                modifier = Modifier.fillMaxWidth().clickable { onSelectRef() },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Ref:",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = teams[match.match.refId]?.team?.name ?: "Select",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (match.match.refId == null) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurface,
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
fun TeamEditRow(
    label: String,
    team: TeamWithPlayers?,
    points: List<Int>,
    onClick: () -> Unit,
    onPointsChange: (List<Int>) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Team name (clickable)
        Row(
            modifier = Modifier.weight(1f).clickable { onClick() },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = team?.team?.name ?: "Select",
                style = MaterialTheme.typography.labelSmall,
                color = if (team == null) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
                modifier = Modifier.weight(1f)
            )
        }

        // Score input (compact)
        var scoreText by remember(points) { mutableStateOf(points.joinToString(",")) }

        OutlinedTextField(
            value = scoreText,
            onValueChange = { newScore ->
                scoreText = newScore
                val scores = newScore.split(",").mapNotNull { it.trim().toIntOrNull() }
                onPointsChange(scores)
            },
            modifier = Modifier.width(60.dp),
            textStyle = MaterialTheme.typography.labelSmall,
            singleLine = true,
            placeholder = { Text("0,0", style = MaterialTheme.typography.labelSmall) })
    }
}
