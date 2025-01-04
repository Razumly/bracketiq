package com.razumly.mvp.eventContent.presentation.tournamentDetailScreen.tournamentDetailComponents

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardColors
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.composables.HorizontalDivider
import com.razumly.mvp.core.presentation.composables.VerticalDivider
import androidx.compose.runtime.getValue
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.eventContent.presentation.MatchContentComponent
import com.razumly.mvp.eventContent.presentation.TournamentContentComponent


@Composable
fun MatchCard(
    component: TournamentContentComponent,
    match: MatchWithRelations,
    onMatchSelected: (MatchMVP) -> Unit,
    modifier: Modifier = Modifier,
    cardColors: CardColors = CardDefaults.cardColors(),
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() }
) {
    val textModifier = Modifier.width(70.dp)
    val team1 = component.currentTeams.value[match.match.team1]
    val team2 = component.currentTeams.value[match.match.team2]
    val teamTextStyle = MaterialTheme.typography.bodyMedium.copy(
        textAlign = TextAlign.Start,
        lineHeight = 20.sp,
        fontSize = 14.sp
    )

    val hapticFeedback = LocalHapticFeedback.current
    val isPressed by interactionSource.collectIsPressedAsState()

    Card(
        onClick = {
            hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onMatchSelected(match.match)
        },
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 80.dp),
        colors = cardColors,
        elevation = CardDefaults.elevatedCardElevation(
            defaultElevation = 2.dp,
            pressedElevation = 4.dp,
            focusedElevation = 4.dp,
            hoveredElevation = 3.dp
        ),
        interactionSource = interactionSource,
        shape = MaterialTheme.shapes.medium
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            MatchInfoSection(
                matchNumber = match.match.matchNumber,
                fieldNumber = match.field?.fieldNumber
            )

            MatchTeamsSection(
                match = match,
                team1 = team1,
                team2 = team2,
                teamTextStyle = teamTextStyle
            )
        }
    }
}


@Composable
private fun MatchInfoSection(
    matchNumber: Int,
    fieldNumber: Int?
) {
    Column(
        modifier = Modifier
            .padding(8.dp)
            .width(IntrinsicSize.Min),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = "M: $matchNumber",
            style = MaterialTheme.typography.labelMedium
        )
        HorizontalDivider()
        if (fieldNumber != null) {
            Text(
                text = "F: $fieldNumber",
                style = MaterialTheme.typography.labelMedium
            )
        }
    }
}

@Composable
private fun MatchTeamsSection(
    match: MatchWithRelations,
    team1: TeamWithPlayers?,
    team2: TeamWithPlayers?,
    teamTextStyle: TextStyle,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = modifier
                .padding(horizontal = 8.dp, vertical = 4.dp)
                .weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            TeamDisplay(
                team = team1,
                points = match.match.team1Points,
                previousMatch = match.previousLeftMatch,
                isLosersBracket = match.match.losersBracket,
                teamTextStyle = teamTextStyle
            )

            HorizontalDivider()

            TeamDisplay(
                team = team2,
                points = match.match.team2Points,
                previousMatch = match.previousRightMatch,
                isLosersBracket = match.match.losersBracket,
                teamTextStyle = teamTextStyle
            )
        }
    }
}

@Composable
private fun TeamDisplay(
    team: TeamWithPlayers?,
    points: List<Int>,
    previousMatch: MatchMVP?,
    isLosersBracket: Boolean,
    teamTextStyle: TextStyle
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.weight(0.7f),
            contentAlignment = Alignment.CenterStart
        ) {
            when {
                team?.team?.name != null -> {
                    Text(
                        text = team.team.name.toString(),
                        style = teamTextStyle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                }
                team?.players?.isNotEmpty() == true -> {
                    Text(
                        text = team.players.joinToString(" ") {
                            "${it.firstName}.${it.lastName?.firstOrNull() ?: ""}"
                        },
                        style = teamTextStyle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                }
                previousMatch != null -> {
                    Text(
                        text = buildString {
                            append(if (isLosersBracket && !previousMatch.losersBracket) "Loser" else "Winner")
                            append(" of match #")
                            append(previousMatch.matchNumber)
                        },
                        style = teamTextStyle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
        if (points.isNotEmpty()) {
            Text(
                text = points.joinToString(", "),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(0.3f),
                textAlign = TextAlign.End
            )
        }
    }
}