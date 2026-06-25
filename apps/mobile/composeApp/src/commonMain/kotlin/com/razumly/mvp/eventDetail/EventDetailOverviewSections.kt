package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import com.razumly.mvp.core.data.util.resolveParticipantCapacity
import com.razumly.mvp.core.presentation.util.toNameCase
import com.razumly.mvp.core.presentation.util.toTitleCase

internal fun shouldShowOverviewRosterSections(event: Event): Boolean =
    event.eventType != EventType.WEEKLY_EVENT

private fun overviewLoadingMessage(
    event: Event,
    teamsAndParticipantsLoading: Boolean,
    matchesLoading: Boolean,
): String? = when {
    teamsAndParticipantsLoading && matchesLoading -> if (event.teamSignup) {
        "Loading schedule, teams, and participants..."
    } else {
        "Loading schedule and participants..."
    }

    teamsAndParticipantsLoading -> if (!event.teamSignup) {
        "Loading participants..."
    } else {
        null
    }

    matchesLoading -> "Loading schedule..."
    else -> null
}

internal fun WeeklyOccurrenceSummary.isFull(): Boolean =
    participantCapacity?.let { capacity -> capacity > 0 && participantCount >= capacity } == true

internal fun formatWeeklyOccurrenceFullness(summary: WeeklyOccurrenceSummary): String {
    val baseLabel = summary.participantCapacity?.let { capacity ->
        "${summary.participantCount} of $capacity spots filled"
    } ?: "${summary.participantCount} spots filled"
    return if (summary.isFull()) {
        "Full • $baseLabel"
    } else {
        baseLabel
    }
}

internal fun formatTeamsNeedingPlayersSummary(teamsNeedingPlayers: List<Int>): String? {
    val normalized = teamsNeedingPlayers.filter { missing -> missing > 0 }
    if (normalized.isEmpty()) return null

    val teamCount = normalized.size
    val minMissing = normalized.minOrNull() ?: return null
    val maxMissing = normalized.maxOrNull() ?: return null
    val teamLabel = if (teamCount == 1) "team" else "teams"
    val needVerb = if (teamCount == 1) "needs" else "need"
    val playerSummary = if (minMissing == maxMissing) {
        val playerLabel = if (minMissing == 1) "player" else "players"
        "$minMissing $playerLabel"
    } else {
        "$minMissing-$maxMissing players"
    }

    return "$teamCount $teamLabel $needVerb $playerSummary"
}

