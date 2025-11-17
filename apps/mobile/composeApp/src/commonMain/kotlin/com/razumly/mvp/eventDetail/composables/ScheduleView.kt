package com.razumly.mvp.eventDetail.composables

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kizitonwose.calendar.compose.HorizontalCalendar
import com.kizitonwose.calendar.compose.rememberCalendarState
import com.kizitonwose.calendar.core.CalendarDay
import com.kizitonwose.calendar.core.DayPosition
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.timeFormat
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.YearMonth
import kotlinx.datetime.number
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock

@Composable
fun ScheduleView(
    matches: List<MatchWithRelations>,
    showFab: (Boolean) -> Unit,
    onMatchClick: (MatchWithRelations) -> Unit,
) {
    if (matches.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text("No scheduled matches yet.", style = MaterialTheme.typography.bodyMedium)
        }
        showFab(true)
        return
    }

    val navPadding = LocalNavBarPadding.current
    val timeZone = remember { TimeZone.currentSystemDefault() }
    val sortedMatches = remember(matches, timeZone) {
        matches.sortedBy { it.match.start }
    }
    val matchesByDate = remember(sortedMatches) {
        sortedMatches.groupBy { it.match.start.toLocalDateTime(timeZone).date }
    }
    val sortedDates = remember(matchesByDate) { matchesByDate.keys.sorted() }
    val today = remember { Clock.System.now().toLocalDateTime(timeZone).date }
    val defaultDate = remember(sortedDates, today) {
        sortedDates.firstOrNull { it >= today } ?: sortedDates.first()
    }
    var selectedDate by remember(defaultDate) { mutableStateOf(defaultDate) }
    LaunchedEffect(sortedDates) {
        if (selectedDate !in matchesByDate.keys) {
            selectedDate = sortedDates.first()
        }
    }
    val startMonth = remember(sortedDates) { sortedDates.first().toYearMonth() }
    val endMonth = remember(sortedDates) { sortedDates.last().toYearMonth() }
    val calendarState = rememberCalendarState(
        startMonth = startMonth,
        endMonth = endMonth,
        firstVisibleMonth = selectedDate.toYearMonth(),
    )
    val coroutineScope = rememberCoroutineScope()
    val lazyListState = rememberLazyListState()
    val isScrollingUp by lazyListState.isScrollingUp()
    showFab(isScrollingUp)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        HorizontalCalendar(
            state = calendarState,
            monthHeader = { calendarMonth ->
                val currentMonth = calendarMonth.yearMonth
                SimpleCalendarTitle(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    currentMonth = currentMonth,
                    goToPrevious = {
                        val previous = currentMonth.previousMonth()
                        if (previous.toMonthIndex() >= startMonth.toMonthIndex()) {
                            coroutineScope.launch {
                                calendarState.animateScrollToMonth(previous)
                            }
                        }
                    },
                    goToNext = {
                        val next = currentMonth.nextMonth()
                        if (next.toMonthIndex() <= endMonth.toMonthIndex()) {
                            coroutineScope.launch {
                                calendarState.animateScrollToMonth(next)
                            }
                        }
                    }
                )
            },
            contentPadding = PaddingValues(horizontal = 16.dp),
            dayContent = { day ->
                ScheduleDay(
                    day = day,
                    isSelected = day.date == selectedDate,
                    hasMatches = matchesByDate.containsKey(day.date),
                    onClick = { selectedDate = day.date }
                )
            }
        )

        Spacer(modifier = Modifier.height(16.dp))

        val dayMatches = matchesByDate[selectedDate].orEmpty()
        DaySummaryHeader(selectedDate, dayMatches.size)

        Spacer(modifier = Modifier.height(8.dp))

        if (dayMatches.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "No matches scheduled for this day.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = lazyListState,
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = navPadding
            ) {
                items(dayMatches, key = { it.match.id }) { match ->
                    ScheduleMatchCard(
                        match = match,
                        timeZone = timeZone,
                        onClick = { onMatchClick(match) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ScheduleDay(
    day: CalendarDay,
    isSelected: Boolean,
    hasMatches: Boolean,
    onClick: () -> Unit
) {
    val enabled = day.position == DayPosition.MonthDate
    val background = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent
    val contentColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
        isSelected -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurface
    }

    Box(
        modifier = Modifier
            .padding(6.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .background(background)
            .padding(vertical = 6.dp, horizontal = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = day.date.dayOfMonth.toString(),
                color = contentColor,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
            )
            if (hasMatches) {
                Box(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .height(4.dp)
                        .fillMaxWidth(0.3f)
                        .clip(CircleShape)
                        .background(
                            if (isSelected) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.primary
                        )
                )
            }
        }
    }
}

@Composable
private fun DaySummaryHeader(date: LocalDate, matchCount: Int) {
    val formattedDate = remember(date) { formatDate(date) }
    val matchLabel = if (matchCount == 1) "match" else "matches"
    Text(
        text = "$formattedDate - $matchCount $matchLabel",
        modifier = Modifier.padding(horizontal = 16.dp),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun ScheduleMatchCard(
    match: MatchWithRelations,
    timeZone: TimeZone,
    onClick: () -> Unit
) {
    val localDateTime = remember(match.match.start, timeZone) {
        match.match.start.toLocalDateTime(timeZone)
    }
    val timeText = remember(localDateTime) { timeFormat.format(localDateTime.time) }
    val fieldLabel = match.field?.fieldNumber?.toString() ?: "TBD"
    val teamOne = match.team1?.displayName.orEmpty().ifBlank { "TBD" }
    val teamTwo = match.team2?.displayName.orEmpty().ifBlank { "TBD" }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant
        )
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "$teamOne vs $teamTwo",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "$timeText - Field $fieldLabel",
                style = MaterialTheme.typography.bodyMedium
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Division: ${match.match.division}",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    text = scoreLine(match),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

private fun scoreLine(match: MatchWithRelations): String {
    val team1Score = match.match.team1Points.takeIf { it.isNotEmpty() }?.joinToString("-")
    val team2Score = match.match.team2Points.takeIf { it.isNotEmpty() }?.joinToString("-")
    return if (team1Score != null && team2Score != null) {
        "$team1Score : $team2Score"
    } else {
        "Score TBD"
    }
}

private fun formatDate(date: LocalDate): String {
    val monthName = date.month.displayName()
    return "$monthName ${date.day}, ${date.year}"
}

private fun rememberCalendarLabel(yearMonth: YearMonth): String {
    val month = yearMonth.month.displayName()
    return "$month ${yearMonth.year}"
}

private fun YearMonth.toMonthIndex(): Int = year * 12 + month.number

private fun YearMonth.previousMonth(): YearMonth {
    val prevMonthNumber = if (month.number == 1) 12 else month.number - 1
    val prevYear = if (month.number == 1) year - 1 else year
    return YearMonth(prevYear, prevMonthNumber)
}

private fun YearMonth.nextMonth(): YearMonth {
    val nextMonthNumber = if (month.number == 12) 1 else month.number + 1
    val nextYear = if (month.number == 12) year + 1 else year
    return YearMonth(nextYear, nextMonthNumber)
}

private fun LocalDate.toYearMonth(): YearMonth = YearMonth(year, month.number)

private fun Month.displayName(): String =
    name.lowercase().replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }

@Composable
private fun SimpleCalendarTitle(
    modifier: Modifier,
    currentMonth: YearMonth,
    isHorizontal: Boolean = true,
    goToPrevious: () -> Unit,
    goToNext: () -> Unit,
) {
    Row(
        modifier = modifier.height(40.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CalendarNavigationIcon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = "Previous",
            onClick = goToPrevious,
            isHorizontal = isHorizontal,
        )
        Text(
            modifier = Modifier
                .weight(1f),
            text = rememberCalendarLabel(currentMonth),
            fontSize = 22.sp,
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.Medium,
        )
        CalendarNavigationIcon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = "Next",
            onClick = goToNext,
            isHorizontal = isHorizontal,
        )
    }
}

@Composable
private fun CalendarNavigationIcon(
    imageVector: ImageVector,
    contentDescription: String,
    isHorizontal: Boolean = true,
    onClick: () -> Unit,
) = Box(
    modifier = Modifier
        .fillMaxHeight()
        .aspectRatio(1f)
        .clip(shape = CircleShape)
        .clickable(role = Role.Button, onClick = onClick),
) {
    val rotation by animateFloatAsState(if (isHorizontal) 0f else 90f)
    Icon(
        modifier = Modifier
            .fillMaxSize()
            .padding(4.dp)
            .align(Alignment.Center)
            .rotate(rotation),
        imageVector = imageVector,
        contentDescription = contentDescription,
    )
}
