@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Composable
internal fun ExpandedMatchDetailsPanel(
    visible: Boolean,
    match: MatchMVP,
    team1: TeamWithRelations?,
    team2: TeamWithRelations?,
    showSegmentBreakdown: Boolean,
    orderedSegments: List<MatchSegmentMVP>,
    segmentBaseLabel: String,
    officialRows: List<MatchOfficialDetailRow>,
    visibleIncidents: List<MatchIncidentMVP>,
    isOfficial: Boolean,
    officialCheckedIn: Boolean,
    editingActualTimes: Boolean,
    actualStartDraft: Instant?,
    actualEndDraft: Instant?,
    actualTimeError: String?,
    matchTimeSaving: Boolean,
    canEditRoster: Boolean,
    onEditRoster: () -> Unit,
    showMatchTeamCheckIns: Boolean,
    team1Name: String,
    team1CheckedIn: Boolean,
    team2Name: String,
    team2CheckedIn: Boolean,
    canUseMatchStatusActions: Boolean,
    canUsePreStartMatchActions: Boolean,
    canSuspendMatch: Boolean,
    canResumeMatch: Boolean,
    matchActionSaving: Boolean,
    onForfeitClick: () -> Unit,
    onCancelMatchClick: () -> Unit,
    onSuspendMatchClick: () -> Unit,
    onResumeMatchClick: () -> Unit,
    onEditActualTimes: () -> Unit,
    onActualStartSelected: (Instant) -> Unit,
    onActualEndSelected: (Instant) -> Unit,
    onActualStartCleared: () -> Unit,
    onActualEndCleared: () -> Unit,
    onCancelActualTimes: () -> Unit,
    onSaveActualTimes: () -> Unit,
    onSegmentSelected: (Int) -> Unit,
    incidentLabel: (String) -> String,
    onRemoveIncident: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = expandVertically(),
        exit = shrinkVertically(),
        modifier = modifier.fillMaxWidth(),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            tonalElevation = 3.dp,
            shadowElevation = 6.dp,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Match Details",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                MatchStatusSection(match = match)
                if (showMatchTeamCheckIns) {
                    MatchDetailsTeamCheckInSection(
                        team1Name = team1Name,
                        team1CheckedIn = team1CheckedIn,
                        team2Name = team2Name,
                        team2CheckedIn = team2CheckedIn,
                    )
                }
                if (canUseMatchStatusActions) {
                    MatchDetailsActionsSection(
                        canUsePreStartMatchActions = canUsePreStartMatchActions,
                        canSuspendMatch = canSuspendMatch,
                        canResumeMatch = canResumeMatch,
                        matchActionSaving = matchActionSaving,
                        onForfeitClick = onForfeitClick,
                        onCancelMatchClick = onCancelMatchClick,
                        onSuspendMatchClick = onSuspendMatchClick,
                        onResumeMatchClick = onResumeMatchClick,
                    )
                }
                if (canEditRoster) {
                    Button(onClick = onEditRoster) {
                        Text("Edit roster")
                    }
                }
                MatchActualTimesSection(
                    match = match,
                    isOfficial = isOfficial,
                    officialCheckedIn = officialCheckedIn,
                    editingActualTimes = editingActualTimes,
                    actualStartDraft = actualStartDraft,
                    actualEndDraft = actualEndDraft,
                    actualTimeError = actualTimeError,
                    matchTimeSaving = matchTimeSaving,
                    onEditActualTimes = onEditActualTimes,
                    onActualStartSelected = onActualStartSelected,
                    onActualEndSelected = onActualEndSelected,
                    onActualStartCleared = onActualStartCleared,
                    onActualEndCleared = onActualEndCleared,
                    onCancelActualTimes = onCancelActualTimes,
                    onSaveActualTimes = onSaveActualTimes,
                )
                if (showSegmentBreakdown) {
                    MatchSegmentTable(
                        segments = orderedSegments,
                        segmentLabel = segmentBaseLabel,
                        team1Id = match.team1Id,
                        team2Id = match.team2Id,
                        team1Scores = match.team1Points,
                        team2Scores = match.team2Points,
                        team1Name = team1Name,
                        team2Name = team2Name,
                        matchWinnerEventTeamId = match.winnerEventTeamId,
                        onSegmentSelected = onSegmentSelected,
                    )
                }
                MatchOfficialsSection(officialRows = officialRows)
                MatchLogSection(
                    incidents = visibleIncidents,
                    team1 = team1,
                    team2 = team2,
                    incidentLabel = incidentLabel,
                    canRemove = isOfficial && officialCheckedIn,
                    onRemoveIncident = onRemoveIncident,
                )
            }
        }
    }
}