@Composable
internal fun EventOverviewSections(
    state: EventDetailOverviewState,
    actions: EventDetailOverviewActions,
    modifier: Modifier = Modifier,
    formatModifier: Modifier = Modifier,
    openDetailsActionModifier: Modifier = Modifier,
) {
    val eventWithRelations = state.eventWithRelations
    val teamsAndParticipantsLoading = state.teamsAndParticipantsLoading
    val matchesLoading = state.matchesLoading
    val showFullnessSummary = state.showFullnessSummary
    val selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrenceLabel
    val selectedWeeklyOccurrenceSummary = state.selectedWeeklyOccurrenceSummary
    val overviewParticipantSummary = state.overviewParticipantSummary
    val showOpenDetailsAction = state.showOpenDetailsAction
    val onOpenDetails = actions.onOpenDetails
    val event = eventWithRelations.event
    val showRosterSections = shouldShowOverviewRosterSections(event)
    val loadedParticipantSummary = selectedWeeklyOccurrenceSummary?.let { summary ->
        EventParticipantsSummary(
            participantCount = summary.participantCount,
            participantCapacity = summary.participantCapacity,
        )
    } ?: overviewParticipantSummary
    val capacity = loadedParticipantSummary?.participantCapacity ?: event.resolveParticipantCapacity()
    val filled = loadedParticipantSummary?.participantCount
        ?: eventWithRelations.resolveOverviewFilledParticipantCount()
    val spotsLeft = if (capacity > 0) (capacity - filled).coerceAtLeast(0) else 0
    val progress = if (capacity > 0) (filled.toFloat() / capacity.toFloat()).coerceIn(0f, 1f) else 0f
    val freeAgentIds = remember(event.freeAgentIds) { event.freeAgentIds.distinct() }
    val waitlistIds = remember(event.waitListIds) { event.waitListIds.distinct() }
    val visibleTeams = remember(event.eventType, event.teamSignup, eventWithRelations.teams) {
        event.visibleTeams(eventWithRelations.teams)
    }
    val registeredTeamIds = remember(event.teamIds) {
        event.registeredTeamIdsForCapacity()
    }
    val expectedTeamCount = if (event.teamSignup) {
        registeredTeamIds.size.takeIf { count -> count > 0 }
            ?: loadedParticipantSummary?.participantCount
            ?: 0
    } else {
        0
    }
    val teamRosterHydrating = event.teamSignup &&
        expectedTeamCount > 0 &&
        visibleTeams.size < expectedTeamCount
    val teamCapacityLoading = event.teamSignup &&
        teamsAndParticipantsLoading &&
        registeredTeamIds.isEmpty() &&
        loadedParticipantSummary == null
    val divisionCapacitySummaries = remember(
        event.id,
        event.teamSignup,
        event.singleDivision,
        registeredTeamIds,
        event.divisionDetails,
    ) {
        buildDivisionCapacitySummaries(
            event = event,
            divisionDetails = event.divisionDetails,
        )
    }
    var showDivisionCapacities by rememberSaveable(event.id) { mutableStateOf(false) }
    val playersById = remember(eventWithRelations.players) {
        eventWithRelations.players.associateBy { it.id }
    }
    val freeAgentUsers = remember(freeAgentIds, playersById) {
        freeAgentIds.mapNotNull(playersById::get)
    }
    val unresolvedFreeAgentCount = (freeAgentIds.size - freeAgentUsers.size).coerceAtLeast(0)
    val openDetailsLoadingMessage = remember(
        event.id,
        event.teamSignup,
        teamsAndParticipantsLoading,
        matchesLoading,
    ) {
        overviewLoadingMessage(
            event = event,
            teamsAndParticipantsLoading = teamsAndParticipantsLoading,
            matchesLoading = matchesLoading,
        )
    }
    val teamsNeedingPlayers = remember(visibleTeams, event.teamSizeLimit) {
        visibleTeams
            .mapNotNull { team ->
                val missing = (event.teamSizeLimit - team.team.playerIds.size).coerceAtLeast(0)
                missing.takeIf { it > 0 }
            }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        openDetailsLoadingMessage?.let { loadingMessage ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    Text(
                        text = loadingMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (showFullnessSummary) {
            HorizontalDivider()
            Surface(
                modifier = formatModifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (!selectedWeeklyOccurrenceLabel.isNullOrBlank()) {
                        Text(
                            text = selectedWeeklyOccurrenceLabel,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        CapacityStat(
                            title = if (event.teamSignup) "Teams" else "Spots",
                            value = if (teamCapacityLoading) {
                                "Loading"
                            } else {
                                "$filled/$capacity"
                            },
                        )
                        CapacityStat(
                            title = if (event.teamSignup) "Free Agents" else "Waitlist",
                            value = if (event.teamSignup) freeAgentIds.size.toString() else waitlistIds.size.toString(),
                        )
                        CapacityStat(
                            title = "Left",
                            value = if (teamCapacityLoading) "Loading" else spotsLeft.toString(),
                        )
                    }
                    if (teamCapacityLoading) {
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    } else {
                        LinearProgressIndicator(
                            progress = { progress },
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Text(
                        text = if (teamCapacityLoading) {
                            "Loading teams..."
                        } else {
                            "${(progress * 100).toInt()}% full - $spotsLeft left"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = if (event.teamSignup) "Registration: Team" else "Registration: Individual",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (!teamCapacityLoading && selectedWeeklyOccurrenceSummary == null && divisionCapacitySummaries.isNotEmpty()) {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showDivisionCapacities = !showDivisionCapacities },
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.45f)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "Division capacities",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Icon(
                                    imageVector = if (showDivisionCapacities) {
                                        Icons.Default.KeyboardArrowUp
                                    } else {
                                        Icons.Default.KeyboardArrowDown
                                    },
                                    contentDescription = if (showDivisionCapacities) {
                                        "Hide division capacities"
                                    } else {
                                        "Show division capacities"
                                    },
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        AnimatedVisibility(
                            visible = showDivisionCapacities,
                            enter = expandVertically() + fadeIn(),
                            exit = shrinkVertically() + fadeOut(),
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                divisionCapacitySummaries.forEach { summary ->
                                    DivisionCapacityRow(
                                        summary = summary,
                                        isLoading = teamCapacityLoading,
                                    )
                                }
                            }
                        }
                    }
                    if (event.teamSignup && teamsNeedingPlayers.isNotEmpty()) {
                        formatTeamsNeedingPlayersSummary(teamsNeedingPlayers)?.let { summary ->
                            Text(
                                text = summary,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }
        if (event.teamSignup && showRosterSections) {
            if (teamRosterHydrating) {
                SectionHeader(
                    title = "Teams ($expectedTeamCount)",
                    action = "Loading",
                    onAction = {},
                    actionEnabled = false,
                )
                Text(
                    text = "Loading teams and participants...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                SectionHeader(
                    title = "Teams (${visibleTeams.size})",
                    action = "See all",
                    onAction = onOpenDetails
                )
                if (visibleTeams.isEmpty()) {
                    Text(
                        text = "No teams yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(
                            visibleTeams.take(4),
                            key = { teamWithPlayers -> teamWithPlayers.team.id }
                        ) { team ->
                            TeamPreviewChip(
                                team = team,
                                teamSizeLimit = event.teamSizeLimit,
                                onClick = onOpenDetails
                            )
                        }
                    }
                }
                SectionHeader(
                    title = "Free Agents (${freeAgentIds.size})",
                    action = "See all",
                    onAction = onOpenDetails
                )
                if (freeAgentIds.isEmpty()) {
                    Text(
                        text = "No free agents yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(freeAgentUsers.take(8), key = { user -> user.id }) { user ->
                            FreeAgentPreview(user = user, onClick = onOpenDetails)
                        }
                        if (unresolvedFreeAgentCount > 0) {
                            item {
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                    modifier = Modifier.clickable(onClick = onOpenDetails)
                                ) {
                                    Text(
                                        text = "+$unresolvedFreeAgentCount",
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        if (showOpenDetailsAction) {
            TextButton(
                onClick = onOpenDetails,
                modifier = openDetailsActionModifier.align(Alignment.End),
            ) {
                Text("View Schedule and Participants")
            }
        }
    }
}

@Composable
private fun CapacityStat(
    title: String,
    value: String,
) {
    Column(horizontalAlignment = Alignment.Start) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun DivisionCapacityRow(
    summary: DivisionCapacitySummary,
    isLoading: Boolean = false,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.35f),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = summary.label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (isLoading) {
                        "Loading"
                    } else if (summary.capacity > 0) {
                        "${summary.filled}/${summary.capacity}"
                    } else {
                        summary.filled.toString()
                    },
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            if (isLoading) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                LinearProgressIndicator(
                    progress = { summary.progress },
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                text = if (isLoading) {
                    "Loading teams..."
                } else if (summary.capacity > 0) {
                    "${(summary.progress * 100).toInt()}% full - ${summary.left} left"
                } else {
                    "No capacity configured"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    action: String,
    onAction: () -> Unit,
    actionEnabled: Boolean = true,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        TextButton(onClick = onAction, enabled = actionEnabled) {
            Text(action)
        }
    }
}

@Composable
internal fun DetailTabLoadingState(message: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun TeamPreviewChip(
    team: TeamWithPlayers,
    teamSizeLimit: Int,
    onClick: () -> Unit
) {
    val teamName = team.team.name.takeIf { it.isNotBlank() } ?: "Team"
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = teamName.toTitleCase(),
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "${team.team.playerIds.size}/$teamSizeLimit",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun FreeAgentPreview(
    user: UserData,
    onClick: () -> Unit
) {
    val initials = remember(user.firstName, user.lastName, user.userName) {
        buildString {
            user.firstName.firstOrNull()?.let { append(it.uppercaseChar()) }
            user.lastName.firstOrNull()?.let { append(it.uppercaseChar()) }
        }.ifBlank {
            user.userName.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
        }
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.primary, CircleShape)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text(
                    text = initials,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary
                )
            }
            Text(
                text = user.firstName.toNameCase(),
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
