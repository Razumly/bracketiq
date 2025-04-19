package com.razumly.mvp.matchDetail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.presentation.util.instantToDateTimeString
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.Remove24Px
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
    val match by component.matchWithTeams.collectAsState()
    val isRef by component.isRef.collectAsState()
    val refCheckedIn by component.refCheckedIn.collectAsState()
    val showRefCheckInDialog by component.showRefCheckInDialog.collectAsState()
    val showSetConfirmDialog by component.showSetConfirmDialog.collectAsState()
    val currentSet by component.currentSet.collectAsState()
    val matchFinished by component.matchFinished.collectAsState()
    val team1 = match.team1
    val team2 = match.team2

    val canIncrement = !matchFinished && refCheckedIn && isRef

    val team1Text = remember(team1) {
        derivedStateOf {
            when {
                team1?.team?.name != null -> team1?.team?.name
                team1?.players != null -> team1?.players?.joinToString(" & ") {
                    "${it.firstName}.${it.lastName.first()}"
                }

                else -> "Team 1"
            }
        }
    }.value

    val team2Text = remember(team2) {
        derivedStateOf {
            when {
                team2?.team?.name != null -> team2?.team?.name
                team2?.players != null -> team2?.players?.joinToString(" & ") {
                    "${it.firstName}.${it.lastName.first()}"
                }

                else -> "Team 2"
            }
        }
    }.value

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
        match.match.team1Points[currentSet].let {
            if (team1Text != null) {
                ScoreCard(
                    title = team1Text,
                    score = it.toString(),
                    increase = {
                        component.updateScore(isTeam1 = true, increment = true)
                    },
                    decrease = {
                        component.updateScore(isTeam1 = true, increment = false)
                    },
                    enabled = canIncrement,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        Row(
            modifier = Modifier
                .background(
                    color = Color.White.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(20.dp)
                )
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            match.match.start.let {
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
                text = stringResource(Res.string.set_number, currentSet + 1),
                color = Color.White,
                style = MaterialTheme.typography.titleLarge
            )
        }

        match.match.team2Points[currentSet].let {
            if (team2Text != null) {
                ScoreCard(
                    title = team2Text,
                    score = it.toString(),
                    modifier = Modifier
                        .weight(1f),
                    increase = {
                        component.updateScore(isTeam1 = false, increment = true)
                    },
                    decrease = {
                        component.updateScore(isTeam1 = false, increment = false)
                    },
                    enabled = canIncrement
                )
            }
        }
    }
}

@Composable
fun ScoreCard(
    title: String,
    score: String,
    decrease: () -> Unit,
    increase: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
            .wrapContentSize()
            .clickable(
                enabled = enabled,
                onClick = decrease,
            )
        ) {
            Icon(
                imageVector = MVPIcons.Remove24Px,
                contentDescription = "Decrease score",
                modifier = Modifier
                    .size(48.dp),
                tint = Color.White,
            )
        }

        Column(
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

        Box(
            modifier = Modifier
            .wrapContentSize()
            .clickable(enabled = enabled, onClick = increase)
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = "Increase score",
                modifier = Modifier
                    .size(48.dp),
                tint = Color.White
            )
        }
    }
}

