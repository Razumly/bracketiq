package com.razumly.mvp.android.eventContent.matchDetailScreen

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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.razumly.mvp.android.LocalUserSession
import com.razumly.mvp.android.R
import com.razumly.mvp.android.instantToDateTimeString
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.eventContent.presentation.MatchContentViewModel
import org.koin.compose.viewmodel.koinNavViewModel
import org.koin.core.annotation.KoinExperimentalAPI
import org.koin.core.parameter.parametersOf

@OptIn(KoinExperimentalAPI::class)
@Composable
fun MatchDetailScreen(
    selectedMatch: MatchMVP,
) {
    val currentUser = LocalUserSession.current
    val viewModel =
        koinNavViewModel<MatchContentViewModel>(parameters = {
            parametersOf(
                selectedMatch,
                currentUser?.id
            )
        })

    currentUser?.id?.let { viewModel.checkRefStatus() }

    val match by viewModel.match.collectAsStateWithLifecycle()
    val currentTeams by viewModel.currentTeams.collectAsStateWithLifecycle()
    val isRef by viewModel.isRef.collectAsStateWithLifecycle()
    val refCheckedIn by viewModel.refCheckedIn.collectAsStateWithLifecycle(false)
    val showRefCheckInDialog by viewModel.showRefCheckInDialog.collectAsStateWithLifecycle()
    val showSetConfirmDialog by viewModel.showSetConfirmDialog.collectAsStateWithLifecycle()
    val currentSet by viewModel.currentSet.collectAsStateWithLifecycle()
    val matchFinished by viewModel.matchFinished.collectAsStateWithLifecycle()

    val canIncrement = !matchFinished && refCheckedIn == true && isRef

    if (showRefCheckInDialog) {
        val message = if (isRef) {
            stringResource(R.string.referee_checkin_message)
        } else {
            stringResource(R.string.not_referee_check_in_message)
        }
        currentUser?.id?.let {
            AlertDialog(
                onDismissRequest = { },
                title = { Text(stringResource(R.string.referee_check_in_title)) },
                text = { Text(message) },
                confirmButton = {
                    Button(onClick = { viewModel.confirmRefCheckIn() }) {
                        Text("Yes")
                    }
                },
                dismissButton = {
                    Button(onClick = { viewModel.dismissRefDialog() }) {
                        Text("No")
                    }
                }
            )
        }
    }

    if (showSetConfirmDialog) {
        AlertDialog(
            onDismissRequest = { },
            title = { Text(stringResource(R.string.confirm_set_result_title)) },
            text = { Text(stringResource(R.string.confirm_set_result_message, currentSet + 1)) },
            confirmButton = {
                Button(onClick = { viewModel.confirmSet() }) {
                    Text("Confirm")
                }
            },
            dismissButton = {
                Button(onClick = { viewModel.dismissSetDialog() }) {
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
        val team1 = match?.team1
        val team2 = match?.team2
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
                            viewModel.updateScore(isTeam1 = false, increment = true)
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
                text = stringResource(R.string.set_number, currentSet),
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
                            viewModel.updateScore(isTeam1 = false, increment = true)
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
