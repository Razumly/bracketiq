package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.isScrollingUp
import kotlin.time.Instant
import kotlinx.coroutines.delay
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

@Composable
internal fun LeagueStandingsTab(
    state: EventDetailStandingsState,
    actions: EventDetailStandingsActions,
) {
    val standings = state.standings
    val standingsDivisionKey = state.standingsDivisionKey
    val showDrawColumn = state.showDrawColumn
    val topContentPadding = state.topContentPadding
    val standingsConfirmedAt = state.standingsConfirmedAt
    val validationMessages = state.validationMessages
    val isLoading = state.isLoading
    val isConfirming = state.isConfirming
    val canConfirmStandings = state.canConfirmStandings
    val standingsListState = rememberLazyListState()
    val standingsColumns = remember(showDrawColumn) {
        visibleLeagueStandingsColumns(showDrawColumn)
    }
    val isScrollingUp by standingsListState.isScrollingUp()
    actions.showFab(if (standings.isEmpty()) true else isScrollingUp)
    val visibleValidationMessages = if (canConfirmStandings) validationMessages else emptyList()
    val confirmedLabel = standingsConfirmedAt?.let(::formatStandingsConfirmedAt)
    val normalizedStandingsDivisionKey = standingsDivisionKey.trim().ifBlank { "all" }
    var previousStandingsRowCount by remember { mutableStateOf(standings.size) }
    val standingsRowSlotCount = maxOf(standings.size, previousStandingsRowCount)

    LaunchedEffect(normalizedStandingsDivisionKey, standings.size) {
        delay(StandingsRowTransitionRetainMillis.toLong())
        previousStandingsRowCount = standings.size
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize(),
            state = standingsListState,
        ) {
            if (topContentPadding > 0.dp) {
                item(key = "division-pill-spacer") {
                    Spacer(modifier = Modifier.height(topContentPadding))
                }
            }
            if (confirmedLabel != null || visibleValidationMessages.isNotEmpty() || isLoading || isConfirming) {
                item(key = "standings-status") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (confirmedLabel != null) {
                            StandingsConfirmedMessage(confirmedLabel)
                        }
                        if (visibleValidationMessages.isNotEmpty()) {
                            visibleValidationMessages.forEach { validationMessage ->
                                Text(
                                    text = validationMessage,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                        if (isLoading || isConfirming) {
                            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
            if (standingsRowSlotCount == 0) {
                item(key = "standings-empty") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 320.dp)
                            .padding(horizontal = 24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "Standings will appear once scores are reported.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            } else {
                item(key = "standings-header") {
                    LeagueStandingsHeader(columns = standingsColumns)
                }
                items(
                    count = standingsRowSlotCount,
                    key = { index -> "standings-row-$index" },
                ) { index ->
                    val rowDelay = standingsWaveDelay(index)
                    AnimatedContent(
                        targetState = LeagueStandingsRowAnimationState(
                            divisionKey = normalizedStandingsDivisionKey,
                            index = index,
                            standing = standings.getOrNull(index),
                        ),
                        contentKey = { target -> "${target.divisionKey}-${target.index}" },
                        transitionSpec = {
                            ((
                                slideInHorizontally(
                                    animationSpec = tween(
                                        durationMillis = StandingsRowSlideInMillis,
                                        delayMillis = rowDelay,
                                    ),
                                    initialOffsetX = { fullWidth -> -fullWidth / 4 },
                                ) + fadeIn(
                                    animationSpec = tween(
                                        durationMillis = StandingsRowFadeInMillis,
                                        delayMillis = StandingsRowFadeInDelayMillis + rowDelay,
                                    ),
                                )
                                ) togetherWith (
                                slideOutHorizontally(
                                    animationSpec = tween(
                                        durationMillis = StandingsRowSlideOutMillis,
                                        delayMillis = rowDelay,
                                    ),
                                    targetOffsetX = { fullWidth -> fullWidth / 3 },
                                ) + fadeOut(
                                    animationSpec = tween(
                                        durationMillis = StandingsRowFadeOutMillis,
                                        delayMillis = rowDelay,
                                    ),
                                )
                                )).using(SizeTransform(clip = false))
                        },
                        label = "standingsDivisionTeamRow",
                    ) { target ->
                        target.standing?.let { standing ->
                            LeagueStandingRow(
                                standing = standing,
                                columns = standingsColumns,
                            )
                        } ?: Spacer(modifier = Modifier.height(0.dp))
                    }
                }
            }
        }
    }
}

private data class LeagueStandingsRowAnimationState(
    val divisionKey: String,
    val index: Int,
    val standing: TeamStanding?,
)

private fun standingsWaveDelay(index: Int): Int =
    (index * StandingsRowWaveDelayMillis).coerceAtMost(StandingsRowWaveMaxDelayMillis)

private const val StandingsRowSlideInMillis = 220
private const val StandingsRowFadeInMillis = 180
private const val StandingsRowFadeInDelayMillis = 60
private const val StandingsRowSlideOutMillis = 180
private const val StandingsRowFadeOutMillis = 150
private const val StandingsRowWaveDelayMillis = 22
private const val StandingsRowWaveMaxDelayMillis = 154
private const val StandingsRowTransitionRetainMillis = 420

@Composable
private fun StandingsConfirmedMessage(
    confirmedLabel: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Default.Check,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = "Results confirmed on $confirmedLabel.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

private fun formatStandingsConfirmedAt(
    confirmedAt: Instant,
    timeZone: TimeZone = TimeZone.currentSystemDefault(),
): String {
    val localDateTime = confirmedAt.toLocalDateTime(timeZone)
    val month = localDateTime.date.month.name.take(3).lowercase().replaceFirstChar { char ->
        if (char.isLowerCase()) char.titlecase() else char.toString()
    }
    val hour = localDateTime.time.hour
    val displayHour = ((hour + 11) % 12) + 1
    val minute = localDateTime.time.minute.toString().padStart(2, '0')
    val period = if (hour < 12) "AM" else "PM"
    return "$month ${localDateTime.date.day}, ${localDateTime.date.year} at $displayHour:$minute $period"
}

@Composable
private fun LeagueStandingsHeader(
    columns: List<LeagueStandingsColumn>,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Team",
            modifier = Modifier.weight(TEAM_STANDINGS_COLUMN_WEIGHT),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        columns.forEach { column ->
            Text(
                text = column.label,
                modifier = Modifier.weight(column.weight),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LeagueStandingRow(
    standing: TeamStanding,
    columns: List<LeagueStandingsColumn>,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.weight(TEAM_STANDINGS_COLUMN_WEIGHT)) {
            standing.team?.let { teamWithPlayers ->
                TeamCard(team = teamWithPlayers)
            } ?: Text(
                text = standing.teamName.ifBlank { standing.teamId },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        columns.forEach { column ->
            StandingsValueCell(
                value = column.valueFor(standing),
                modifier = Modifier.weight(column.weight),
            )
        }
    }
}

@Composable
private fun StandingsValueCell(
    value: String,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

private const val TEAM_STANDINGS_COLUMN_WEIGHT = 2.2f
