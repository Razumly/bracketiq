@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
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
    regulationSegmentCount: Int,
    matchWinnerEventTeamId: String?,
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
    canAddIncident: Boolean,
    matchActionSaving: Boolean,
    onForfeitClick: () -> Unit,
    onCancelMatchClick: () -> Unit,
    onSuspendMatchClick: () -> Unit,
    onResumeMatchClick: () -> Unit,
    onAddIncidentClick: () -> Unit,
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
                if (canUseMatchStatusActions || canAddIncident) {
                    MatchDetailsActionsSection(
                        canUsePreStartMatchActions = canUsePreStartMatchActions,
                        canSuspendMatch = canSuspendMatch,
                        canResumeMatch = canResumeMatch,
                        canAddIncident = canAddIncident,
                        matchActionSaving = matchActionSaving,
                        onForfeitClick = onForfeitClick,
                        onCancelMatchClick = onCancelMatchClick,
                        onSuspendMatchClick = onSuspendMatchClick,
                        onResumeMatchClick = onResumeMatchClick,
                        onAddIncidentClick = onAddIncidentClick,
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
                MatchSetScoreLimitsSection(
                    limits = matchSetScoreLimits(
                        match = match,
                        segmentLabel = segmentBaseLabel,
                    ),
                )
                if (showSegmentBreakdown) {
                    MatchSegmentTable(
                        segments = orderedSegments,
                        segmentLabel = segmentBaseLabel,
                        regulationSegmentCount = regulationSegmentCount,
                        team1Id = match.team1Id,
                        team2Id = match.team2Id,
                        team1Scores = match.team1Points,
                        team2Scores = match.team2Points,
                        team1Name = team1Name,
                        team2Name = team2Name,
                        matchWinnerEventTeamId = matchWinnerEventTeamId,
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
    canAddIncident: Boolean,
    matchActionSaving: Boolean,
    onForfeitClick: () -> Unit,
    onCancelMatchClick: () -> Unit,
    onSuspendMatchClick: () -> Unit,
    onResumeMatchClick: () -> Unit,
    onAddIncidentClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = "Match actions",
            style = MaterialTheme.typography.titleSmall,
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (canUsePreStartMatchActions) {
                MatchDetailsActionButton(
                    label = "Forfeit",
                    onClick = onForfeitClick,
                    enabled = !matchActionSaving,
                )
                MatchDetailsActionButton(
                    label = "Cancel",
                    onClick = onCancelMatchClick,
                    enabled = !matchActionSaving,
                )
            }
            if (canSuspendMatch) {
                MatchDetailsActionButton(
                    label = "Suspend",
                    onClick = onSuspendMatchClick,
                    enabled = !matchActionSaving,
                )
            }
            if (canResumeMatch) {
                MatchDetailsActionButton(
                    label = "Resume",
                    onClick = onResumeMatchClick,
                    enabled = !matchActionSaving,
                )
            }
            if (canAddIncident) {
                MatchDetailsActionButton(
                    label = "Add Incident",
                    onClick = onAddIncidentClick,
                    enabled = !matchActionSaving,
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
        modifier = modifier,
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

internal data class MatchSetScoreLimit(
    val label: String,
    val points: Int,
)

internal fun matchSetScoreLimits(
    match: MatchMVP,
    segmentLabel: String,
): List<MatchSetScoreLimit> {
    val rules = match.matchRulesSnapshot ?: match.resolvedMatchRules ?: return emptyList()
    if (!rules.scoringModel.equals("SETS", ignoreCase = true)) return emptyList()
    val prefix = matchSegmentPrefix(segmentLabel)
    return rules.setPointTargets.mapIndexedNotNull { index, points ->
        points.takeIf { it > 0 }?.let { target ->
            MatchSetScoreLimit(
                label = "$prefix${index + 1}",
                points = target,
            )
        }
    }
}

@Composable
internal fun MatchSetScoreLimitsSection(
    limits: List<MatchSetScoreLimit>,
    modifier: Modifier = Modifier,
) {
    if (limits.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = "Set score limits",
            style = MaterialTheme.typography.titleSmall,
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            limits.forEach { limit ->
                Text(
                    text = "${limit.label}: ${limit.points}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
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
    regulationSegmentCount: Int,
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

    val horizontalScrollState = rememberScrollState()
    val dividerColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.32f)
    Column(modifier = modifier.fillMaxWidth()) {
        HorizontalDivider(color = dividerColor)
        Row(modifier = Modifier.fillMaxWidth()) {
            MatchSegmentTeamLabels(
                team1Name = team1Name,
                team2Name = team2Name,
                team1IsMatchWinner = matchWinnerEventTeamId != null && matchWinnerEventTeamId == team1Id,
                team2IsMatchWinner = matchWinnerEventTeamId != null && matchWinnerEventTeamId == team2Id,
                dividerColor = dividerColor,
            )
            VerticalDivider(
                modifier = Modifier.height(MatchSegmentGridHeight),
                color = dividerColor,
            )
            Box(
                modifier = Modifier.weight(1f),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(horizontalScrollState)
                        .testTag(MatchSegmentColumnsTestTag),
                ) {
                    segments.forEachIndexed { index, segment ->
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
                        MatchSegmentScoreColumn(
                            headerLabel = matchSegmentHeaderLabel(
                                segment = segment,
                                segmentLabel = segmentLabel,
                                regulationSegmentCount = regulationSegmentCount,
                            ),
                            team1Score = team1Score,
                            team2Score = team2Score,
                            team1IsSegmentWinner = segmentWinnerEventTeamId == team1Id,
                            team2IsSegmentWinner = segmentWinnerEventTeamId == team2Id,
                            dividerColor = dividerColor,
                            onClick = { onSegmentSelected(index) },
                        )
                        if (index < segments.lastIndex) {
                            VerticalDivider(
                                modifier = Modifier.height(MatchSegmentGridHeight),
                                color = dividerColor,
                            )
                        }
                    }
                }
                if (horizontalScrollState.canScrollBackward) {
                    MatchSegmentScrollCue(
                        direction = MatchSegmentScrollDirection.Backward,
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .testTag(MatchSegmentScrollBackwardCueTestTag),
                    )
                }
                if (horizontalScrollState.canScrollForward) {
                    MatchSegmentScrollCue(
                        direction = MatchSegmentScrollDirection.Forward,
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .testTag(MatchSegmentScrollForwardCueTestTag),
                    )
                }
            }
        }
        HorizontalDivider(color = dividerColor)
    }
}

private enum class MatchSegmentScrollDirection {
    Backward,
    Forward,
}

@Composable
private fun MatchSegmentScrollCue(
    direction: MatchSegmentScrollDirection,
    modifier: Modifier = Modifier,
) {
    val isBackward = direction == MatchSegmentScrollDirection.Backward
    Box(
        modifier = modifier
            .width(32.dp)
            .height(MatchSegmentGridHeight)
            .background(
                Brush.horizontalGradient(
                    colors = if (isBackward) {
                        listOf(
                            MaterialTheme.colorScheme.surface,
                            Color.Transparent,
                        )
                    } else {
                        listOf(
                            Color.Transparent,
                            MaterialTheme.colorScheme.surface,
                        )
                    },
                )
            ),
        contentAlignment = if (isBackward) Alignment.CenterStart else Alignment.CenterEnd,
    ) {
        Text(
            text = if (isBackward) "‹" else "›",
            modifier = Modifier.padding(
                start = if (isBackward) 6.dp else 0.dp,
                end = if (isBackward) 0.dp else 6.dp,
            ),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun MatchSegmentTeamLabels(
    team1Name: String,
    team2Name: String,
    team1IsMatchWinner: Boolean,
    team2IsMatchWinner: Boolean,
    dividerColor: Color,
) {
    Column(
        modifier = Modifier.width(MatchSegmentTeamColumnWidth),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(MatchSegmentHeaderHeight)
                .padding(horizontal = 8.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = "Teams",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
            )
        }
        HorizontalDivider(color = dividerColor)
        MatchSegmentTeamLabel(
            roleLabel = "Home",
            teamName = team1Name,
            isMatchWinner = team1IsMatchWinner,
        )
        HorizontalDivider(color = dividerColor)
        MatchSegmentTeamLabel(
            roleLabel = "Away",
            teamName = team2Name,
            isMatchWinner = team2IsMatchWinner,
        )
    }
}

@Composable
private fun MatchSegmentTeamLabel(
    roleLabel: String,
    teamName: String,
    isMatchWinner: Boolean,
) {
    val contentColor = if (isMatchWinner) {
        matchWinnerContentColor()
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(MatchSegmentTeamRowHeight),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = roleLabel,
                style = MaterialTheme.typography.labelSmall,
                color = contentColor,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = teamName,
                style = MaterialTheme.typography.bodyMedium,
                color = contentColor,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun MatchSegmentScoreColumn(
    headerLabel: String,
    team1Score: Int,
    team2Score: Int,
    team1IsSegmentWinner: Boolean,
    team2IsSegmentWinner: Boolean,
    dividerColor: Color,
    onClick: () -> Unit,
) {
    val contentColor = MaterialTheme.colorScheme.onSurface
    Surface(
        modifier = Modifier
            .width(MatchSegmentScoreColumnWidth)
            .clickable(onClick = onClick),
        color = Color.Transparent,
        contentColor = contentColor,
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(MatchSegmentHeaderHeight),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = headerLabel,
                    style = MaterialTheme.typography.labelLarge,
                    color = contentColor,
                    fontWeight = FontWeight.Bold,
                )
            }
            HorizontalDivider(color = dividerColor)
            MatchSegmentScoreCell(
                score = team1Score,
                isSegmentWinner = team1IsSegmentWinner,
                contentColor = contentColor,
            )
            HorizontalDivider(color = dividerColor)
            MatchSegmentScoreCell(
                score = team2Score,
                isSegmentWinner = team2IsSegmentWinner,
                contentColor = contentColor,
            )
        }
    }
}

@Composable
private fun MatchSegmentScoreCell(
    score: Int,
    isSegmentWinner: Boolean,
    contentColor: Color,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(MatchSegmentTeamRowHeight),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = if (isSegmentWinner) matchWinnerContainerColor() else Color.Transparent,
            contentColor = if (isSegmentWinner) matchWinnerTextColor() else contentColor,
        ) {
            Text(
                text = score.toString(),
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                style = MaterialTheme.typography.titleMedium,
                color = if (isSegmentWinner) matchWinnerTextColor() else contentColor,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        }
    }
}

internal fun matchSegmentHeaderLabel(
    segment: MatchSegmentMVP,
    segmentLabel: String,
    regulationSegmentCount: Int,
): String {
    return when (segment.resultType?.trim()?.uppercase()) {
        "OVERTIME" -> {
            val overtimeNumber = (segment.sequence - regulationSegmentCount).coerceAtLeast(1)
            if (overtimeNumber == 1) "OT" else "OT$overtimeNumber"
        }
        "SHOOTOUT" -> "SO"
        else -> {
            val prefix = matchSegmentPrefix(segmentLabel)
            "$prefix${segment.sequence}"
        }
    }
}

private fun matchSegmentPrefix(segmentLabel: String): String =
    when (segmentLabel.trim().lowercase()) {
        "quarter" -> "Q"
        "period" -> "P"
        "set" -> "S"
        "half" -> "H"
        else -> segmentLabel.trim().take(3).ifBlank { "Seg" }
    }

internal const val MatchSegmentColumnsTestTag = "match-segment-columns"
internal const val MatchSegmentScrollBackwardCueTestTag = "match-segment-scroll-backward-cue"
internal const val MatchSegmentScrollForwardCueTestTag = "match-segment-scroll-forward-cue"
private val MatchSegmentTeamColumnWidth = 136.dp
private val MatchSegmentScoreColumnWidth = 64.dp
private val MatchSegmentHeaderHeight = 36.dp
private val MatchSegmentTeamRowHeight = 48.dp
private val MatchSegmentGridHeight = 134.dp

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

internal fun segmentScore(
    segment: MatchSegmentMVP?,
    teamId: String?,
    fallbackScores: List<Int>,
    index: Int,
): Int = teamId
    ?.let { resolvedTeamId -> segment?.scores?.get(resolvedTeamId) }
    ?: fallbackScores.getOrElse(index) { 0 }
