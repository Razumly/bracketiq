package com.razumly.mvp.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.officialAssignmentLabels
import com.razumly.mvp.core.presentation.composables.PlatformLoadingIndicator
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.util.timeFormat
import com.razumly.mvp.eventDetail.composables.ScheduleItem
import com.razumly.mvp.eventDetail.composables.ScheduleMatchGroupMode
import com.razumly.mvp.eventDetail.composables.ScheduleView
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private enum class ScheduleEntryFilter {
    BOTH,
    MATCHES,
    EVENTS,
}

@Composable
fun ProfileMyScheduleScreen(component: ProfileComponent) {
    val state by component.myScheduleState.collectAsState()
    val childStack by component.childStack.subscribeAsState()
    val canNavigateBack = childStack.backStack.isNotEmpty()
    var selectedFilter by rememberSaveable { mutableStateOf(ScheduleEntryFilter.BOTH) }
    val scheduleItems = remember(state.events, state.matches, state.teams, state.fields) {
        buildScheduleItems(
            events = state.events,
            matches = state.matches,
            teams = state.teams,
            fields = state.fields,
        )
    }
    val filteredScheduleItems = remember(scheduleItems, selectedFilter) {
        scheduleItems.filter(selectedFilter::includes)
    }
    val scheduleFields = remember(state.fields, state.matches) {
        buildScheduleFields(
            fields = state.fields,
            matches = state.matches,
        )
    }
    val eventsById = remember(state.events) {
        state.events.associateBy(Event::id)
    }
    val eventLabelsById = remember(state.events) {
        state.events.associate { event -> event.id to event.name }
    }

    LaunchedEffect(component) {
        component.refreshMySchedule()
    }

    ProfileSectionScaffold(
        title = "My Schedule",
        description = "Shared schedule view for your events and matches.",
        onBack = component::onBackClicked,
        showBackButton = canNavigateBack,
        scrollContent = false,
        contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 0.dp),
    ) {
        PullToRefreshContainer(
            isRefreshing = state.isLoading,
            onRefresh = component::refreshMySchedule,
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.error?.let { error ->
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                if (!state.isLoading || scheduleItems.isNotEmpty()) {
                    ScheduleEntryFilterSelector(
                        selected = selectedFilter,
                        onSelected = { selectedFilter = it },
                    )
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                ) {
                    if (state.isLoading && scheduleItems.isEmpty()) {
                        MyScheduleLoadingState()
                    } else {
                        ScheduleView(
                            items = filteredScheduleItems,
                            fields = scheduleFields,
                            showFab = {},
                            showGroupingToggle = false,
                            matchGroupMode = ScheduleMatchGroupMode.EVENT,
                            eventLabelsById = eventLabelsById,
                            contentPadding = PaddingValues(),
                            onMatchClick = component::openScheduleMatch,
                            onEventClick = { event -> component.openScheduleEvent(event.id) },
                            matchCardContent = { match, onClick ->
                                ProfileScheduleMatchCard(
                                    match = match,
                                    event = eventsById[match.match.eventId],
                                    onClick = onClick,
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}
@Composable
private fun ScheduleEntryFilterSelector(
    selected: ScheduleEntryFilter,
    onSelected: (ScheduleEntryFilter) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ScheduleEntryFilter.entries.forEach { filter ->
            FilterChip(
                selected = selected == filter,
                onClick = { onSelected(filter) },
                label = {
                    Text(
                        when (filter) {
                            ScheduleEntryFilter.BOTH -> "Both"
                            ScheduleEntryFilter.MATCHES -> "Matches"
                            ScheduleEntryFilter.EVENTS -> "Events"
                        },
                    )
                },
            )
        }
    }
}

@Composable
private fun MyScheduleLoadingState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PlatformLoadingIndicator(
                modifier = Modifier.size(32.dp),
            )
            Text(
                text = "Loading schedule...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun ScheduleEntryFilter.includes(item: ScheduleItem): Boolean =
    when (this) {
        ScheduleEntryFilter.BOTH -> true
        ScheduleEntryFilter.MATCHES -> item is ScheduleItem.MatchEntry
        ScheduleEntryFilter.EVENTS -> item is ScheduleItem.EventEntry
    }

@Composable
private fun ProfileScheduleMatchCard(
    match: MatchWithRelations,
    event: Event?,
    onClick: () -> Unit,
) {
    val team1Name = match.team1?.name?.takeIf { it.isNotBlank() } ?: "TBD"
    val team2Name = match.team2?.name?.takeIf { it.isNotBlank() } ?: "TBD"
    val fieldLabel = match.field?.name?.takeIf { it.isNotBlank() } ?: "Field TBD"
    val timeZone = remember { TimeZone.currentSystemDefault() }
    val start = match.match.start
    val timeLabel = if (start == null) {
        "TBD"
    } else {
        val end = match.match.end.takeIf { matchEnd -> matchEnd != null && matchEnd > start } ?: start.plus(1.hours)
        formatEntryWindow(start, end, timeZone)
    }
    val officialSummary = remember(match.match, event?.officialPositions) {
        val labels = match.match.officialAssignmentLabels(event?.officialPositions.orEmpty())
        when {
            labels.isNotEmpty() -> "Officials: ${labels.joinToString(", ")}"
            !match.match.teamOfficialId.isNullOrBlank() || match.teamOfficial != null -> "Team official assigned"
            !match.match.officialId.isNullOrBlank() -> "Official assigned"
            else -> null
        }
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 20.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        shape = RoundedCornerShape(14.dp),
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .height(if (officialSummary != null) 110.dp else 90.dp)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "$team1Name vs $team2Name",
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = fieldLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = timeLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            officialSummary?.let { summary ->
                Text(
                    text = summary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun buildScheduleItems(
    events: List<Event>,
    matches: List<MatchMVP>,
    teams: List<Team>,
    fields: List<Field>,
): List<ScheduleItem> {
    val teamsById = teams.associateBy { it.id }
    val fieldsById = fields.associateBy { it.id }
    val eventIdsWithMatches = matches.map { it.eventId }.toSet()

    val matchItems = matches.map { match ->
        ScheduleItem.MatchEntry(
            match = MatchWithRelations(
                match = match,
                field = match.fieldId?.let { fieldId -> fieldsById[fieldId] },
                team1 = match.team1Id?.let { teamId -> teamsById[teamId] },
                team2 = match.team2Id?.let { teamId -> teamsById[teamId] },
                teamOfficial = match.teamOfficialId?.let { teamId -> teamsById[teamId] },
                winnerNextMatch = null,
                loserNextMatch = null,
                previousLeftMatch = null,
                previousRightMatch = null,
            ),
        )
    }

    val eventItems = events
        .filter { event -> event.id !in eventIdsWithMatches }
        .map { event -> ScheduleItem.EventEntry(event = event) }

    return (eventItems + matchItems).sortedBy { it.start }
}

private fun buildScheduleFields(
    fields: List<Field>,
    matches: List<MatchMVP>,
): List<FieldWithMatches> {
    val matchesByFieldId = matches.groupBy { match -> match.fieldId }
    return fields.map { field ->
        FieldWithMatches(
            field = field,
            matches = matchesByFieldId[field.id].orEmpty(),
        )
    }
}

private fun formatEntryWindow(start: Instant, end: Instant, timeZone: TimeZone): String {
    val localStart = start.toLocalDateTime(timeZone)
    val localEnd = end.toLocalDateTime(timeZone)
    return "${localStart.time.format(timeFormat)} - ${localEnd.time.format(timeFormat)}"
}
