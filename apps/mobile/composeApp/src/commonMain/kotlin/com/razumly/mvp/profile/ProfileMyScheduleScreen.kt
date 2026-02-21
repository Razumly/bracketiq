package com.razumly.mvp.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kizitonwose.calendar.compose.HorizontalCalendar
import com.kizitonwose.calendar.compose.WeekCalendar
import com.kizitonwose.calendar.compose.rememberCalendarState
import com.kizitonwose.calendar.compose.weekcalendar.rememberWeekCalendarState
import com.kizitonwose.calendar.core.CalendarDay
import com.kizitonwose.calendar.core.DayPosition
import com.kizitonwose.calendar.core.Week
import com.kizitonwose.calendar.core.WeekDayPosition
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.presentation.util.dateFormat
import com.razumly.mvp.core.presentation.util.timeFormat
import kotlinx.coroutines.launch
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.YearMonth
import kotlinx.datetime.format
import kotlinx.datetime.minus
import kotlinx.datetime.number
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private enum class ScheduleMode {
    MONTH,
    WEEK,
    DAY,
    AGENDA,
}

private data class ScheduleEntry(
    val id: String,
    val eventId: String,
    val title: String,
    val subtitle: String?,
    val start: Instant,
    val end: Instant,
    val kind: String,
)

