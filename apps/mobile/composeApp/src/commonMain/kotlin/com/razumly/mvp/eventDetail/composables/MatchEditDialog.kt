@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatchEditDialog(
    match: MatchWithRelations,
    teams: List<TeamWithPlayers>,
    fields: List<FieldWithMatches>,
    onDismissRequest: () -> Unit,
    onConfirm: (MatchWithRelations) -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f))
            .clickable { onDismissRequest() }, contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.9f).fillMaxHeight(0.8f)
                .clickable(enabled = false) { }, // Prevent click-through
            shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface
        ) {
            MatchEditDialogContent(
                match = match,
                teams = teams,
                fields = fields,
                onDismissRequest = onDismissRequest,
                onConfirm = onConfirm
            )
        }
    }
}

@Composable
private fun MatchEditDialogContent(
    match: MatchWithRelations,
    teams: List<TeamWithPlayers>,
    fields: List<FieldWithMatches>,
    onDismissRequest: () -> Unit,
    onConfirm: (MatchWithRelations) -> Unit
) {
    var editedMatch by remember { mutableStateOf(match) }


    var showTeam1Dropdown by remember { mutableStateOf(false) }
    var showTeam2Dropdown by remember { mutableStateOf(false) }
    var showRefDropdown by remember { mutableStateOf(false) }
    var showFieldDropdown by remember { mutableStateOf(false) }

    // Calculate initial duration between start and end
    val initialDuration = remember(match) {
        match.match.end?.let { endTime ->
            endTime - match.match.start
        }
    }
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp)
    ) {
        // Header
        Text(
            text = "Edit Match #${match.match.matchNumber}",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        // Scrollable content
        LazyColumn(
            modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {


            item {
                Text(
                    text = "Teams",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Team 1 Dropdown
                    TeamSelectionField(
                        label = "Team 1",
                        selectedTeam = teams.find { it.team.id == editedMatch.match.team1 },
                        expanded = showTeam1Dropdown,
                        onExpandedChange = { showTeam1Dropdown = it },
                        teams = teams,
                        onTeamSelected = { team ->
                            editedMatch = editedMatch.copy(
                                match = editedMatch.match.copy(team1 = team?.team?.id)
                            )
                            showTeam1Dropdown = false
                        },
                        modifier = Modifier.weight(1f)
                    )

                    // Team 2 Dropdown
                    TeamSelectionField(
                        label = "Team 2",
                        selectedTeam = teams.find { it.team.id == editedMatch.match.team2 },
                        expanded = showTeam2Dropdown,
                        onExpandedChange = { showTeam2Dropdown = it },
                        teams = teams,
                        onTeamSelected = { team ->
                            editedMatch = editedMatch.copy(
                                match = editedMatch.match.copy(team2 = team?.team?.id)
                            )
                            showTeam2Dropdown = false
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // Referee Section
            item {
                TeamSelectionField(
                    label = "Referee",
                    selectedTeam = teams.find { it.team.id == editedMatch.match.refId },
                    expanded = showRefDropdown,
                    onExpandedChange = { showRefDropdown = it },
                    teams = teams,
                    onTeamSelected = { team ->
                        editedMatch = editedMatch.copy(
                            match = editedMatch.match.copy(refId = team?.team?.id)
                        )
                        showRefDropdown = false
                    })
            }

            // Scores Section
            item {
                Text(
                    text = "Scores",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            item {
                IndividualScoreInputSection(
                    team1Name = teams.find { it.team.id == editedMatch.match.team1 }?.team?.name
                        ?: "Team 1",
                    team2Name = teams.find { it.team.id == editedMatch.match.team2 }?.team?.name
                        ?: "Team 2",
                    team1Scores = editedMatch.match.team1Points,
                    team2Scores = editedMatch.match.team2Points,
                    onTeam1ScoreChange = { newScores ->
                        editedMatch = editedMatch.copy(
                            match = editedMatch.match.copy(team1Points = newScores)
                        )
                    },
                    onTeam2ScoreChange = { newScores ->
                        editedMatch = editedMatch.copy(
                            match = editedMatch.match.copy(team2Points = newScores)
                        )
                    })
            }

            // Timing Section
            item {
                Text(
                    text = "Schedule",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            item {
                TimePickerField(
                    label = "Start Time",
                    selectedTime = editedMatch.match.start,
                    onTimeSelected = { newStartTime ->
                        // Update start time and adjust end time to maintain duration
                        val newEndTime = initialDuration?.let { duration ->
                            newStartTime + duration
                        }
                        editedMatch = editedMatch.copy(
                            match = editedMatch.match.copy(
                                start = newStartTime, end = newEndTime
                            )
                        )
                    })
            }

            item {
                Text(
                    text = "End Time: ${
                        editedMatch.match.end?.toLocalDateTime(TimeZone.currentSystemDefault())
                            ?.format(dateTimeFormat) ?: "Not set"
                    }",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Field Section
            item {
                FieldSelectionField(
                    label = "Field",
                    selectedField = fields.find { it.field.id == editedMatch.match.field },
                    expanded = showFieldDropdown,
                    onExpandedChange = { showFieldDropdown = it },
                    fields = fields,
                    onFieldSelected = { field ->
                        editedMatch = editedMatch.copy(
                            match = editedMatch.match.copy(field = field?.field?.id)
                        )
                        showFieldDropdown = false
                    })
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            TextButton(
                onClick = onDismissRequest, modifier = Modifier.weight(1f)
            ) {
                Text("Cancel")
            }

            Button(
                onClick = {
                    onConfirm(editedMatch)
                    onDismissRequest()
                }, modifier = Modifier.weight(1f)
            ) {
                Text("Save Changes")
            }
        }
    }
}

@Composable
fun IndividualScoreInputSection(
    team1Name: String,
    team2Name: String,
    team1Scores: List<Int>,
    team2Scores: List<Int>,
    onTeam1ScoreChange: (List<Int>) -> Unit,
    onTeam2ScoreChange: (List<Int>) -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Team 1 Scores
        Text(
            text = team1Name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)
            ) {
                items(team1Scores.size) { index ->
                    var scoreText by remember(team1Scores[index]) {
                        mutableStateOf(team1Scores[index].toString())
                    }

                    PlatformTextField(
                        value = scoreText,
                        onValueChange = { newText ->
                            scoreText = newText
                            val newScore = newText.toIntOrNull() ?: 0
                            val newScores = team1Scores.toMutableList()
                            newScores[index] = newScore
                            onTeam1ScoreChange(newScores)
                        },
                        modifier = Modifier.width(60.dp),
                        textStyle = MaterialTheme.typography.bodyMedium,
                        placeholder = "0"
                    )
                }
            }

            // Add set button
            IconButton(
                onClick = {
                    onTeam1ScoreChange(team1Scores + 0)
                }) {
                Icon(Icons.Default.Add, contentDescription = "Add set")
            }

            // Remove set button
            if (team1Scores.size > 1) {
                IconButton(
                    onClick = {
                        onTeam1ScoreChange(team1Scores.dropLast(1))
                    }) {
                    Icon(Icons.Default.Remove, contentDescription = "Remove set")
                }
            }
        }

        // Team 2 Scores
        Text(
            text = team2Name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)
            ) {
                items(team2Scores.size) { index ->
                    var scoreText by remember(team2Scores[index]) {
                        mutableStateOf(team2Scores[index].toString())
                    }

                    PlatformTextField(
                        value = scoreText,
                        onValueChange = { newText ->
                            scoreText = newText
                            val newScore = newText.toIntOrNull() ?: 0
                            val newScores = team2Scores.toMutableList()
                            newScores[index] = newScore
                            onTeam2ScoreChange(newScores)
                        },
                        modifier = Modifier.width(60.dp),
                        textStyle = MaterialTheme.typography.bodyMedium,
                        placeholder = "0"
                    )
                }
            }

            // Add set button
            IconButton(
                onClick = {
                    onTeam2ScoreChange(team2Scores + 0)
                }) {
                Icon(Icons.Default.Add, contentDescription = "Add set")
            }

            // Remove set button
            if (team2Scores.size > 1) {
                IconButton(
                    onClick = {
                        onTeam2ScoreChange(team2Scores.dropLast(1))
                    }) {
                    Icon(Icons.Default.Remove, contentDescription = "Remove set")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamSelectionField(
    label: String,
    selectedTeam: TeamWithPlayers?,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    teams: List<TeamWithPlayers>,
    onTeamSelected: (TeamWithPlayers?) -> Unit,
    modifier: Modifier = Modifier
) {
    ExposedDropdownMenuBox(
        expanded = expanded, onExpandedChange = onExpandedChange, modifier = modifier
    ) {
        PlatformTextField(
            value = selectedTeam?.team?.name ?: "Select ${label.lowercase()}",
            onValueChange = {},
            readOnly = true,
            label = label,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth()
        )

        ExposedDropdownMenu(
            expanded = expanded, onDismissRequest = { onExpandedChange(false) }) {
            DropdownMenuItem(text = { Text("None") }, onClick = { onTeamSelected(null) })

            teams.forEach { team ->
                DropdownMenuItem(text = {
                    Column {
                        Text(team.team.name ?: "Team ${team.team.id}")
                        Text(
                            text = "${team.players.size} players",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }, onClick = { onTeamSelected(team) })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalTime::class)
@Composable
fun TimePickerField(
    label: String, selectedTime: Instant?, onTimeSelected: (Instant) -> Unit
) {
    var showTimePicker by remember { mutableStateOf(false) }

    PlatformTextField(
        value = selectedTime?.toLocalDateTime(TimeZone.currentSystemDefault())
            ?.format(dateTimeFormat) ?: "Select time",
        onValueChange = {},
        label = label,
        readOnly = true,
        trailingIcon = {
            IconButton(onClick = { showTimePicker = true }) {
                Icon(Icons.Default.AccessTime, contentDescription = "Select time")
            }
        },
        modifier = Modifier.fillMaxWidth(),
        onTap = { showTimePicker = true })

    if (showTimePicker) {
        PlatformDateTimePicker(
            onDateSelected = { instant ->
                instant?.let { onTimeSelected(it) }
                showTimePicker = false
            },
            onDismissRequest = { showTimePicker = false },
            showPicker = showTimePicker,
            getTime = true,
            canSelectPast = false
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FieldSelectionField(
    label: String,
    selectedField: FieldWithMatches?,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    fields: List<FieldWithMatches>,
    onFieldSelected: (FieldWithMatches?) -> Unit
) {
    ExposedDropdownMenuBox(
        expanded = expanded, onExpandedChange = onExpandedChange
    ) {
        PlatformTextField(
            value = selectedField?.field?.fieldNumber?.toString() ?: "Select field",
            onValueChange = {},
            readOnly = true,
            label = label,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth()
        )

        ExposedDropdownMenu(
            expanded = expanded, onDismissRequest = { onExpandedChange(false) }) {
            DropdownMenuItem(
                text = { Text("No field assigned") },
                onClick = { onFieldSelected(null) })

            fields.forEach { field ->
                DropdownMenuItem(
                    text = { Text("Field ${field.field.fieldNumber}") },
                    onClick = { onFieldSelected(field) })
            }
        }
    }
}