@Composable
private fun MatchDetailsTeamCheckInSection(
    team1Name: String,
    team1CheckedIn: Boolean,
    team2Name: String,
    team2CheckedIn: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = "Team check-ins",
            style = MaterialTheme.typography.titleSmall,
        )
        MatchDetailsTeamCheckInRow(teamName = team1Name, checkedIn = team1CheckedIn)
        MatchDetailsTeamCheckInRow(teamName = team2Name, checkedIn = team2CheckedIn)
    }
}

@Composable
private fun MatchDetailsTeamCheckInRow(
    teamName: String,
    checkedIn: Boolean,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = if (checkedIn) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
        },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = teamName,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = if (checkedIn) "Checked in" else "Not checked in",
                style = MaterialTheme.typography.labelSmall,
                color = if (checkedIn) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Composable
private fun MatchDetailsActionsSection(
    canUsePreStartMatchActions: Boolean,
    canSuspendMatch: Boolean,
    canResumeMatch: Boolean,
    matchActionSaving: Boolean,
    onForfeitClick: () -> Unit,
    onCancelMatchClick: () -> Unit,
    onSuspendMatchClick: () -> Unit,
    onResumeMatchClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = "Match actions",
            style = MaterialTheme.typography.titleSmall,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (canUsePreStartMatchActions) {
                MatchDetailsActionButton(
                    label = "Forfeit",
                    onClick = onForfeitClick,
                    enabled = !matchActionSaving,
                    modifier = Modifier.weight(1f),
                )
                MatchDetailsActionButton(
                    label = "Cancel",
                    onClick = onCancelMatchClick,
                    enabled = !matchActionSaving,
                    modifier = Modifier.weight(1f),
                )
            }
            if (canSuspendMatch) {
                MatchDetailsActionButton(
                    label = "Suspend",
                    onClick = onSuspendMatchClick,
                    enabled = !matchActionSaving,
                    modifier = Modifier.weight(1f),
                )
            }
            if (canResumeMatch) {
                MatchDetailsActionButton(
                    label = "Resume",
                    onClick = onResumeMatchClick,
                    enabled = !matchActionSaving,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun MatchDetailsActionButton(
    label: String,
    onClick: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
    ) {
        Text(
            text = label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun MatchStatusSection(match: MatchMVP) {
    if (!shouldShowMatchStatusBlock(match)) {
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = "Status",
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = titleCaseMatchValue(match.resultStatus ?: match.status ?: "Pending")
                .ifBlank { "Pending" },
            style = MaterialTheme.typography.bodySmall,
        )
        match.resultType
            ?.let(::titleCaseMatchValue)
            ?.takeIf(String::isNotBlank)
            ?.let { result ->
                Text(
                    text = "Result: $result",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        match.statusReason
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { reason ->
                Text(
                    text = reason,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
    }
}

@Composable
private fun MatchActualTimesSection(
    match: MatchMVP,
    isOfficial: Boolean,
    officialCheckedIn: Boolean,
    editingActualTimes: Boolean,
    actualStartDraft: Instant?,
    actualEndDraft: Instant?,
    actualTimeError: String?,
    matchTimeSaving: Boolean,
    onEditActualTimes: () -> Unit,
    onActualStartSelected: (Instant) -> Unit,
    onActualEndSelected: (Instant) -> Unit,
    onActualStartCleared: () -> Unit,
    onActualEndCleared: () -> Unit,
    onCancelActualTimes: () -> Unit,
    onSaveActualTimes: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Actual Times",
                style = MaterialTheme.typography.titleSmall,
            )
            if (isOfficial && officialCheckedIn && !editingActualTimes) {
                TextButton(onClick = onEditActualTimes) {
                    Text("Edit Times")
                }
            }
        }
        if (editingActualTimes) {
            actualTimeError?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            MatchActualTimeField(
                label = "Actual start",
                selectedTime = actualStartDraft,
                onTimeSelected = onActualStartSelected,
                onTimeCleared = onActualStartCleared,
            )
            MatchActualTimeField(
                label = "Actual end",
                selectedTime = actualEndDraft,
                onTimeSelected = onActualEndSelected,
                onTimeCleared = onActualEndCleared,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = onCancelActualTimes,
                    enabled = !matchTimeSaving,
                ) {
                    Text("Cancel")
                }
                Button(
                    onClick = onSaveActualTimes,
                    enabled = !matchTimeSaving,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (matchTimeSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        }
                        Text("Save Times")
                    }
                }
            }
        } else {
            Text(
                text = "Start: ${actualTimeLabel(match.actualStart)}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = "End: ${actualTimeLabel(match.actualEnd)}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun MatchOfficialsSection(officialRows: List<MatchOfficialDetailRow>) {
    Text(
        text = "Officials",
        style = MaterialTheme.typography.titleSmall,
    )
    if (officialRows.isEmpty()) {
        Text("No official slots assigned.", style = MaterialTheme.typography.bodySmall)
    } else {
        officialRows.forEach { official ->
            Text(
                text = "${official.positionLabel}: ${official.officialName} (${if (official.checkedIn) "checked in" else "not checked in"})",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun MatchLogSection(
    incidents: List<MatchIncidentMVP>,
    team1: TeamWithRelations?,
    team2: TeamWithRelations?,
    incidentLabel: (String) -> String,
    canRemove: Boolean,
    onRemoveIncident: (String) -> Unit,
) {
    Text(
        text = "Match Log",
        style = MaterialTheme.typography.titleSmall,
    )
    if (incidents.isEmpty()) {
        Text("No match details recorded.", style = MaterialTheme.typography.bodySmall)
    } else {
        incidents.sortedBy { incident -> incident.sequence }.forEach { incident ->
            MatchIncidentCard(
                summary = buildIncidentSummary(
                    incident = incident,
                    team1 = team1,
                    team2 = team2,
                    incidentLabel = incidentLabel,
                ),
                canRemove = canRemove,
                onRemove = { onRemoveIncident(incident.id) },
            )
        }
    }
}

@Composable
private fun MatchActualTimeField(
    label: String,
    selectedTime: Instant?,
    onTimeSelected: (Instant) -> Unit,
    onTimeCleared: () -> Unit,
) {
    var showPicker by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Button(
            onClick = { showPicker = true },
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = "$label: ${
                    selectedTime
                        ?.toLocalDateTime(TimeZone.currentSystemDefault())
                        ?.format(dateTimeFormat)
                        ?: "Not set"
                }",
                textAlign = TextAlign.Start,
            )
        }
        TextButton(onClick = onTimeCleared) {
            Text("Clear")
        }
    }

    if (showPicker) {
        PlatformDateTimePicker(
            onDateSelected = { instant ->
                instant?.let(onTimeSelected)
                showPicker = false
            },
            onDismissRequest = { showPicker = false },
            showPicker = showPicker,
            getTime = true,
            canSelectPast = true,
            initialDate = selectedTime,
        )
    }
}

@Composable
internal fun MatchSegmentTable(
    segments: List<MatchSegmentMVP>,
    segmentLabel: String,
    team1Id: String?,
    team2Id: String?,
    team1Scores: List<Int>,
    team2Scores: List<Int>,
    team1Name: String,
    team2Name: String,
    matchWinnerEventTeamId: String? = null,
    onSegmentSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (segments.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        segments.forEachIndexed { index, segment ->
            val isActive = segment.isStarted
            val isComplete = segment.status.equals("COMPLETE", ignoreCase = true)
            val team1Score = segmentScore(
                segment = segment,
                teamId = team1Id,
                fallbackScores = team1Scores,
                index = index,
            )
            val team2Score = segmentScore(
                segment = segment,
                teamId = team2Id,
                fallbackScores = team2Scores,
                index = index,
            )
            val segmentWinnerEventTeamId = resolveSegmentWinnerEventTeamId(
                segment = segment,
                team1Id = team1Id,
                team2Id = team2Id,
                team1Score = team1Score,
                team2Score = team2Score,
            )
            val containerColor = when {
                isActive -> MaterialTheme.colorScheme.primaryContainer
                isComplete -> MaterialTheme.colorScheme.secondaryContainer
                else -> MaterialTheme.colorScheme.surfaceVariant
            }
            val contentColor = when {
                isActive -> MaterialTheme.colorScheme.onPrimaryContainer
                isComplete -> MaterialTheme.colorScheme.onSecondaryContainer
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 116.dp)
                    .clickable { onSegmentSelected(index) },
                shape = RoundedCornerShape(14.dp),
                color = containerColor,
                contentColor = contentColor,
                tonalElevation = if (isActive) 2.dp else 0.dp,
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "$segmentLabel ${segment.sequence}",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        when {
                            isActive -> Text(
                                text = "In progress",
                                style = MaterialTheme.typography.labelSmall,
                            )
                            isComplete -> Text(
                                text = "Complete",
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                    MatchSegmentTeamScoreRow(
                        roleLabel = "Home",
                        teamName = team1Name,
                        score = team1Score,
                        isSetWinner = segmentWinnerEventTeamId == team1Id,
                        isMatchWinner = matchWinnerEventTeamId == team1Id,
                    )
                    MatchSegmentTeamScoreRow(
                        roleLabel = "Away",
                        teamName = team2Name,
                        score = team2Score,
                        isSetWinner = segmentWinnerEventTeamId == team2Id,
                        isMatchWinner = matchWinnerEventTeamId == team2Id,
                    )
                }
            }
        }
    }
}

@Composable
private fun MatchSegmentTeamScoreRow(
    roleLabel: String,
    teamName: String,
    score: Int,
    isSetWinner: Boolean = false,
    isMatchWinner: Boolean = false,
) {
    val rowContentColor = if (isMatchWinner) {
        matchWinnerContentColor()
    } else {
        MaterialTheme.colorScheme.onSurface
    }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = if (isMatchWinner) matchWinnerContainerColor() else Color.Transparent,
        contentColor = rowContentColor,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = roleLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = rowContentColor,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = teamName,
                    style = MaterialTheme.typography.bodyLarge,
                    color = rowContentColor,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = score.toString(),
                style = MaterialTheme.typography.headlineSmall,
                color = if (isSetWinner) matchWinnerTextColor() else rowContentColor,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
            )
        }
    }
}

internal fun resolveSegmentWinnerEventTeamId(
    segment: MatchSegmentMVP,
    team1Id: String?,
    team2Id: String?,
    team1Score: Int,
    team2Score: Int,
): String? {
    segment.winnerEventTeamId
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { winnerId -> return winnerId }

    if (!segment.status.equals("COMPLETE", ignoreCase = true)) return null
    return when {
        team1Score > team2Score -> team1Id
        team2Score > team1Score -> team2Id
        else -> null
    }
}

private fun actualTimeLabel(value: String?): String {
    val instant = value
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { normalized -> runCatching { Instant.parse(normalized) }.getOrNull() }
    return instant
        ?.toLocalDateTime(TimeZone.currentSystemDefault())
        ?.format(dateTimeFormat)
        ?: "Not set"
}

private fun shouldShowMatchStatusBlock(match: MatchMVP): Boolean {
    val statusReason = match.statusReason?.trim().orEmpty()
    val resultStatus = match.resultStatus?.trim()?.uppercase().orEmpty()
    val resultType = match.resultType?.trim()?.uppercase().orEmpty()
    val lifecycleStatus = match.status?.trim()?.uppercase().orEmpty()
    return statusReason.isNotBlank() ||
        (resultStatus.isNotBlank() && resultStatus !in setOf("PENDING", "OFFICIAL")) ||
        (resultType.isNotBlank() && resultType != "REGULATION") ||
        lifecycleStatus in setOf("CANCELLED", "FORFEIT", "SUSPENDED")
}

private val MatchSegmentMVP.isStarted: Boolean
    get() = status.equals("IN_PROGRESS", ignoreCase = true) ||
        status.equals("STARTED", ignoreCase = true)

internal fun segmentScore(
    segment: MatchSegmentMVP?,
    teamId: String?,
    fallbackScores: List<Int>,
    index: Int,
): Int = teamId
    ?.let { resolvedTeamId -> segment?.scores?.get(resolvedTeamId) }
    ?: fallbackScores.getOrElse(index) { 0 }
