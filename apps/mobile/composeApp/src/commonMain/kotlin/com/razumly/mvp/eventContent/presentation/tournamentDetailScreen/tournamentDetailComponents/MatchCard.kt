package com.razumly.mvp.eventContent.presentation.tournamentDetailScreen.tournamentDetailComponents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardColors
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.composables.HorizontalDivider
import com.razumly.mvp.core.presentation.composables.VerticalDivider
import com.razumly.mvp.eventContent.presentation.MatchContentComponent
import com.razumly.mvp.eventContent.presentation.TournamentContentComponent


@Composable
fun MatchCard(
    component: TournamentContentComponent,
    match: MatchWithRelations,
    onClick: () -> Unit,
    cardColors: CardColors,
    modifier: Modifier = Modifier,
) {
    val textModifier = Modifier.width(70.dp)
    val team1 = component.currentTeams.value[match.match.team1]
    val team2 = component.currentTeams.value[match.match.team2]
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = { onClick() }),
        elevation = CardDefaults.cardElevation(4.dp),
        colors = cardColors
    ) {
        Row {
            Column(
                modifier = Modifier
                    .padding(8.dp)
                    .width(IntrinsicSize.Max),
                verticalArrangement = Arrangement.SpaceEvenly
            ) {
                Text("M: ${match.match.matchNumber}")
                androidx.compose.material3.HorizontalDivider()
                Text("F: ${match.field?.fieldNumber}")
            }
            androidx.compose.material3.VerticalDivider()
            Column(
                modifier = Modifier
                    .padding(8.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Team 1 display
                    team1?.let { team ->
                        if (team.team.name != null) {
                            Text(
                                team.team.name.toString(),
                                textModifier,
                                overflow = TextOverflow.Ellipsis
                            )
                        } else {
                            team.players.forEach { player ->
                                Text(
                                    "${player.firstName}.${player.lastName?.first()}",
                                    textModifier,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        Text(" ${match.match.team1Points.joinToString(separator = ", ")}")
                    } ?: run {
                        match.previousLeftMatch?.matchNumber?.let { matchNumber ->
                            val prefix =
                                if (match.match.losersBracket && match.previousLeftMatch?.losersBracket == false) {
                                    "Loser"
                                } else {
                                    "Winner"
                                }
                            Text("$prefix of match #$matchNumber")
                        }
                    }
                }

                androidx.compose.material3.HorizontalDivider(thickness = 1.dp)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Team 2 display
                    team2?.let { team ->
                        if (team.team.name != null) {
                            Text(
                                team.team.name.toString(),
                                textModifier,
                                overflow = TextOverflow.Ellipsis
                            )
                        } else {
                            team.players.forEach { player ->
                                Text(
                                    "${player.firstName}.${player.lastName?.first()}",
                                    textModifier,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        Text(" ${match.match.team2Points.joinToString(separator = ", ")}")
                    } ?: run {
                        match.previousRightMatch?.matchNumber?.let { matchNumber ->
                            val prefix =
                                if (match.match.losersBracket && match.previousRightMatch?.losersBracket == false) {
                                    "Loser"
                                } else {
                                    "Winner"
                                }
                            Text("$prefix of match #$matchNumber")
                        }
                    }
                }
            }
        }
    }
}