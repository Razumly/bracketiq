@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.util.timeFormat
import com.razumly.mvp.eventDetail.LocalTournamentComponent
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime

val localColors = compositionLocalOf<ColorPallete> { error("No colors provided")}

data class ColorPallete(
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
)
@Composable
fun MatchCard(
    match: MatchWithRelations?, onClick: () -> Unit, modifier: Modifier = Modifier
) {
    val component = LocalTournamentComponent.current
    val teams by component.divisionTeams.collectAsState()
    val matches by component.divisionMatches.collectAsState()
    val fields by component.divisionFields.collectAsState()
    val matchCardColorPallet = if (match != null && match.match.losersBracket) {
        ColorPallete(MaterialTheme.colorScheme.tertiary,
            MaterialTheme.colorScheme.onTertiary,
            MaterialTheme.colorScheme.tertiaryContainer,
            MaterialTheme.colorScheme.onTertiaryContainer
        )
    } else {
        ColorPallete(MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.onPrimary,
            MaterialTheme.colorScheme.primaryContainer,
            MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
    CompositionLocalProvider(localColors provides matchCardColorPallet) {
        Box(
            modifier = modifier
        ) {
            match?.let {
                FloatingBox(
                    modifier = Modifier.align(Alignment.TopCenter).offset(y = (-20).dp).zIndex(1f),
                    color = localColors.current.primaryContainer
                ) {
                    Text(
                        text = timeFormat.format(
                            match.match.start.toLocalDateTime(TimeZone.currentSystemDefault()).time
                        ),
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.labelLarge,
                        color = localColors.current.onPrimaryContainer
                    )
                }
                Card(
                    modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
                    elevation = CardDefaults.cardElevation(4.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = localColors.current.primary,
                        contentColor = localColors.current.onPrimary
                    )
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MatchInfoSection(match, fields)
                        VerticalDivider(color = localColors.current.onPrimary)
                        TeamsSection(
                    team1 = teams[match.match.team1Id],
                            team2 = teams[match.match.team2Id],
                            match = match,
                            matches = matches,
                        )
                    }
                }
                FloatingBox(
                    modifier = Modifier.align(Alignment.BottomCenter).offset(y = 20.dp),
                    color = localColors.current.primaryContainer
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Text(
                            "Ref: ",
                            style = MaterialTheme.typography.labelLarge,
                            color = localColors.current.onPrimaryContainer
                        )
                        teams[match.match.teamRefereeId]?.players?.forEach { player ->
                            Text(
                                "${player.firstName}.${player.lastName.first()}",
                                modifier = Modifier.padding(start = 4.dp),
                                style = MaterialTheme.typography.labelLarge,
                                overflow = TextOverflow.Ellipsis,
                                maxLines = 1,
                                color = localColors.current.onPrimaryContainer
                            )
                        }
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
    val fieldLabel = resolveFieldLabel(match, fields)
    Column(
        modifier = Modifier.padding(8.dp).width(IntrinsicSize.Max),
        verticalArrangement = Arrangement.SpaceEvenly
    ) {
        Text("M: ${match.match.matchId}", color = localColors.current.onPrimary)
        HorizontalDivider(color = localColors.current.onPrimary)
        Text(
            "Field: $fieldLabel",
            color = localColors.current.onPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

private fun resolveFieldLabel(match: MatchWithRelations, fields: List<FieldWithMatches>): String {
    val relationName = match.field?.name?.trim().orEmpty()
    if (relationName.isNotEmpty()) {
        return relationName
    }

    val relationNumber = match.field?.fieldNumber
    if (relationNumber != null && relationNumber > 0) {
        return "Field $relationNumber"
    }

    val mappedField = fields.firstOrNull { it.field.id == match.match.fieldId }?.field
    val mappedName = mappedField?.name?.trim().orEmpty()
    if (mappedName.isNotEmpty()) {
        return mappedName
    }

    val mappedNumber = mappedField?.fieldNumber
    if (mappedNumber != null && mappedNumber > 0) {
        return "Field $mappedNumber"
    }

    return "Field TBD"
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
        HorizontalDivider(thickness = 1.dp, color = localColors.current.onPrimary)
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
                    maxLines = 1, color = localColors.current.onPrimary
                )
            } else {
                currentTeam.players.forEach { player ->
                    Text(
                        "${player.firstName}.${player.lastName.first()}",
                        Modifier.weight(1f),
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 1, color = localColors.current.onPrimary
                    )
                }
            }
            Text(" ${points.joinToString(separator = ", ")}")
        } ?: run {
            previousMatch?.match?.matchId?.let { matchNumber ->
                val prefix =
                    if (isLosersBracket && !previousMatch.match.losersBracket) "Loser" else "Winner"
                Text(
                    "$prefix of match #$matchNumber",
                    Modifier.weight(1f),
                    color = localColors.current.onPrimary
                )
            }
        }
    }
}
