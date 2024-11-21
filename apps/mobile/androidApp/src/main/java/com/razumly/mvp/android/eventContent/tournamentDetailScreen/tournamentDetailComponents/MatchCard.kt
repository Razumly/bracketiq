package com.razumly.mvp.android.eventContent.tournamentDetailScreen.tournamentDetailComponents

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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations


@Composable
fun MatchCard(
    match: MatchWithRelations,
    onClick: () -> Unit,
    cardColors: CardColors,
    modifier: Modifier = Modifier,
) {
    val textModifier = Modifier.width(70.dp)
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
                HorizontalDivider()
                Text("F: ${match.field?.fieldNumber}")
            }
            VerticalDivider()
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
                    match.team1?.let { team ->
                        if (team.team.name != null) {
                            Text(
                                team.team.name.toString(),
                                textModifier,
                                overflow = TextOverflow.Ellipsis
                            )
                        } else {
                            team.players.filterNotNull().forEach { player ->
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

                HorizontalDivider(thickness = 1.dp)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Team 2 display
                    match.team2?.let { team ->
                        if (team.team.name != null) {
                            Text(
                                team.team.name.toString(),
                                textModifier,
                                overflow = TextOverflow.Ellipsis
                            )
                        } else {
                            team.players.filterNotNull().forEach { player ->
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