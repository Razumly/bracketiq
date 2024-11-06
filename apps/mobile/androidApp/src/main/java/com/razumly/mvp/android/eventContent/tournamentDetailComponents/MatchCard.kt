package com.razumly.mvp.android.eventContent.tournamentDetailComponents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Match
import java.io.File.separator


@Composable
fun MatchCard(
    match: Match?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val cardAlpha = if (match == null) 0f else 1f
    val textModifier = Modifier.width(70.dp)
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .alpha(cardAlpha),
        elevation = CardDefaults.cardElevation(4.dp)
    ) {
        Row {
            Box(
                modifier = Modifier.padding(3.dp),
                contentAlignment = Alignment.TopStart
            ) {
                Text("${match?.matchId}")
            }
            Column(
                modifier = Modifier
                    .padding(8.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (match == null) {
                    return@Column
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Team 1 display
                    match.team1?.let { team ->
                        if (team.name != null) {
                            Text(
                                team.name.toString(),
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
                        Text(" ${match.team1Points.joinToString(separator = ", ")}")
                    } ?: run {
                        match.previousLeftMatch?.matchId?.let { matchId ->
                            val prefix =
                                if (match.losersBracket && match.previousLeftMatch?.losersBracket == false) {
                                    "Loser"
                                } else {
                                    "Winner"
                                }
                            Text("$prefix of match #$matchId")
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
                        if (team.name != null) {
                            Text(
                                team.name.toString(),
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
                        Text(" ${match.team2Points.joinToString(separator = ", ")}")
                    } ?: run {
                        match.previousRightMatch?.matchId?.let { matchId ->
                            val prefix =
                                if (match.losersBracket && match.previousRightMatch?.losersBracket == false) {
                                    "Loser"
                                } else {
                                    "Winner"
                                }
                            Text("$prefix of match #$matchId")
                        }
                    }
                }
            }
        }
    }
}