@Composable
fun ProfileMyScheduleScreen(component: ProfileComponent) {
    val state by component.myScheduleState.collectAsState()
    val timeZone = remember { TimeZone.currentSystemDefault() }
    val today = remember(timeZone) { Clock.System.now().toLocalDateTime(timeZone).date }
    var mode by rememberSaveable { mutableStateOf(ScheduleMode.MONTH) }

    val entries = remember(state.events, state.matches, state.teams, state.fields) {
        buildScheduleEntries(
            events = state.events,
            matches = state.matches,
            teams = state.teams,
            fields = state.fields,
        )
    }
    val entriesByDate = remember(entries, timeZone) {
        entries.groupBy { entry -> entry.start.toLocalDateTime(timeZone).date }
    }
    val sortedDates = remember(entriesByDate) { entriesByDate.keys.sorted() }
    var selectedDate by remember(sortedDates, today) {
        mutableStateOf(sortedDates.firstOrNull { date -> date >= today } ?: sortedDates.firstOrNull() ?: today)
    }

    LaunchedEffect(component) {
        component.refreshMySchedule()
    }

    LaunchedEffect(sortedDates) {
        if (selectedDate !in entriesByDate.keys) {
            selectedDate = sortedDates.firstOrNull() ?: today
        }
    }

    ProfileSectionScaffold(
        title = "My Schedule",
        description = "Month/week/day view for events and matches you or your teams are part of.",
        onBack = component::onBackClicked,
        onRefresh = component::refreshMySchedule,
        isRefreshing = state.isLoading,
    ) {
        ScheduleModeSelector(
            selected = mode,
            onSelected = { mode = it },
        )

        when (mode) {
            ScheduleMode.MONTH -> {
                MonthDatePicker(
                    selectedDate = selectedDate,
                    highlightedDates = entriesByDate.keys,
                    onSelectedDate = { selectedDate = it },
                )
            }

            ScheduleMode.WEEK -> {
                WeekDatePicker(
                    selectedDate = selectedDate,
                    highlightedDates = entriesByDate.keys,
                    onSelectedDate = { selectedDate = it },
                )
            }

            ScheduleMode.DAY -> {
                DayDatePicker(
                    selectedDate = selectedDate,
                    highlightedDates = entriesByDate.keys,
                    onSelectedDate = { selectedDate = it },
                )
            }

            ScheduleMode.AGENDA -> Unit
        }

        state.error?.let { error ->
            Text(
                text = error,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        if (mode == ScheduleMode.AGENDA) {
            val upcomingEntries = remember(entries) {
                val now = Clock.System.now()
                entries.filter { entry -> entry.end >= now }.sortedBy { it.start }
            }

            Text(
                text = "Upcoming",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (upcomingEntries.isEmpty()) {
                Text(
                    text = "No upcoming schedule entries.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                upcomingEntries.forEach { entry ->
                    ScheduleEntryCard(
                        entry = entry,
                        timeZone = timeZone,
                        onOpenEvent = { component.openScheduleEvent(entry.eventId) },
                    )
                }
            }
        } else {
            val dayEntries = remember(entriesByDate, selectedDate) {
                entriesByDate[selectedDate].orEmpty().sortedBy { it.start }
            }

            Text(
                text = selectedDate.format(dateFormat),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (dayEntries.isEmpty()) {
                Text(
                    text = "No schedule entries for this day.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                dayEntries.forEach { entry ->
                    ScheduleEntryCard(
                        entry = entry,
                        timeZone = timeZone,
                        onOpenEvent = { component.openScheduleEvent(entry.eventId) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ScheduleModeSelector(
    selected: ScheduleMode,
    onSelected: (ScheduleMode) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ScheduleMode.entries.forEach { mode ->
            FilterChip(
                selected = selected == mode,
                onClick = { onSelected(mode) },
                label = {
                    Text(
                        when (mode) {
                            ScheduleMode.MONTH -> "Month"
                            ScheduleMode.WEEK -> "Week"
                            ScheduleMode.DAY -> "Day"
                            ScheduleMode.AGENDA -> "Agenda"
                        },
                    )
                },
            )
        }
    }
}

@Composable
private fun MonthDatePicker(
    selectedDate: LocalDate,
    highlightedDates: Set<LocalDate>,
    onSelectedDate: (LocalDate) -> Unit,
) {
    val firstDate = highlightedDates.minOrNull() ?: selectedDate
    val lastDate = highlightedDates.maxOrNull() ?: selectedDate
    val startMonth = remember(firstDate) { firstDate.toYearMonth().previousMonth() }
    val endMonth = remember(lastDate) { lastDate.toYearMonth().nextMonth() }
    val coroutineScope = rememberCoroutineScope()
    val monthState = rememberCalendarState(
        startMonth = startMonth,
        endMonth = endMonth,
        firstVisibleMonth = selectedDate.toYearMonth(),
        firstDayOfWeek = DayOfWeek.MONDAY,
    )

    HorizontalCalendar(
        state = monthState,
        modifier = Modifier.fillMaxWidth(),
        monthHeader = { month ->
            val currentMonth = month.yearMonth
            CalendarTitle(
                currentMonth = currentMonth,
                onPrevious = {
                    val previous = currentMonth.previousMonth()
                    if (previous.toMonthIndex() >= startMonth.toMonthIndex()) {
                        coroutineScope.launch {
                            monthState.animateScrollToMonth(previous)
                        }
                    }
                },
                onNext = {
                    val next = currentMonth.nextMonth()
                    if (next.toMonthIndex() <= endMonth.toMonthIndex()) {
                        coroutineScope.launch {
                            monthState.animateScrollToMonth(next)
                        }
                    }
                },
            )
        },
        dayContent = { day ->
            CalendarDayCell(
                day = day,
                isSelected = day.date == selectedDate,
                hasEntries = highlightedDates.contains(day.date),
                onClick = { onSelectedDate(day.date) },
            )
        },
    )
}

@Composable
private fun WeekDatePicker(
    selectedDate: LocalDate,
    highlightedDates: Set<LocalDate>,
    onSelectedDate: (LocalDate) -> Unit,
) {
    val selectedEpochDay = remember(selectedDate) { selectedDate.toEpochDays() }
    val weekState = rememberWeekCalendarState(
        startDate = LocalDate.fromEpochDays(selectedEpochDay - 180),
        endDate = LocalDate.fromEpochDays(selectedEpochDay + 180),
        firstVisibleWeekDate = selectedDate,
        firstDayOfWeek = DayOfWeek.MONDAY,
    )

    LaunchedEffect(selectedDate) {
        weekState.animateScrollToDate(selectedDate)
    }

    WeekCalendar(
        state = weekState,
        modifier = Modifier.fillMaxWidth(),
        weekHeader = { week ->
            WeekHeader(week = week)
        },
        dayContent = { day ->
            val isEnabled = day.position == WeekDayPosition.RangeDate
            val isSelected = day.date == selectedDate
            Card(
                modifier = Modifier
                    .padding(horizontal = 2.dp, vertical = 4.dp)
                    .clickable(enabled = isEnabled) { onSelectedDate(day.date) },
                colors = CardDefaults.cardColors(
                    containerColor = when {
                        isSelected -> MaterialTheme.colorScheme.primary
                        highlightedDates.contains(day.date) -> MaterialTheme.colorScheme.primaryContainer
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = when {
                        isSelected -> MaterialTheme.colorScheme.onPrimary
                        highlightedDates.contains(day.date) -> MaterialTheme.colorScheme.onPrimaryContainer
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                ),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = day.date.dayOfWeek.shortLabel(),
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Text(
                        text = day.date.dayOfMonth.toString(),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        },
    )
}

@Composable
private fun DayDatePicker(
    selectedDate: LocalDate,
    highlightedDates: Set<LocalDate>,
    onSelectedDate: (LocalDate) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Button(onClick = { onSelectedDate(selectedDate.minus(DatePeriod(days = 1))) }) {
            Text("Previous")
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = selectedDate.format(dateFormat),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = if (highlightedDates.contains(selectedDate)) "Has schedule entries" else "No entries",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Button(onClick = { onSelectedDate(selectedDate.plus(DatePeriod(days = 1))) }) {
            Text("Next")
        }
    }
}

@Composable
private fun ScheduleEntryCard(
    entry: ScheduleEntry,
    timeZone: TimeZone,
    onOpenEvent: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (entry.kind == "MATCH") {
                MaterialTheme.colorScheme.surfaceContainerLow
            } else {
                MaterialTheme.colorScheme.surfaceContainer
            },
        ),
        shape = RoundedCornerShape(14.dp),
        onClick = onOpenEvent,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = if (entry.kind == "MATCH") "Match" else "Event",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = entry.title,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            entry.subtitle?.let { subtitle ->
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = formatEntryWindow(entry.start, entry.end, timeZone),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CalendarTitle(
    currentMonth: YearMonth,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(40.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CalendarNavigationButton(
            icon = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = "Previous month",
            onClick = onPrevious,
        )
        Text(
            modifier = Modifier.weight(1f),
            text = "${currentMonth.month.displayName()} ${currentMonth.year}",
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
        )
        CalendarNavigationButton(
            icon = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = "Next month",
            onClick = onNext,
        )
    }
}

@Composable
private fun CalendarNavigationButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxHeight()
            .aspectRatio(1f)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = contentDescription)
    }
}

@Composable
private fun CalendarDayCell(
    day: CalendarDay,
    isSelected: Boolean,
    hasEntries: Boolean,
    onClick: () -> Unit,
) {
    val enabled = day.position == DayPosition.MonthDate
    val backgroundColor = when {
        !enabled -> MaterialTheme.colorScheme.surface
        isSelected -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val textColor = when {
        !enabled -> MaterialTheme.colorScheme.outline
        isSelected -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurface
    }

    Box(
        modifier = Modifier
            .padding(horizontal = 2.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(backgroundColor)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = day.date.dayOfMonth.toString(),
                style = MaterialTheme.typography.bodySmall,
                color = textColor,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Box(
                modifier = Modifier
                    .height(6.dp)
                    .aspectRatio(1f)
                    .clip(CircleShape)
                    .background(
                        when {
                            hasEntries && isSelected -> MaterialTheme.colorScheme.onPrimary
                            hasEntries -> MaterialTheme.colorScheme.primary
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        },
                    ),
            )
        }
    }
}

@Composable
private fun WeekHeader(week: Week) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        week.days.forEach { day ->
            Text(
                text = day.date.dayOfWeek.shortLabel(),
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun buildScheduleEntries(
    events: List<Event>,
    matches: List<MatchMVP>,
    teams: List<Team>,
    fields: List<Field>,
): List<ScheduleEntry> {
    val eventsById = events.associateBy { it.id }
    val teamsById = teams.associateBy { it.id }
    val fieldsById = fields.associateBy { it.id }
    val eventIdsWithMatches = matches.map { it.eventId }.toSet()

    val matchEntries = matches.map { match ->
        val event = eventsById[match.eventId]
        val eventName = event?.name?.ifBlank { "Event" } ?: "Event"
        val team1 = match.team1Id?.let { teamsById[it]?.name }?.takeIf { !it.isNullOrBlank() } ?: "TBD"
        val team2 = match.team2Id?.let { teamsById[it]?.name }?.takeIf { !it.isNullOrBlank() } ?: "TBD"
        val fieldName = match.fieldId
            ?.let { fieldId -> fieldsById[fieldId]?.name?.takeIf { !it.isNullOrBlank() } }
            ?: "Field"
        ScheduleEntry(
            id = "match-${match.id}",
            eventId = match.eventId,
            title = "$team1 vs $team2",
            subtitle = "$eventName • $fieldName",
            start = match.start,
            end = match.end ?: match.start.plus(1.hours),
            kind = "MATCH",
        )
    }

    val eventEntries = events
        .filter { event -> event.id !in eventIdsWithMatches }
        .map { event ->
            ScheduleEntry(
                id = "event-${event.id}",
                eventId = event.id,
                title = event.name.ifBlank { "Event" },
                subtitle = event.location.takeIf { it.isNotBlank() },
                start = event.start,
                end = event.end.takeIf { it > event.start } ?: event.start.plus(1.hours),
                kind = "EVENT",
            )
        }

    return (eventEntries + matchEntries).sortedBy { it.start }
}

private fun formatEntryWindow(start: Instant, end: Instant, timeZone: TimeZone): String {
    val localStart = start.toLocalDateTime(timeZone)
    val localEnd = end.toLocalDateTime(timeZone)
    return "${localStart.time.format(timeFormat)} - ${localEnd.time.format(timeFormat)}"
}

private fun DayOfWeek.shortLabel(): String = name.take(3).lowercase().replaceFirstChar { char ->
    if (char.isLowerCase()) char.titlecase() else char.toString()
}

private fun LocalDate.toYearMonth(): YearMonth = YearMonth(year, month.number)

private fun YearMonth.toMonthIndex(): Int = year * 12 + month.number

private fun YearMonth.previousMonth(): YearMonth {
    val monthNumber = if (month.number == 1) 12 else month.number - 1
    val yearValue = if (month.number == 1) year - 1 else year
    return YearMonth(yearValue, monthNumber)
}

private fun YearMonth.nextMonth(): YearMonth {
    val monthNumber = if (month.number == 12) 1 else month.number + 1
    val yearValue = if (month.number == 12) year + 1 else year
    return YearMonth(yearValue, monthNumber)
}

private fun Month.displayName(): String = name.lowercase().replaceFirstChar { char ->
    if (char.isLowerCase()) char.titlecase() else char.toString()
}
