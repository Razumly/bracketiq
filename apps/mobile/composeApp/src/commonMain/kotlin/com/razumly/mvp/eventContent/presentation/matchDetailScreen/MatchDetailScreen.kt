package com.razumly.mvp.eventContent.presentation.matchDetailScreen

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.presentation.util.instantToDateTimeString
import com.razumly.mvp.eventContent.presentation.MatchContentComponent
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.confirm_set_result_message
import mvp.composeapp.generated.resources.confirm_set_result_title
import mvp.composeapp.generated.resources.not_referee_check_in_message
import mvp.composeapp.generated.resources.referee_check_in_title
import mvp.composeapp.generated.resources.referee_checkin_message
import mvp.composeapp.generated.resources.set_number
import org.jetbrains.compose.resources.stringResource

@Composable
fun MatchDetailScreen(
    component: MatchContentComponent
) {
    val match by component.match.collectAsState()
    val currentTeams by component.currentTeams.collectAsState()
    val isRef by component.isRef.collectAsState()
    val refCheckedIn by component.refCheckedIn.collectAsState()
    val showRefCheckInDialog by component.showRefCheckInDialog.collectAsState()
    val showSetConfirmDialog by component.showSetConfirmDialog.collectAsState()
    val currentSet by component.currentSet.collectAsState()
    val matchFinished by component.matchFinished.collectAsState()

    val canIncrement = !matchFinished && refCheckedIn && isRef

    if (showRefCheckInDialog) {
        val message = if (isRef) {
            stringResource(Res.string.referee_checkin_message)
        } else {
            stringResource(Res.string.not_referee_check_in_message)
        }
        AlertDialog(
            onDismissRequest = { },
            title = { Text(stringResource(Res.string.referee_check_in_title)) },
            text = { Text(message) },
            confirmButton = {
                Button(onClick = { component.confirmRefCheckIn() }) {
                    Text("Yes")
                }
            },
            dismissButton = {
                Button(onClick = { component.dismissRefDialog() }) {
                    Text("No")
                }
            }
        )
    }

    if (showSetConfirmDialog) {
        AlertDialog(
            onDismissRequest = { },
            title = { Text(stringResource(Res.string.confirm_set_result_title)) },
            text = { Text(stringResource(Res.string.confirm_set_result_message, currentSet + 1)) },
            confirmButton = {
                Button(onClick = { component.confirmSet() }) {
                    Text("Confirm")
                }
            },
            dismissButton = {
                Button(onClick = { component.dismissSetDialog() }) {
                    Text("Cancel")
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFFF8C00),
                        Color(0xFFFFD700)
                    )
                )
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceEvenly
    ) {
        val team1 = currentTeams[match?.team1?.id]
        val team2 = currentTeams[match?.team2?.id]
        val team1Text = if (team1?.team?.name != null) {
            team1.team.name.toString()
        } else {
            team1?.players?.forEach { player ->
                "${player.firstName}.${player.lastName?.first()}"
            }.toString()
        }
        val team2Text = if (team2?.team?.name != null) {
            team2.team.name.toString()
        } else {
            team2?.players?.forEach { player ->
                "${player.firstName}.${player.lastName?.first()}"
            }.toString()
        }

        match?.match?.team1Points?.get(currentSet)?.let {
            ScoreCard(
                title = team1Text,
                score = it.toString(),
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        enabled = canIncrement,
                        onClick = {
                            component.updateScore(isTeam1 = true, increment = true)
                        }
                    ),
            )
        }

        Row(
            modifier = Modifier
                .background(
                    color = Color.White.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(20.dp)
                )
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            match?.match?.start?.let {
                Text(
                    text = instantToDateTimeString(it),
                    color = Color.White,
                    style = MaterialTheme.typography.titleLarge
                )
            }
            Text(
                text = " | ",
                color = Color.White,
                style = MaterialTheme.typography.titleLarge
            )
            Text(
                text = stringResource(Res.string.set_number, currentSet),
                color = Color.White,
                style = MaterialTheme.typography.titleLarge
            )
        }

        match?.match?.team2Points?.get(currentSet)?.let {
            ScoreCard(
                title = team2Text,
                score = it.toString(),
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        enabled = canIncrement,
                        onClick = {
                            component.updateScore(isTeam1 = false, increment = true)
                        }
                    ),
            )
        }
    }
}


@Composable
fun ScoreCard(
    title: String,
    score: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = Color.White
        )

        Text(
            text = score,
            style = MaterialTheme.typography.displayLarge,
            color = Color.White,
            fontSize = 64.sp
        )
    }
}
