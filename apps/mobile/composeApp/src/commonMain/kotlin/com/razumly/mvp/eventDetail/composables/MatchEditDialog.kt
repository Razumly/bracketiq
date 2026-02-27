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
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.presentation.util.toTeamDisplayLabel
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.eventDetail.MatchCreateContext
import com.razumly.mvp.eventDetail.data.BracketLane
import com.razumly.mvp.eventDetail.data.BracketNode
import com.razumly.mvp.eventDetail.data.filterValidNextMatchCandidates
import com.razumly.mvp.eventDetail.data.validateAndNormalizeBracketGraph
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
    allMatches: List<MatchWithRelations>,
    eventType: EventType,
    isCreateMode: Boolean,
    creationContext: MatchCreateContext,
    onDismissRequest: () -> Unit,
    onConfirm: (MatchWithRelations) -> Unit,
    onDelete: (matchId: String) -> Unit,
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
                allMatches = allMatches,
                eventType = eventType,
                isCreateMode = isCreateMode,
                creationContext = creationContext,
                onDismissRequest = onDismissRequest,
                onConfirm = onConfirm,
                onDelete = onDelete,
            )
        }
    }
}

@Composable
private fun MatchEditDialogContent(
    match: MatchWithRelations,
    teams: List<TeamWithPlayers>,
    fields: List<FieldWithMatches>,
    allMatches: List<MatchWithRelations>,
    eventType: EventType,
    isCreateMode: Boolean,
    creationContext: MatchCreateContext,
    onDismissRequest: () -> Unit,
    onConfirm: (MatchWithRelations) -> Unit,
    onDelete: (matchId: String) -> Unit,
) {
    var editedMatch by remember(match) { mutableStateOf(match) }
    var showTeam1Dropdown by remember { mutableStateOf(false) }
    var showTeam2Dropdown by remember { mutableStateOf(false) }
    var showRefDropdown by remember { mutableStateOf(false) }
    var showFieldDropdown by remember { mutableStateOf(false) }
    var showWinnerNextDropdown by remember { mutableStateOf(false) }
    var showLoserNextDropdown by remember { mutableStateOf(false) }
    var startTime by remember(match.match.start) { mutableStateOf(match.match.start) }
    var endTime by remember(match.match.end) { mutableStateOf(match.match.end) }
    var winnerNextMatchId by remember(match.match.winnerNextMatchId) {
        mutableStateOf(normalizeToken(match.match.winnerNextMatchId))
    }
    var loserNextMatchId by remember(match.match.loserNextMatchId) {
        mutableStateOf(normalizeToken(match.match.loserNextMatchId))
    }
    var validationError by remember { mutableStateOf<String?>(null) }

    val requiresScheduleFields = creationContext == MatchCreateContext.SCHEDULE
    val currentMatchId = editedMatch.match.id
    val initialDuration = remember(match.match.start, match.match.end) {
        val start = match.match.start
        val end = match.match.end
        if (start != null && end != null && end > start) {
            end - start
        } else {
            null
        }
    }
    val allMatchLabels = remember(allMatches, match) {
        val options = linkedMapOf<String, String>()
        allMatches.forEach { candidate ->
            val candidateId = normalizeToken(candidate.match.id) ?: return@forEach
            val label = "Match #${candidate.match.matchId}"
            options[candidateId] = label
        }
        val fallbackId = normalizeToken(match.match.id)
        if (fallbackId != null && fallbackId !in options) {
            options[fallbackId] = "Match #${match.match.matchId}"
        }
        options
    }
    val bracketNodes = remember(allMatches, editedMatch.match, winnerNextMatchId, loserNextMatchId) {
        val map = linkedMapOf<String, BracketNode>()
        allMatches.forEach { relation ->
            val candidate = relation.match
            val id = normalizeToken(candidate.id) ?: return@forEach
            map[id] = BracketNode(
                id = id,
                matchId = candidate.matchId,
                previousLeftId = normalizeToken(candidate.previousLeftId),
                previousRightId = normalizeToken(candidate.previousRightId),
                winnerNextMatchId = normalizeToken(candidate.winnerNextMatchId),
                loserNextMatchId = normalizeToken(candidate.loserNextMatchId),
            )
        }
        val editedId = normalizeToken(editedMatch.match.id)
        if (editedId != null) {
            map[editedId] = BracketNode(
                id = editedId,
                matchId = editedMatch.match.matchId,
                previousLeftId = normalizeToken(editedMatch.match.previousLeftId),
                previousRightId = normalizeToken(editedMatch.match.previousRightId),
                winnerNextMatchId = normalizeToken(winnerNextMatchId),
                loserNextMatchId = normalizeToken(loserNextMatchId),
            )
        }
        map.values.toList()
    }
    val winnerCandidateIds = remember(currentMatchId, bracketNodes) {
        filterValidNextMatchCandidates(
            sourceId = currentMatchId,
            nodes = bracketNodes,
            lane = BracketLane.WINNER,
        )
    }
    val loserCandidateIds = remember(currentMatchId, bracketNodes) {
        filterValidNextMatchCandidates(
            sourceId = currentMatchId,
            nodes = bracketNodes,
            lane = BracketLane.LOSER,
        )
    }
    val selectedWinnerNext = remember(winnerNextMatchId, winnerCandidateIds) {
        normalizeToken(winnerNextMatchId)?.takeIf { candidate -> winnerCandidateIds.contains(candidate) }
    }
    val selectedLoserNext = remember(loserNextMatchId, loserCandidateIds) {
        normalizeToken(loserNextMatchId)?.takeIf { candidate -> loserCandidateIds.contains(candidate) }
    }

    LaunchedEffect(
        editedMatch.match.team1Id,
        editedMatch.match.team2Id,
        editedMatch.match.fieldId,
        startTime,
        endTime,
        winnerNextMatchId,
        loserNextMatchId,
    ) {
        validationError = null
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp)
    ) {
        // Header
        Text(
            text = if (isCreateMode) {
                "Add Match #${editedMatch.match.matchId}"
            } else {
                "Edit Match #${editedMatch.match.matchId}"
            },
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        validationError?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

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
                        selectedTeam = teams.find { it.team.id == editedMatch.match.team1Id },
                        expanded = showTeam1Dropdown,
                        onExpandedChange = { showTeam1Dropdown = it },
                        teams = teams,
                        onTeamSelected = { team ->
                            editedMatch = editedMatch.copy(
                                match = editedMatch.match.copy(team1Id = team?.team?.id)
                            )
                            showTeam1Dropdown = false
                        },
                        modifier = Modifier.weight(1f)
                    )

                    // Team 2 Dropdown
                    TeamSelectionField(
                        label = "Team 2",
                        selectedTeam = teams.find { it.team.id == editedMatch.match.team2Id },
                        expanded = showTeam2Dropdown,
                        onExpandedChange = { showTeam2Dropdown = it },
                        teams = teams,
                        onTeamSelected = { team ->
                            editedMatch = editedMatch.copy(
                                match = editedMatch.match.copy(team2Id = team?.team?.id)
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
                    selectedTeam = teams.find { it.team.id == editedMatch.match.teamRefereeId },
                    expanded = showRefDropdown,
                    onExpandedChange = { showRefDropdown = it },
                    teams = teams,
                    onTeamSelected = { team ->
                        editedMatch = editedMatch.copy(
                            match = editedMatch.match.copy(teamRefereeId = team?.team?.id)
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
                    team1Name = teams.find { it.team.id == editedMatch.match.team1Id }
                        ?.toTeamDisplayLabel()
                        ?: "Team 1",
                    team2Name = teams.find { it.team.id == editedMatch.match.team2Id }
                        ?.toTeamDisplayLabel()
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
                    label = if (requiresScheduleFields) "Start Time" else "Start Time (Optional)",
                    selectedTime = startTime,
                    onTimeSelected = { newStartTime ->
                        // Update start time and adjust end time to maintain duration
                        val newEndTime = initialDuration?.let { duration ->
                            newStartTime + duration
                        }
                        startTime = newStartTime
                        endTime = newEndTime ?: endTime
                    })
            }

            item {
                TimePickerField(
                    label = if (requiresScheduleFields) "End Time" else "End Time (Optional)",
                    selectedTime = endTime,
                    onTimeSelected = { newEndTime ->
                        endTime = newEndTime
                    },
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Lock match (prevent auto-rescheduling)",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Checkbox(
                        checked = editedMatch.match.locked,
                        onCheckedChange = { isLocked ->
                            editedMatch = editedMatch.copy(
                                match = editedMatch.match.copy(locked = isLocked)
                            )
                        }
                    )
                }
            }

            // Field Section
            item {
                FieldSelectionField(
                    label = "Field",
                    selectedField = fields.find { it.field.id == editedMatch.match.fieldId },
                    expanded = showFieldDropdown,
                    onExpandedChange = { showFieldDropdown = it },
                    fields = fields,
                    onFieldSelected = { field ->
                        editedMatch = editedMatch.copy(
                            match = editedMatch.match.copy(fieldId = field?.field?.id)
                        )
                        showFieldDropdown = false
                    })
            }

            item {
                Text(
                    text = "Bracket Links",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                )
            }

            item {
                MatchLinkSelectionField(
                    label = "Winner advances to",
                    selectedMatchId = selectedWinnerNext,
                    options = winnerCandidateIds.mapNotNull { candidateId ->
                        allMatchLabels[candidateId]?.let { label -> candidateId to label }
                    },
                    expanded = showWinnerNextDropdown,
                    onExpandedChange = { showWinnerNextDropdown = it },
                    onMatchSelected = { selectedId ->
                        winnerNextMatchId = selectedId
                        showWinnerNextDropdown = false
                    },
                )
            }

            item {
                MatchLinkSelectionField(
                    label = "Loser advances to",
                    selectedMatchId = selectedLoserNext,
                    options = loserCandidateIds.mapNotNull { candidateId ->
                        allMatchLabels[candidateId]?.let { label -> candidateId to label }
                    },
                    expanded = showLoserNextDropdown,
                    onExpandedChange = { showLoserNextDropdown = it },
                    onMatchSelected = { selectedId ->
                        loserNextMatchId = selectedId
                        showLoserNextDropdown = false
                    },
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (!match.match.id.isBlank()) {
                TextButton(
                    onClick = {
                        onDelete(match.match.id)
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (isCreateMode) "Discard Match" else "Delete Match")
                }
            }
            TextButton(
                onClick = onDismissRequest, modifier = Modifier.weight(1f)
            ) {
                Text("Cancel")
            }

            Button(
                onClick = {
                    val team1Id = normalizeToken(editedMatch.match.team1Id)
                    val team2Id = normalizeToken(editedMatch.match.team2Id)
                    if (!team1Id.isNullOrBlank() && team1Id == team2Id) {
                        validationError = "Team 1 and Team 2 must be different."
                        return@Button
                    }

                    if (requiresScheduleFields) {
                        if (normalizeToken(editedMatch.match.fieldId).isNullOrBlank() || startTime == null || endTime == null) {
                            validationError = "Field, start, and end are required for schedule-created matches."
                            return@Button
                        }
                        if (endTime!! <= startTime!!) {
                            validationError = "End time must be after start time."
                            return@Button
                        }
                    } else if (startTime != null && endTime != null && endTime!! <= startTime!!) {
                        validationError = "End time must be after start time."
                        return@Button
                    }

                    val validationNodes = bracketNodes.map { node ->
                        if (node.id != currentMatchId) {
                            node
                        } else {
                            node.copy(
                                winnerNextMatchId = selectedWinnerNext,
                                loserNextMatchId = selectedLoserNext,
                            )
                        }
                    }
                    val graphValidation = validateAndNormalizeBracketGraph(validationNodes)
                    if (!graphValidation.ok) {
                        validationError = graphValidation.errors.firstOrNull()?.message ?: "Invalid bracket links."
                        return@Button
                    }

                    if (isCreateMode && eventType == EventType.TOURNAMENT) {
                        val normalizedNode = graphValidation.normalizedById[currentMatchId]
                        val hasAnyLink =
                            !selectedWinnerNext.isNullOrBlank() ||
                                !selectedLoserNext.isNullOrBlank() ||
                                !normalizeToken(normalizedNode?.previousLeftId).isNullOrBlank() ||
                                !normalizeToken(normalizedNode?.previousRightId).isNullOrBlank()
                        if (!hasAnyLink) {
                            validationError = "Tournament match creation requires at least one bracket link."
                            return@Button
                        }
                    }

                    val nextMatch = editedMatch.match.copy(
                        start = startTime,
                        end = endTime,
                        winnerNextMatchId = selectedWinnerNext,
                        loserNextMatchId = selectedLoserNext,
                    )
                    onConfirm(editedMatch.copy(match = nextMatch))
                    onDismissRequest()
                }, modifier = Modifier.weight(1f)
            ) {
                Text(if (isCreateMode) "Create Match" else "Save Changes")
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
                        placeholder = "0",
                        textStyle = MaterialTheme.typography.bodyMedium
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
                        placeholder = "0",
                        textStyle = MaterialTheme.typography.bodyMedium
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

private fun normalizeToken(value: String?): String? = value?.trim()?.takeIf(String::isNotBlank)

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
            value = selectedTeam?.toTeamDisplayLabel() ?: "Select ${label.lowercase()}",
            onValueChange = {},
            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth(),
            label = label,
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
        )

        ExposedDropdownMenu(
            expanded = expanded, onDismissRequest = { onExpandedChange(false) }) {
            DropdownMenuItem(text = { Text("None") }, onClick = { onTeamSelected(null) })

            teams.forEach { team ->
                DropdownMenuItem(text = {
                    Column {
                        Text(team.toTeamDisplayLabel())
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MatchLinkSelectionField(
    label: String,
    selectedMatchId: String?,
    options: List<Pair<String, String>>,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onMatchSelected: (String?) -> Unit,
) {
    val selectedLabel = options.firstOrNull { (id, _) -> id == selectedMatchId }?.second
        ?: "No linked match"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        PlatformTextField(
            value = selectedLabel,
            onValueChange = {},
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth(),
            label = label,
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { onExpandedChange(false) },
        ) {
            DropdownMenuItem(
                text = { Text("None") },
                onClick = { onMatchSelected(null) },
            )
            options.forEach { (id, optionLabel) ->
                DropdownMenuItem(
                    text = { Text(optionLabel) },
                    onClick = { onMatchSelected(id) },
                )
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
        modifier = Modifier.fillMaxWidth(),
        label = label,
        readOnly = true,
        trailingIcon = {
            IconButton(onClick = { showTimePicker = true }) {
                Icon(Icons.Default.AccessTime, contentDescription = "Select time")
            }
        },
        onTap = { showTimePicker = true }
    )

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
            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth(),
            label = label,
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
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
