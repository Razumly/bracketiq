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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.normalizedMatchOfficialAssignments
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.toTeamDisplayLabel
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.eventDetail.HostMatchScoreDraft
import com.razumly.mvp.eventDetail.HostMatchScoreTeam
import com.razumly.mvp.eventDetail.MatchCreateContext
import com.razumly.mvp.eventDetail.applyHostMatchConfirmation
import com.razumly.mvp.eventDetail.buildHostMatchPolicySnapshot
import com.razumly.mvp.eventDetail.buildHostMatchScoreDrafts
import com.razumly.mvp.eventDetail.buildHostMatchScorePayload
import com.razumly.mvp.eventDetail.canToggleHostMatchConfirmation
import com.razumly.mvp.eventDetail.editHostMatchScoreDraft
import com.razumly.mvp.eventDetail.hostMatchStatusLabel
import com.razumly.mvp.eventDetail.normalizeHostMatchSegmentLabel
import com.razumly.mvp.eventDetail.resizeHostMatchScoreDrafts
import com.razumly.mvp.eventDetail.resizeHostMatchTargetInputs
import com.razumly.mvp.eventDetail.data.BracketLane
import com.razumly.mvp.eventDetail.data.BracketNode
import com.razumly.mvp.eventDetail.data.filterValidNextMatchCandidates
import com.razumly.mvp.eventDetail.data.validateAndNormalizeBracketGraph
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatchEditDialog(
    match: MatchWithRelations,
    teams: List<TeamWithPlayers>,
    fields: List<FieldWithMatches>,
    allMatches: List<MatchWithRelations>,
    eventOfficials: List<EventOfficial>,
    officialPositions: List<EventOfficialPosition>,
    users: List<UserData>,
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
                eventOfficials = eventOfficials,
                officialPositions = officialPositions,
                users = users,
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
    eventOfficials: List<EventOfficial>,
    officialPositions: List<EventOfficialPosition>,
    users: List<UserData>,
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
    var actualStartTime by remember(match.match.actualStart) {
        mutableStateOf(parseInstantToken(match.match.actualStart))
    }
    var actualEndTime by remember(match.match.actualEnd) {
        mutableStateOf(parseInstantToken(match.match.actualEnd))
    }
    var winnerNextMatchId by remember(match.match.winnerNextMatchId) {
        mutableStateOf(normalizeToken(match.match.winnerNextMatchId))
    }
    var loserNextMatchId by remember(match.match.loserNextMatchId) {
        mutableStateOf(normalizeToken(match.match.loserNextMatchId))
    }
    var losersBracket by remember(match.match.losersBracket) {
        mutableStateOf(match.match.losersBracket)
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
    val initialPolicyRules = remember(match.match.id, match.match.matchRulesSnapshot, match.match.resolvedMatchRules) {
        match.match.matchRulesSnapshot
            ?: match.match.resolvedMatchRules
            ?: ResolvedMatchRulesMVP(scoringModel = "SETS", segmentCount = 1, segmentLabel = "Set")
    }
    val policyScoringModel = initialPolicyRules.scoringModel
        .trim()
        .uppercase()
        .takeIf { it in setOf("SETS", "PERIODS", "INNINGS", "POINTS_ONLY") }
        ?: "SETS"
    val isSetBasedPolicy = policyScoringModel == "SETS"
    val isTimedPolicy = !isSetBasedPolicy && (
        initialPolicyRules.timekeeping.timerMode.trim().uppercase() != "NONE" ||
            initialPolicyRules.timekeeping.segmentDurationMinutes != null
    )
    val initialSegmentCount = remember(match.match.id, initialPolicyRules) {
        if (policyScoringModel == "POINTS_ONLY") {
            1
        } else {
            maxOf(
                initialPolicyRules.segmentCount,
                match.match.segments.size,
                match.match.team1Points.size,
                match.match.team2Points.size,
                match.match.setResults.size,
                1,
            )
        }
    }
    var policySegmentLabel by remember(match.match.id, initialPolicyRules) {
        mutableStateOf(
            normalizeHostMatchSegmentLabel(
                value = initialPolicyRules.segmentLabel,
                fallback = when (policyScoringModel) {
                    "SETS" -> "Set"
                    "INNINGS" -> "Inning"
                    "POINTS_ONLY" -> "Total"
                    else -> "Period"
                },
            ),
        )
    }
    var policySegmentCount by remember(match.match.id, initialSegmentCount) {
        mutableStateOf(initialSegmentCount)
    }
    val initialPolicyTarget = initialPolicyRules.setPointTargets.firstOrNull { target -> target > 0 } ?: 21
    var policyTargetInputs by remember(match.match.id, initialPolicyRules, initialSegmentCount) {
        mutableStateOf(
            resizeHostMatchTargetInputs(
                targets = initialPolicyRules.setPointTargets.map(Int::toString),
                count = initialSegmentCount,
                fallback = initialPolicyTarget,
            ),
        )
    }
    var policySegmentMinutesText by remember(match.match.id, initialPolicyRules, initialDuration) {
        mutableStateOf(
            initialPolicyRules.timekeeping.segmentDurationMinutes
                ?.takeIf { minutes -> minutes > 0 }
                ?.toString()
                ?: initialDuration?.inWholeMinutes?.takeIf { minutes -> minutes > 0 }?.let { minutes ->
                    (minutes / initialSegmentCount.coerceAtLeast(1)).coerceAtLeast(1).toString()
                }
                .orEmpty(),
        )
    }
    var policySegmentMinutesTouched by remember(match.match.id) { mutableStateOf(false) }
    var scoreDrafts by remember(match.match.id, initialSegmentCount) {
        mutableStateOf(buildHostMatchScoreDrafts(match.match, initialSegmentCount))
    }
    var matchStarted by remember(match.match.id) {
        mutableStateOf(
            match.match.status?.trim()?.uppercase() in setOf("IN_PROGRESS", "COMPLETE") ||
                match.match.segments.any { segment -> segment.status.trim().uppercase() != "NOT_STARTED" } ||
                match.match.team1Points.any { score -> score > 0 } ||
                match.match.team2Points.any { score -> score > 0 },
        )
    }
    var resultType by remember(match.match.id) {
        mutableStateOf(
            when {
                match.match.resultType?.trim()?.uppercase() == "FORFEIT" -> "FORFEIT"
                match.match.resultType?.trim()?.uppercase() == "NO_CONTEST" ||
                    match.match.status?.trim()?.uppercase() == "CANCELLED" -> "NO_CONTEST"
                match.match.status?.trim()?.uppercase() == "SUSPENDED" -> "SUSPENDED"
                else -> "REGULATION"
            },
        )
    }
    var statusReasonText by remember(match.match.id) { mutableStateOf(match.match.statusReason.orEmpty()) }
    var forfeitingEventTeamId by remember(match.match.id) {
        mutableStateOf(
            when (match.match.winnerEventTeamId) {
                match.match.team1Id -> match.match.team2Id
                match.match.team2Id -> match.match.team1Id
                else -> null
            },
        )
    }
    var showResultTypeDropdown by remember { mutableStateOf(false) }
    var showForfeitingTeamDropdown by remember { mutableStateOf(false) }
    var policyTouched by remember(match.match.id) { mutableStateOf(false) }
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
    val usersById = remember(users) { users.associateBy(UserData::id) }
    val activeEventOfficials = remember(eventOfficials) {
        eventOfficials.filter { official -> official.isActive && official.userId.trim().isNotBlank() }
    }
    val officialSlots = remember(officialPositions, editedMatch.match.officialIds) {
        buildMatchOfficialSlots(officialPositions, editedMatch.match.officialIds)
    }

    fun updateSegmentCount(nextCount: Int) {
        val normalizedCount = if (policyScoringModel == "POINTS_ONLY") {
            1
        } else {
            nextCount.coerceAtLeast(1)
        }
        policySegmentCount = normalizedCount
        policyTargetInputs = resizeHostMatchTargetInputs(
            targets = policyTargetInputs,
            count = normalizedCount,
            fallback = initialPolicyTarget,
        )
        scoreDrafts = resizeHostMatchScoreDrafts(scoreDrafts, normalizedCount)
        policyTouched = true
    }

    fun updateOfficialAssignment(
        slot: MatchOfficialSlot,
        selectedOption: EventOfficialSelectionOption?,
    ) {
        val normalizedAssignments = editedMatch.match.officialIds
            .normalizedMatchOfficialAssignments()
            .toMutableList()
        val existingIndex = normalizedAssignments.indexOfFirst { assignment ->
            assignment.positionId == slot.positionId && assignment.slotIndex == slot.slotIndex
        }
        if (selectedOption == null) {
            if (existingIndex >= 0) {
                normalizedAssignments.removeAt(existingIndex)
            }
        } else {
            val existing = normalizedAssignments.getOrNull(existingIndex)
            val updatedAssignment = MatchOfficialAssignment(
                positionId = slot.positionId,
                slotIndex = slot.slotIndex,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = selectedOption.userId,
                eventOfficialId = selectedOption.eventOfficialId,
                checkedIn = existing?.checkedIn ?: false,
                hasConflict = existing?.hasConflict ?: false,
            )
            if (existingIndex >= 0) {
                normalizedAssignments[existingIndex] = updatedAssignment
            } else {
                normalizedAssignments += updatedAssignment
            }
        }
        val cleanedAssignments = normalizedAssignments.normalizedMatchOfficialAssignments()
        val primaryOfficial = cleanedAssignments
            .firstOrNull { assignment -> assignment.holderType == OfficialAssignmentHolderType.OFFICIAL }
        editedMatch = editedMatch.copy(
            match = editedMatch.match.copy(
                officialIds = cleanedAssignments,
                officialId = primaryOfficial?.userId,
            ),
        )
    }

    fun updateOfficialCheckIn(slot: MatchOfficialSlot, checkedIn: Boolean) {
        val updatedAssignments = editedMatch.match.officialIds
            .normalizedMatchOfficialAssignments()
            .map { assignment ->
                if (
                    assignment.positionId == slot.positionId &&
                    assignment.slotIndex == slot.slotIndex &&
                    assignment.holderType == OfficialAssignmentHolderType.OFFICIAL
                ) {
                    assignment.copy(checkedIn = checkedIn)
                } else {
                    assignment
                }
            }
            .normalizedMatchOfficialAssignments()
        val primaryOfficial = updatedAssignments
            .firstOrNull { assignment -> assignment.holderType == OfficialAssignmentHolderType.OFFICIAL }
        editedMatch = editedMatch.copy(
            match = editedMatch.match.copy(
                officialIds = updatedAssignments,
                officialId = primaryOfficial?.userId,
            ),
        )
    }

    LaunchedEffect(
        editedMatch.match.team1Id,
        editedMatch.match.team2Id,
        editedMatch.match.fieldId,
        startTime,
        endTime,
        actualStartTime,
        actualEndTime,
        winnerNextMatchId,
        loserNextMatchId,
        losersBracket,
        policySegmentLabel,
        policySegmentCount,
        policyTargetInputs,
        policySegmentMinutesText,
        scoreDrafts,
        matchStarted,
        resultType,
        forfeitingEventTeamId,
        statusReasonText,
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
            modifier = Modifier.weight(1f).testTag("match-edit-content"),
            verticalArrangement = Arrangement.spacedBy(16.dp)
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

            if (officialSlots.isNotEmpty()) {
                item {
                    Text(
                        text = "Event Officials",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
                items(officialSlots.size, key = { index -> officialSlots[index].key }) { index ->
                    val slot = officialSlots[index]
                    val currentAssignment = editedMatch.match.officialIds
                        .normalizedMatchOfficialAssignments()
                        .firstOrNull { assignment ->
                            assignment.positionId == slot.positionId &&
                                assignment.slotIndex == slot.slotIndex &&
                                assignment.holderType == OfficialAssignmentHolderType.OFFICIAL
                        }
                    val options = buildEventOfficialSelectionOptions(
                        slot = slot,
                        eventOfficials = activeEventOfficials,
                        usersById = usersById,
                    )
                    val selectedOption = currentAssignment?.eventOfficialId?.let { selectedId ->
                        options.firstOrNull { option -> option.eventOfficialId == selectedId }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        EventOfficialSelectionField(
                            label = slot.label,
                            selectedOption = selectedOption,
                            options = options,
                            onOptionSelected = { selected ->
                                updateOfficialAssignment(
                                    slot = slot,
                                    selectedOption = selected,
                                )
                            },
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(
                                checked = currentAssignment?.checkedIn == true,
                                enabled = currentAssignment != null,
                                onCheckedChange = { checkedIn ->
                                    updateOfficialCheckIn(slot, checkedIn)
                                },
                            )
                            Text(
                                text = "Checked in",
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (currentAssignment == null) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                            )
                        }
                    }
                }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TeamSelectionField(
                        label = "Officiating team",
                        selectedTeam = teams.find { it.team.id == editedMatch.match.teamOfficialId },
                        expanded = showRefDropdown,
                        onExpandedChange = { showRefDropdown = it },
                        teams = teams,
                        onTeamSelected = { team ->
                            editedMatch = editedMatch.copy(
                                match = editedMatch.match.copy(
                                    teamOfficialId = team?.team?.id,
                                    officialCheckedIn = if (team == null) false else editedMatch.match.officialCheckedIn,
                                ),
                            )
                            showRefDropdown = false
                        },
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = editedMatch.match.officialCheckedIn == true,
                            enabled = !editedMatch.match.teamOfficialId.isNullOrBlank(),
                            onCheckedChange = { checkedIn ->
                                editedMatch = editedMatch.copy(
                                    match = editedMatch.match.copy(officialCheckedIn = checkedIn),
                                )
                            },
                        )
                        Text(
                            text = "Officiating team checked in",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }

            item {
                Text(
                    text = "Match Rules",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    StandardTextField(
                        value = policySegmentLabel,
                        onValueChange = { value ->
                            policySegmentLabel = value
                            policyTouched = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = "Segment label",
                        placeholder = "Set, half, quarter, inning...",
                    )
                    NumericStepperField(
                        label = "${normalizeHostMatchSegmentLabel(policySegmentLabel, "Segment")} count",
                        value = policySegmentCount,
                        minimum = 1,
                        enabled = policyScoringModel != "POINTS_ONLY",
                        onValueChange = ::updateSegmentCount,
                    )
                    if (isSetBasedPolicy) {
                        Text(
                            text = "Score limits",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        policyTargetInputs.forEachIndexed { index, targetInput ->
                            StandardTextField(
                                value = targetInput,
                                onValueChange = { value ->
                                    val nextInputs = policyTargetInputs.toMutableList()
                                    nextInputs[index] = value.filter(Char::isDigit)
                                    policyTargetInputs = nextInputs
                                    policyTouched = true
                                },
                                modifier = Modifier.fillMaxWidth(),
                                label = "${normalizeHostMatchSegmentLabel(policySegmentLabel, "Set")} ${index + 1} score limit",
                                keyboardType = "number",
                                placeholder = initialPolicyTarget.toString(),
                            )
                        }
                    }
                    if (isTimedPolicy) {
                        NumericStepperField(
                            label = "Segment length (min)",
                            value = policySegmentMinutesText.toIntOrNull() ?: 0,
                            minimum = 1,
                            onValueChange = { minutes ->
                                policySegmentMinutesText = minutes.toString()
                                policySegmentMinutesTouched = true
                                policyTouched = true
                            },
                            onTextValueChange = { value ->
                                policySegmentMinutesText = value.filter(Char::isDigit)
                                policySegmentMinutesTouched = true
                                policyTouched = true
                            },
                        )
                    }
                }
            }

            item {
                Text(
                    text = "Match State",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                )
            }

            item {
                val activeRules = initialPolicyRules.copy(
                    segmentCount = policySegmentCount,
                    segmentLabel = normalizeHostMatchSegmentLabel(policySegmentLabel, "Segment"),
                    setPointTargets = policyTargetInputs.mapNotNull { target -> target.toIntOrNull() },
                )
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Status: ${hostMatchStatusLabel(scoreDrafts, activeRules, matchStarted, resultType)}",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    MatchResultTypeSelectionField(
                        selectedResultType = resultType,
                        expanded = showResultTypeDropdown,
                        onExpandedChange = { showResultTypeDropdown = it },
                        onResultTypeSelected = { selectedResultType ->
                            resultType = selectedResultType
                            if (selectedResultType != "FORFEIT") forfeitingEventTeamId = null
                            if (selectedResultType != "REGULATION") matchStarted = false
                            showResultTypeDropdown = false
                        },
                    )
                    if (resultType == "FORFEIT") {
                        ForfeitingTeamSelectionField(
                            selectedTeamId = forfeitingEventTeamId,
                            team1Id = editedMatch.match.team1Id,
                            team1Name = teams.find { it.team.id == editedMatch.match.team1Id }
                                ?.toTeamDisplayLabel() ?: "Team 1",
                            team2Id = editedMatch.match.team2Id,
                            team2Name = teams.find { it.team.id == editedMatch.match.team2Id }
                                ?.toTeamDisplayLabel() ?: "Team 2",
                            expanded = showForfeitingTeamDropdown,
                            onExpandedChange = { showForfeitingTeamDropdown = it },
                            onTeamSelected = { teamId ->
                                forfeitingEventTeamId = teamId
                                showForfeitingTeamDropdown = false
                            },
                        )
                    }
                    if (resultType != "REGULATION") {
                        StandardTextField(
                            value = statusReasonText,
                            onValueChange = { statusReasonText = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = "Reason",
                            placeholder = "Optional note",
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = matchStarted,
                            enabled = resultType == "REGULATION",
                            onCheckedChange = { started ->
                                matchStarted = started
                                if (!started) {
                                    scoreDrafts = scoreDrafts.map { draft -> draft.copy(confirmed = false) }
                                }
                            },
                        )
                        Text("Match started")
                    }
                }
            }

            item {
                Text(
                    text = if (isSetBasedPolicy) {
                        "Scores & ${normalizeHostMatchSegmentLabel(policySegmentLabel, "Segment").lowercase()} confirmation"
                    } else {
                        "Scores & ${normalizeHostMatchSegmentLabel(policySegmentLabel, "Segment").lowercase()} state"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                )
            }

            items(scoreDrafts.size, key = { index -> scoreDrafts[index].sequence }) { index ->
                val draft = scoreDrafts[index]
                val pointTargets = policyTargetInputs.mapNotNull { target -> target.toIntOrNull() }
                HostMatchScoreEditor(
                    segmentLabel = normalizeHostMatchSegmentLabel(policySegmentLabel, "Segment"),
                    draft = draft,
                    team1Name = teams.find { it.team.id == editedMatch.match.team1Id }
                        ?.toTeamDisplayLabel() ?: "Team 1",
                    team2Name = teams.find { it.team.id == editedMatch.match.team2Id }
                        ?.toTeamDisplayLabel() ?: "Team 2",
                    scoresEnabled = resultType == "REGULATION",
                    confirmationEnabled = resultType == "REGULATION" &&
                        (draft.confirmed || canToggleHostMatchConfirmation(scoreDrafts, index, matchStarted)),
                    confirmationLabel = if (isSetBasedPolicy) "Confirmed" else "Complete",
                    onTeam1ScoreChange = { score ->
                        scoreDrafts = editHostMatchScoreDraft(
                            drafts = scoreDrafts,
                            index = index,
                            team = HostMatchScoreTeam.TEAM1,
                            score = score,
                        )
                    },
                    onTeam2ScoreChange = { score ->
                        scoreDrafts = editHostMatchScoreDraft(
                            drafts = scoreDrafts,
                            index = index,
                            team = HostMatchScoreTeam.TEAM2,
                            score = score,
                        )
                    },
                    onConfirmationChange = { confirmed ->
                        val confirmation = applyHostMatchConfirmation(
                            drafts = scoreDrafts,
                            index = index,
                            checked = confirmed,
                            scoringModel = policyScoringModel,
                            pointTargets = pointTargets,
                            supportsDraw = initialPolicyRules.supportsDraw,
                        )
                        if (confirmation.errorMessage != null) {
                            validationError = confirmation.errorMessage
                        } else {
                            scoreDrafts = confirmation.drafts
                        }
                    },
                )
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
                Text(
                    text = "Actual Times",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            item {
                TimePickerField(
                    label = "Actual Start Time",
                    selectedTime = actualStartTime,
                    onTimeSelected = { newActualStartTime ->
                        actualStartTime = newActualStartTime
                    },
                    canSelectPast = true,
                    onTimeCleared = {
                        actualStartTime = null
                    },
                )
            }

            item {
                TimePickerField(
                    label = "Actual End Time",
                    selectedTime = actualEndTime,
                    onTimeSelected = { newActualEndTime ->
                        actualEndTime = newActualEndTime
                    },
                    canSelectPast = true,
                    onTimeCleared = {
                        actualEndTime = null
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            text = "Place match in losers bracket",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            text = if (losersBracket) {
                                "Currently: Losers Bracket"
                            } else {
                                "Currently: Winners Bracket"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Checkbox(
                        checked = losersBracket,
                        onCheckedChange = { isLosersBracket ->
                            losersBracket = isLosersBracket
                            editedMatch = editedMatch.copy(
                                match = editedMatch.match.copy(losersBracket = isLosersBracket)
                            )
                        }
                    )
                }
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
                        if (!selectedId.isNullOrBlank() && normalizeToken(loserNextMatchId) == selectedId) {
                            loserNextMatchId = null
                        }
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
                        if (!selectedId.isNullOrBlank() && normalizeToken(winnerNextMatchId) == selectedId) {
                            winnerNextMatchId = null
                        }
                        showLoserNextDropdown = false
                    },
                )
            }

            item {
                Text(
                    text = "Match details preview",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                )
            }

            item {
                val activeRules = initialPolicyRules.copy(
                    segmentCount = policySegmentCount,
                    segmentLabel = normalizeHostMatchSegmentLabel(policySegmentLabel, "Segment"),
                    setPointTargets = policyTargetInputs.mapNotNull { target -> target.toIntOrNull() },
                )
                HostMatchDetailsPreview(
                    team1Name = teams.find { it.team.id == editedMatch.match.team1Id }
                        ?.toTeamDisplayLabel() ?: "Team 1",
                    team2Name = teams.find { it.team.id == editedMatch.match.team2Id }
                        ?.toTeamDisplayLabel() ?: "Team 2",
                    segmentLabel = normalizeHostMatchSegmentLabel(policySegmentLabel, "Segment"),
                    drafts = scoreDrafts,
                    status = hostMatchStatusLabel(scoreDrafts, activeRules, matchStarted, resultType),
                    scoringModel = policyScoringModel,
                    fieldLabel = fields.find { field -> field.field.id == editedMatch.match.fieldId }
                        ?.field?.fieldNumber?.let { fieldNumber -> "Field $fieldNumber" },
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
                    Text("Delete")
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
                    if (actualStartTime != null && actualEndTime != null && actualEndTime!! <= actualStartTime!!) {
                        validationError = "Actual end time must be after actual start time."
                        return@Button
                    }

                    val resolvedWinnerNext = selectedWinnerNext
                    val resolvedLoserNext = selectedLoserNext?.takeIf { candidate ->
                        candidate != resolvedWinnerNext
                    }

                    val validationNodes = bracketNodes.map { node ->
                        if (node.id != currentMatchId) {
                            node
                        } else {
                            node.copy(
                                winnerNextMatchId = resolvedWinnerNext,
                                loserNextMatchId = resolvedLoserNext,
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
                            !resolvedWinnerNext.isNullOrBlank() ||
                                !resolvedLoserNext.isNullOrBlank() ||
                                !normalizeToken(normalizedNode?.previousLeftId).isNullOrBlank() ||
                                !normalizeToken(normalizedNode?.previousRightId).isNullOrBlank()
                        if (!hasAnyLink) {
                            validationError = "Tournament match creation requires at least one bracket link."
                            return@Button
                        }
                    }

                    if (resultType == "FORFEIT" && forfeitingEventTeamId.isNullOrBlank()) {
                        validationError = "Select the forfeiting team."
                        return@Button
                    }

                    val policyBuild = buildHostMatchPolicySnapshot(
                        baseRules = initialPolicyRules,
                        segmentLabel = policySegmentLabel,
                        segmentCount = policySegmentCount,
                        targetInputs = policyTargetInputs,
                        segmentDurationMinutes = policySegmentMinutesText.toIntOrNull(),
                        segmentDurationTouched = policySegmentMinutesTouched,
                    )
                    if (policyBuild.errorMessage != null || policyBuild.snapshot == null) {
                        validationError = policyBuild.errorMessage ?: "Match rules are invalid."
                        return@Button
                    }
                    val activePolicyRules = policyBuild.snapshot
                    val scheduledMatch = editedMatch.match.copy(
                        start = startTime,
                        end = endTime,
                        actualStart = actualStartTime?.toString(),
                        actualEnd = actualEndTime?.toString(),
                        losersBracket = losersBracket,
                        winnerNextMatchId = resolvedWinnerNext,
                        loserNextMatchId = resolvedLoserNext,
                    )
                    val scoredMatch = buildHostMatchScorePayload(
                        match = scheduledMatch,
                        drafts = scoreDrafts,
                        rules = activePolicyRules,
                        matchStarted = matchStarted,
                        resultType = resultType,
                        forfeitingEventTeamId = forfeitingEventTeamId,
                        statusReason = statusReasonText,
                        exceptionalActualEnd = Clock.System.now().toString(),
                    )
                    val shouldPersistPolicySnapshot = policyTouched ||
                        editedMatch.match.matchRulesSnapshot != null
                    val nextMatch = scoredMatch.copy(
                        matchRulesSnapshot = if (shouldPersistPolicySnapshot) {
                            activePolicyRules
                        } else {
                            editedMatch.match.matchRulesSnapshot
                        },
                        resolvedMatchRules = activePolicyRules,
                    )
                    onConfirm(editedMatch.copy(match = nextMatch))
                    onDismissRequest()
                }, modifier = Modifier.weight(1f)
            ) {
                Text("Save")
            }
        }
    }
}

@Composable
private fun NumericStepperField(
    label: String,
    value: Int,
    minimum: Int,
    enabled: Boolean = true,
    onValueChange: (Int) -> Unit,
    onTextValueChange: ((String) -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = { onValueChange((value - 1).coerceAtLeast(minimum)) },
            enabled = enabled && value > minimum,
        ) {
            Icon(Icons.Default.Remove, contentDescription = "Decrease $label")
        }
        StandardTextField(
            value = if (value <= 0) "" else value.toString(),
            onValueChange = { nextValue ->
                val filtered = nextValue.filter(Char::isDigit)
                if (onTextValueChange != null) {
                    onTextValueChange(filtered)
                } else {
                    filtered.toIntOrNull()?.takeIf { next -> next >= minimum }?.let(onValueChange)
                }
            },
            modifier = Modifier.weight(1f),
            label = label,
            keyboardType = "number",
            enabled = enabled,
        )
        IconButton(
            onClick = { onValueChange(value.coerceAtLeast(minimum - 1) + 1) },
            enabled = enabled,
        ) {
            Icon(Icons.Default.Add, contentDescription = "Increase $label")
        }
    }
}

@Composable
private fun HostMatchScoreEditor(
    segmentLabel: String,
    draft: HostMatchScoreDraft,
    team1Name: String,
    team2Name: String,
    scoresEnabled: Boolean,
    confirmationEnabled: Boolean,
    confirmationLabel: String,
    onTeam1ScoreChange: (Int) -> Unit,
    onTeam2ScoreChange: (Int) -> Unit,
    onConfirmationChange: (Boolean) -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "$segmentLabel ${draft.sequence}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StandardTextField(
                    value = draft.team1Score.toString(),
                    onValueChange = { value ->
                        onTeam1ScoreChange(value.filter(Char::isDigit).toIntOrNull() ?: 0)
                    },
                    modifier = Modifier.weight(1f),
                    label = team1Name,
                    keyboardType = "number",
                    enabled = scoresEnabled,
                )
                StandardTextField(
                    value = draft.team2Score.toString(),
                    onValueChange = { value ->
                        onTeam2ScoreChange(value.filter(Char::isDigit).toIntOrNull() ?: 0)
                    },
                    modifier = Modifier.weight(1f),
                    label = team2Name,
                    keyboardType = "number",
                    enabled = scoresEnabled,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = draft.confirmed,
                    enabled = confirmationEnabled,
                    onCheckedChange = onConfirmationChange,
                    modifier = Modifier.semantics {
                        contentDescription = "$segmentLabel ${draft.sequence} confirmation"
                    },
                )
                Text(
                    text = confirmationLabel,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MatchResultTypeSelectionField(
    selectedResultType: String,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onResultTypeSelected: (String) -> Unit,
) {
    val options = listOf(
        "REGULATION" to "Regulation result",
        "FORFEIT" to "Forfeit",
        "NO_CONTEST" to "No contest / cancelled",
        "SUSPENDED" to "Suspended",
    )
    val selectedLabel = options.firstOrNull { option -> option.first == selectedResultType }?.second
        ?: options.first().second
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        StandardTextField(
            value = selectedLabel,
            onValueChange = {},
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth(),
            label = "Result type",
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { onExpandedChange(false) },
        ) {
            options.forEach { (value, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = { onResultTypeSelected(value) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ForfeitingTeamSelectionField(
    selectedTeamId: String?,
    team1Id: String?,
    team1Name: String,
    team2Id: String?,
    team2Name: String,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onTeamSelected: (String?) -> Unit,
) {
    val options = listOfNotNull(
        team1Id?.takeIf(String::isNotBlank)?.let { teamId -> teamId to team1Name },
        team2Id?.takeIf(String::isNotBlank)?.let { teamId -> teamId to team2Name },
    )
    val selectedLabel = options.firstOrNull { option -> option.first == selectedTeamId }?.second
        ?: "Select team"
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        StandardTextField(
            value = selectedLabel,
            onValueChange = {},
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth(),
            label = "Forfeiting team",
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { onExpandedChange(false) },
        ) {
            options.forEach { (teamId, teamName) ->
                DropdownMenuItem(
                    text = { Text(teamName) },
                    onClick = { onTeamSelected(teamId) },
                )
            }
        }
    }
}

@Composable
private fun HostMatchDetailsPreview(
    team1Name: String,
    team2Name: String,
    segmentLabel: String,
    drafts: List<HostMatchScoreDraft>,
    status: String,
    scoringModel: String,
    fieldLabel: String?,
) {
    val team1Total: Int
    val team2Total: Int
    if (scoringModel == "SETS") {
        team1Total = drafts.count { draft -> draft.confirmed && draft.team1Score > draft.team2Score }
        team2Total = drafts.count { draft -> draft.confirmed && draft.team2Score > draft.team1Score }
    } else {
        team1Total = drafts.sumOf(HostMatchScoreDraft::team1Score)
        team2Total = drafts.sumOf(HostMatchScoreDraft::team2Score)
    }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(status, style = MaterialTheme.typography.labelLarge)
                fieldLabel?.let { Text(it, style = MaterialTheme.typography.labelMedium) }
            }
            Text(
                text = "$team1Name  $team1Total – $team2Total  $team2Name",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            drafts.forEach { draft ->
                Text(
                    text = "$segmentLabel ${draft.sequence}: ${draft.team1Score} – ${draft.team2Score}" +
                        if (draft.confirmed) "  • Confirmed" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private data class MatchOfficialSlot(
    val key: String,
    val positionId: String,
    val slotIndex: Int,
    val label: String,
)

private data class EventOfficialSelectionOption(
    val eventOfficialId: String,
    val userId: String,
    val label: String,
)

private fun buildMatchOfficialSlots(
    officialPositions: List<EventOfficialPosition>,
    existingAssignments: List<MatchOfficialAssignment>,
): List<MatchOfficialSlot> {
    val normalizedPositions = officialPositions
        .sortedBy(EventOfficialPosition::order)
        .filter { position -> position.id.trim().isNotBlank() && position.name.trim().isNotBlank() }
    if (normalizedPositions.isNotEmpty()) {
        return normalizedPositions.flatMap { position ->
            val count = position.count.coerceAtLeast(1)
            (0 until count).map { slotIndex ->
                MatchOfficialSlot(
                    key = "${position.id}:$slotIndex",
                    positionId = position.id,
                    slotIndex = slotIndex,
                    label = if (count > 1) {
                        "${position.name} ${slotIndex + 1}"
                    } else {
                        position.name
                    },
                )
            }
        }
    }
    val fallbackAssignments = existingAssignments
        .normalizedMatchOfficialAssignments()
        .sortedWith(
            compareBy<MatchOfficialAssignment>({ it.positionId }, { it.slotIndex })
        )
    if (fallbackAssignments.isEmpty()) {
        return emptyList()
    }
    return fallbackAssignments.map { assignment ->
        MatchOfficialSlot(
            key = "${assignment.positionId}:${assignment.slotIndex}",
            positionId = assignment.positionId,
            slotIndex = assignment.slotIndex,
            label = "Official ${assignment.slotIndex + 1}",
        )
    }
}

private fun buildEventOfficialSelectionOptions(
    slot: MatchOfficialSlot,
    eventOfficials: List<EventOfficial>,
    usersById: Map<String, UserData>,
): List<EventOfficialSelectionOption> {
    return eventOfficials
        .map { official ->
            val userName = usersById[official.userId]?.fullName ?: official.userId
            val eligibleForSlot = official.positionIds.contains(slot.positionId)
            EventOfficialSelectionOption(
                eventOfficialId = official.id,
                userId = official.userId,
                label = if (eligibleForSlot) {
                    userName
                } else {
                    "$userName (not eligible)"
                },
            ) to eligibleForSlot
        }
        .sortedWith(
            compareByDescending<Pair<EventOfficialSelectionOption, Boolean>> { pair -> pair.second }
                .thenBy { pair -> pair.first.label.lowercase() }
        )
        .map(Pair<EventOfficialSelectionOption, Boolean>::first)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EventOfficialSelectionField(
    label: String,
    selectedOption: EventOfficialSelectionOption?,
    options: List<EventOfficialSelectionOption>,
    onOptionSelected: (EventOfficialSelectionOption?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        StandardTextField(
            value = selectedOption?.label ?: "Unassigned",
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
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text("Unassigned") },
                onClick = {
                    onOptionSelected(null)
                    expanded = false
                },
            )
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                        onOptionSelected(option)
                        expanded = false
                    },
                )
            }
        }
    }
}

private fun normalizeToken(value: String?): String? = value?.trim()?.takeIf(String::isNotBlank)

private fun parseInstantToken(value: String?): Instant? =
    normalizeToken(value)?.let { token -> runCatching { Instant.parse(token) }.getOrNull() }

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
        StandardTextField(
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
        StandardTextField(
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
    label: String,
    selectedTime: Instant?,
    onTimeSelected: (Instant) -> Unit,
    canSelectPast: Boolean = false,
    onTimeCleared: (() -> Unit)? = null,
) {
    var showTimePicker by remember { mutableStateOf(false) }

    StandardTextField(
        value = selectedTime?.toLocalDateTime(TimeZone.currentSystemDefault())
            ?.format(dateTimeFormat) ?: "Select time",
        onValueChange = {},
        modifier = Modifier.fillMaxWidth(),
        label = label,
        readOnly = true,
        trailingIcon = {
            Row {
                if (selectedTime != null && onTimeCleared != null) {
                    IconButton(onClick = onTimeCleared) {
                        Icon(Icons.Default.Remove, contentDescription = "Clear time")
                    }
                }
                IconButton(onClick = { showTimePicker = true }) {
                    Icon(Icons.Default.AccessTime, contentDescription = "Select time")
                }
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
            canSelectPast = canSelectPast,
            initialDate = selectedTime,
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
        StandardTextField(
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
