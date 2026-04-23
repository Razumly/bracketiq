package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Announcement
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.addOfficialPosition
import com.razumly.mvp.core.data.dataTypes.addOfficialUser
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.divisionPriceRange
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.hasAnyPaidDivision
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.removeOfficialUser
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.updateOfficialPosition
import com.razumly.mvp.core.data.dataTypes.updateOfficialUserPositions
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.resolveParticipantCapacity
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.PlayerInteractionComponent
import com.razumly.mvp.core.presentation.composables.BillingAddressDialog
import com.razumly.mvp.core.presentation.composables.EmbeddedWebModal
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.PreparePaymentProcessor
import com.razumly.mvp.core.presentation.composables.PullToRefreshContainer
import com.razumly.mvp.core.presentation.composables.StripeButton
import com.razumly.mvp.core.presentation.composables.TeamCard
import com.razumly.mvp.core.presentation.util.buttonTransitionSpec
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.core.presentation.util.toNameCase
import com.razumly.mvp.core.presentation.util.toTitleCase
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.eventDetail.composables.MatchEditDialog
import com.razumly.mvp.eventDetail.composables.ParticipantsSection
import com.razumly.mvp.eventDetail.composables.ParticipantsView
import com.razumly.mvp.eventDetail.composables.ScheduleItem
import com.razumly.mvp.eventDetail.composables.ScheduleView
import com.razumly.mvp.eventDetail.composables.SendNotificationDialog
import com.razumly.mvp.eventDetail.composables.TeamSelectionDialog
import com.razumly.mvp.eventDetail.composables.TournamentBracketView
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.icons.Groups
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.ProfileActionEvents
import com.razumly.mvp.icons.TournamentBracket
import com.razumly.mvp.icons.Trophy
import dev.icerock.moko.geo.LatLng
import kotlin.math.round
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
import kotlinx.coroutines.launch
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

val LocalTournamentComponent =
    compositionLocalOf<EventDetailComponent> { error("No tournament provided") }

private enum class DetailTab(
    val label: String,
    val icon: ImageVector,
) {
    PARTICIPANTS("Participants", MVPIcons.Groups),
    BRACKET("Bracket", MVPIcons.TournamentBracket),
    SCHEDULE("Schedule", MVPIcons.ProfileActionEvents),
    LEAGUES("Standings", MVPIcons.Trophy),
}

internal data class JoinOption(
    val label: String,
    val requiresPayment: Boolean,
    val onClick: () -> Unit
)

internal data class WeeklySessionOption(
    val id: String,
    val slotId: String?,
    val occurrenceDate: String,
    val start: Instant,
    val end: Instant,
    val label: String,
    val divisionLabel: String,
)

private data class BracketDivisionOption(
    val id: String,
    val label: String,
)

private data class EventDetailTabVisuals(
    val badgeContainer: Color,
    val badgeContent: Color,
    val labelColor: Color,
    val borderColor: Color,
)

private data class EventDetailTabIconStyle(
    val size: androidx.compose.ui.unit.Dp,
    val xOffset: androidx.compose.ui.unit.Dp = 0.dp,
    val yOffset: androidx.compose.ui.unit.Dp = 0.dp,
)

@Composable
private fun eventDetailTabVisuals(selected: Boolean): EventDetailTabVisuals {
    val colorScheme = MaterialTheme.colorScheme
    return if (selected) {
        EventDetailTabVisuals(
            badgeContainer = colorScheme.primary,
            badgeContent = colorScheme.onPrimary,
            labelColor = colorScheme.onSurface,
            borderColor = colorScheme.primary.copy(alpha = 0.2f),
        )
    } else {
        EventDetailTabVisuals(
            badgeContainer = colorScheme.surfaceContainerHigh,
            badgeContent = colorScheme.primary.copy(alpha = 0.88f),
            labelColor = colorScheme.onSurfaceVariant,
            borderColor = colorScheme.outlineVariant,
        )
    }
}

@Composable
private fun eventDetailTabIconStyle(tab: DetailTab): EventDetailTabIconStyle =
    when (tab) {
        DetailTab.BRACKET -> EventDetailTabIconStyle(size = 20.dp)
        DetailTab.PARTICIPANTS -> EventDetailTabIconStyle(size = 20.dp)
        DetailTab.SCHEDULE -> EventDetailTabIconStyle(size = 20.dp)
        DetailTab.LEAGUES -> EventDetailTabIconStyle(size = 20.dp)
    }

@Composable
private fun EventDetailTabIcon(
    tab: DetailTab,
    selected: Boolean,
    modifier: Modifier = Modifier,
) {
    val visuals = eventDetailTabVisuals(selected)
    val iconStyle = eventDetailTabIconStyle(tab)
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = visuals.badgeContainer,
        contentColor = visuals.badgeContent,
        shadowElevation = if (selected) 2.dp else 0.dp,
        tonalElevation = if (selected) 2.dp else 0.dp,
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .border(
                    width = 1.dp,
                    color = visuals.borderColor,
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = tab.icon,
                contentDescription = null,
                modifier = Modifier
                    .offset(x = iconStyle.xOffset, y = iconStyle.yOffset)
                    .size(iconStyle.size),
            )
        }
    }
}

@Composable
private fun RowScope.EventDetailTabButton(
    tab: DetailTab,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val visuals = eventDetailTabVisuals(selected)
    Column(
        modifier = Modifier
            .weight(1f)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        EventDetailTabIcon(
            tab = tab,
            selected = selected,
        )
        Text(
            text = tab.label,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            color = visuals.labelColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Box(
            modifier = Modifier
                .width(if (selected) 28.dp else 18.dp)
                .height(3.dp)
                .background(
                    color = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)
                    },
                    shape = RoundedCornerShape(999.dp),
                )
        )
    }
}

@Composable
private fun EventDetailTabStrip(
    availableTabs: List<DetailTab>,
    selectedTab: DetailTab,
    onTabSelected: (DetailTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        tonalElevation = 1.dp,
        shadowElevation = 4.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            availableTabs.forEach { tab ->
                EventDetailTabButton(
                    tab = tab,
                    selected = selectedTab == tab,
                    onClick = { onTabSelected(tab) },
                )
            }
        }
    }
}

internal fun canViewOfficialsPanel(
    currentUserId: String,
    event: Event,
    organization: Organization?,
): Boolean {
    val normalizedCurrentUserId = currentUserId.trim()
    if (normalizedCurrentUserId.isBlank()) {
        return false
    }
    return event.hostId == normalizedCurrentUserId ||
        event.assistantHostIds.any { assistantHostId -> assistantHostId == normalizedCurrentUserId } ||
        isCurrentUserEventOfficial(normalizedCurrentUserId, event) ||
        organization?.ownerId == normalizedCurrentUserId ||
        organization?.hostIds?.any { hostId -> hostId == normalizedCurrentUserId } == true
}

internal fun isCurrentUserEventOfficial(
    currentUserId: String,
    event: Event,
): Boolean {
    val normalizedCurrentUserId = currentUserId.trim()
    if (normalizedCurrentUserId.isBlank()) {
        return false
    }
    val activeEventOfficialIds = event.eventOfficials
        .asSequence()
        .filter { official -> official.isActive }
        .map { official -> official.userId.trim() }
        .filter { officialId -> officialId.isNotBlank() }
        .toList()
    return if (activeEventOfficialIds.isNotEmpty()) {
        activeEventOfficialIds.any { officialId -> officialId == normalizedCurrentUserId }
    } else {
        event.officialIds.any { officialId -> officialId.trim() == normalizedCurrentUserId }
    }
}

private fun List<BracketDivisionOption>.resolveSelectedDivisionId(preferredId: String?): String? {
    if (isEmpty()) return null
    val normalizedPreferred = preferredId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    return firstOrNull { option -> option.id == normalizedPreferred }?.id
        ?: first().id
}

internal fun buildWeeklySessionOptions(
    event: Event,
    timeSlots: List<TimeSlot>,
): List<WeeklySessionOption> {
    if (event.eventType != EventType.WEEKLY_EVENT || timeSlots.isEmpty()) {
        return emptyList()
    }

    val timeZone = TimeZone.currentSystemDefault()
    val today = Clock.System.now().toLocalDateTime(timeZone).date
    val fallbackDivisionIds = event.divisions
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .distinct()
    val sessions = mutableListOf<WeeklySessionOption>()
    val safeWeekCount = 3

    timeSlots.forEach { slot ->
        val normalizedDays = slot.normalizedDaysOfWeek()
        val startMinutes = slot.startTimeMinutes
        val endMinutes = slot.endTimeMinutes
        if (normalizedDays.isEmpty() || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
            return@forEach
        }

        val slotStartDate = slot.startDate.toLocalDateTime(timeZone).date
        val rawSlotEndDate = slot.endDate?.toLocalDateTime(timeZone)?.date
        val slotEndDate = rawSlotEndDate?.takeIf { endDate ->
            endDate > slotStartDate
        }
        val anchorDate = if (today > slotStartDate) today else slotStartDate
        val anchorWeekStart = startOfWeekMonday(anchorDate)

        val slotDivisionIds = slot.normalizedDivisionIds()
            .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .distinct()
        val effectiveDivisionIds = if (slotDivisionIds.isNotEmpty()) {
            slotDivisionIds
        } else {
            fallbackDivisionIds
        }
        val divisionLabel = effectiveDivisionIds
            .map { divisionId -> divisionId.toDivisionDisplayLabel(event.divisionDetails) }
            .filter(String::isNotBlank)
            .distinct()
            .joinToString(", ")
            .ifBlank { "All divisions" }

        for (weekOffset in 0 until safeWeekCount) {
            val weekStart = anchorWeekStart.plus(DatePeriod(days = weekOffset * 7))
            normalizedDays.forEach { weekday ->
                val occurrenceDate = weekStart.plus(DatePeriod(days = weekday))
                if (occurrenceDate < anchorDate || occurrenceDate < slotStartDate) {
                    return@forEach
                }
                if (slotEndDate != null && occurrenceDate > slotEndDate) {
                    return@forEach
                }

                val baseInstant = occurrenceDate.atStartOfDayIn(timeZone)
                val sessionStart = baseInstant + startMinutes.minutes
                val sessionEnd = baseInstant + endMinutes.minutes
                if (sessionEnd <= sessionStart) {
                    return@forEach
                }
                val slotId = slot.id.trim().takeIf(String::isNotBlank)
                sessions += WeeklySessionOption(
                    id = "${slotId ?: "slot"}-${occurrenceDate}",
                    slotId = slotId,
                    occurrenceDate = occurrenceDate.toString(),
                    start = sessionStart,
                    end = sessionEnd,
                    label = formatWeeklySessionLabel(sessionStart, sessionEnd, timeZone),
                    divisionLabel = divisionLabel,
                )
            }
        }
    }

    return sessions
        .distinctBy { session -> session.id }
        .sortedBy { session -> session.start }
}

internal fun buildWeeklyScheduleOptions(
    event: Event,
    timeSlots: List<TimeSlot>,
): List<WeeklySessionOption> {
    if (event.eventType != EventType.WEEKLY_EVENT || timeSlots.isEmpty()) {
        return emptyList()
    }

    val timeZone = TimeZone.currentSystemDefault()
    val eventStartDate = event.start.toLocalDateTime(timeZone).date
    val fallbackScheduleWindowDays = 365
    val fallbackDivisionIds = event.divisions
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .distinct()
    val sessions = mutableListOf<WeeklySessionOption>()

    timeSlots.forEach { slot ->
        val normalizedDays = slot.normalizedDaysOfWeek()
        val startMinutes = slot.startTimeMinutes
        val endMinutes = slot.endTimeMinutes
        if (normalizedDays.isEmpty() || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
            return@forEach
        }

        val slotStartDate = slot.startDate.toLocalDateTime(timeZone).date
        val effectiveStartDate = if (eventStartDate > slotStartDate) eventStartDate else slotStartDate
        val slotEndDate = slot.endDate?.toLocalDateTime(timeZone)?.date
            ?.takeIf { endDate -> endDate >= effectiveStartDate }
            ?: effectiveStartDate.plus(DatePeriod(days = fallbackScheduleWindowDays))
        val anchorWeekStart = startOfWeekMonday(effectiveStartDate)

        val slotDivisionIds = slot.normalizedDivisionIds()
            .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
            .filter(String::isNotBlank)
            .distinct()
        val effectiveDivisionIds = if (slotDivisionIds.isNotEmpty()) {
            slotDivisionIds
        } else {
            fallbackDivisionIds
        }
        val divisionLabel = effectiveDivisionIds
            .map { divisionId -> divisionId.toDivisionDisplayLabel(event.divisionDetails) }
            .filter(String::isNotBlank)
            .distinct()
            .joinToString(", ")
            .ifBlank { "All divisions" }

        var weekOffset = 0
        while (true) {
            val weekStart = anchorWeekStart.plus(DatePeriod(days = weekOffset * 7))
            if (weekStart > slotEndDate) {
                break
            }
            normalizedDays.forEach { weekday ->
                val occurrenceDate = weekStart.plus(DatePeriod(days = weekday))
                if (occurrenceDate < effectiveStartDate || occurrenceDate < slotStartDate) {
                    return@forEach
                }
                if (occurrenceDate > slotEndDate) {
                    return@forEach
                }

                val baseInstant = occurrenceDate.atStartOfDayIn(timeZone)
                val sessionStart = baseInstant + startMinutes.minutes
                val sessionEnd = baseInstant + endMinutes.minutes
                if (sessionEnd <= sessionStart) {
                    return@forEach
                }
                val slotId = slot.id.trim().takeIf(String::isNotBlank)
                sessions += WeeklySessionOption(
                    id = "${slotId ?: "slot"}-${occurrenceDate}",
                    slotId = slotId,
                    occurrenceDate = occurrenceDate.toString(),
                    start = sessionStart,
                    end = sessionEnd,
                    label = formatWeeklySessionLabel(sessionStart, sessionEnd, timeZone),
                    divisionLabel = divisionLabel,
                )
            }
            weekOffset += 1
        }
    }

    return sessions
        .distinctBy { session -> session.id }
        .sortedBy { session -> session.start }
}

private fun startOfWeekMonday(date: LocalDate): LocalDate {
    val offsetFromMonday = date.dayOfWeek.toWeeklyDayIndex()
    return date.minus(DatePeriod(days = offsetFromMonday))
}

private fun formatWeeklySessionLabel(
    start: Instant,
    end: Instant,
    timeZone: TimeZone,
): String {
    val localStart = start.toLocalDateTime(timeZone)
    val localEnd = end.toLocalDateTime(timeZone)
    val weekdayLabel = weekdayShortLabel(localStart.date)
    val yearSuffix = (localStart.year % 100).toString().padStart(2, '0')
    val monthNumber = localStart.month.ordinal + 1
    val dateLabel = "$monthNumber/${localStart.day}/$yearSuffix"
    val startLabel = formatMinutesTo12Hour(localStart.hour * 60 + localStart.minute)
    val endLabel = formatMinutesTo12Hour(localEnd.hour * 60 + localEnd.minute)
    return "$weekdayLabel $dateLabel, $startLabel-$endLabel"
}

private fun weekdayShortLabel(date: LocalDate): String {
    return when (date.dayOfWeek) {
        DayOfWeek.MONDAY -> "Mon"
        DayOfWeek.TUESDAY -> "Tue"
        DayOfWeek.WEDNESDAY -> "Wed"
        DayOfWeek.THURSDAY -> "Thu"
        DayOfWeek.FRIDAY -> "Fri"
        DayOfWeek.SATURDAY -> "Sat"
        DayOfWeek.SUNDAY -> "Sun"
    }
}

private fun DayOfWeek.toWeeklyDayIndex(): Int {
    return when (this) {
        DayOfWeek.MONDAY -> 0
        DayOfWeek.TUESDAY -> 1
        DayOfWeek.WEDNESDAY -> 2
        DayOfWeek.THURSDAY -> 3
        DayOfWeek.FRIDAY -> 4
        DayOfWeek.SATURDAY -> 5
        DayOfWeek.SUNDAY -> 6
    }
}

internal fun shouldUseViewSchedulePrimaryAction(
    isWeeklyParentEvent: Boolean,
    isUserInEvent: Boolean,
    isHost: Boolean,
    isAssistantHost: Boolean,
    isEventOfficial: Boolean,
): Boolean = !isWeeklyParentEvent && (
    isUserInEvent || isHost || isAssistantHost || isEventOfficial
)

internal fun shouldShowOverviewRosterSections(event: Event): Boolean =
    event.eventType != EventType.WEEKLY_EVENT

internal fun shouldRenderJoinOptionsActions(
    isWeeklyParentEvent: Boolean,
    selectedWeeklyOccurrenceLabel: String?,
    selectedWeeklyOccurrenceJoined: Boolean,
    selectedWeeklyOccurrenceStarted: Boolean,
): Boolean = !isWeeklyParentEvent || (
    !selectedWeeklyOccurrenceLabel.isNullOrBlank() &&
        !selectedWeeklyOccurrenceJoined &&
        !selectedWeeklyOccurrenceStarted
)

internal fun shouldShowScheduleMatchManagement(eventType: EventType): Boolean =
    eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT

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

private fun WeeklyOccurrenceSummary.isFull(): Boolean =
    participantCapacity?.let { capacity -> capacity > 0 && participantCount >= capacity } == true

private fun formatWeeklyOccurrenceFullness(summary: WeeklyOccurrenceSummary): String {
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

private fun formatMinutesTo12Hour(totalMinutes: Int): String {
    val normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440
    val hour24 = normalizedMinutes / 60
    val minute = normalizedMinutes % 60
    val meridiem = if (hour24 >= 12) "PM" else "AM"
    val hour12 = when (val normalizedHour = hour24 % 12) {
        0 -> 12
        else -> normalizedHour
    }
    return "$hour12:${minute.toString().padStart(2, '0')} $meridiem"
}

@Composable
private fun EventOverviewSections(
    eventWithRelations: EventWithFullRelations,
    teamsAndParticipantsLoading: Boolean,
    matchesLoading: Boolean,
    showFullnessSummary: Boolean,
    selectedWeeklyOccurrenceLabel: String? = null,
    selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary? = null,
    showOpenDetailsAction: Boolean,
    onOpenDetails: () -> Unit,
) {
    val event = eventWithRelations.event
    val showRosterSections = shouldShowOverviewRosterSections(event)
    val capacity = selectedWeeklyOccurrenceSummary?.participantCapacity ?: event.resolveParticipantCapacity()
    val filled = eventWithRelations.resolveOverviewFilledParticipantCount(selectedWeeklyOccurrenceSummary)
    val spotsLeft = if (capacity > 0) (capacity - filled).coerceAtLeast(0) else 0
    val progress = if (capacity > 0) (filled.toFloat() / capacity.toFloat()).coerceIn(0f, 1f) else 0f
    val freeAgentIds = remember(event.freeAgentIds) { event.freeAgentIds.distinct() }
    val waitlistIds = remember(event.waitListIds) { event.waitListIds.distinct() }
    val visibleTeams = remember(event.eventType, event.teamSignup, eventWithRelations.teams) {
        event.visibleTeams(eventWithRelations.teams)
    }
    val teamCapacityLoading = event.teamSignup &&
        teamsAndParticipantsLoading &&
        visibleTeams.isEmpty() &&
        selectedWeeklyOccurrenceSummary == null
    val divisionCapacitySummaries = remember(
        event.id,
        event.teamSignup,
        event.singleDivision,
        visibleTeams,
        event.divisionDetails,
    ) {
        buildDivisionCapacitySummaries(
            event = event,
            divisionDetails = event.divisionDetails,
            teams = visibleTeams,
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
        modifier = Modifier.fillMaxWidth(),
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
            modifier = Modifier.fillMaxWidth(),
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
                    CapacityStat(title = "Left", value = spotsLeft.toString())
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
                if (selectedWeeklyOccurrenceSummary == null && divisionCapacitySummaries.isNotEmpty()) {
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
            if (teamsAndParticipantsLoading) {
                SectionHeader(
                    title = "Teams",
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
                modifier = Modifier.align(Alignment.End),
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
private fun DetailTabLoadingState(message: String) {
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

@Composable
private fun StickyActionBar(
    primaryLabel: String,
    primaryEnabled: Boolean,
    onPrimaryClick: () -> Unit,
    onMapClick: () -> Unit,
    onDirectionsClick: () -> Unit,
    directionsEnabled: Boolean,
    onMapButtonPositioned: (Offset) -> Unit,
    onShareClick: () -> Unit,
    selectedWeeklyOccurrenceLabel: String? = null,
    onClearSelectedWeeklyOccurrence: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var mapButtonCenter by remember { mutableStateOf(Offset.Zero) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        tonalElevation = 3.dp,
        shadowElevation = 6.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (!selectedWeeklyOccurrenceLabel.isNullOrBlank() && onClearSelectedWeeklyOccurrence != null) {
                Button(
                    onClick = onClearSelectedWeeklyOccurrence,
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedWeeklyOccurrenceLabel,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear occurrence",
                        )
                    }
                }
            }
            Button(
                onClick = onPrimaryClick,
                enabled = primaryEnabled,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(14.dp)
            ) {
                Text(
                    text = primaryLabel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            IconButton(
                onClick = {
                    onMapButtonPositioned(mapButtonCenter)
                    onMapClick()
                },
                modifier = Modifier.onGloballyPositioned {
                    mapButtonCenter = it.boundsInWindow().center
                    onMapButtonPositioned(mapButtonCenter)
                }
            ) {
                Icon(Icons.Default.Place, contentDescription = "Map")
            }
            IconButton(
                onClick = onDirectionsClick,
                enabled = directionsEnabled,
            ) {
                Icon(Icons.Default.Directions, contentDescription = "Directions")
            }
            IconButton(onClick = onShareClick) {
                Icon(Icons.Default.Share, contentDescription = "Share")
            }
        }
    }
}

@Composable
private fun BracketFloatingBar(
    selectedDivisionId: String?,
    divisionOptions: List<BracketDivisionOption>,
    onDivisionSelected: (String) -> Unit,
    showBracketToggle: Boolean = false,
    isLosersBracket: Boolean = false,
    onBracketToggle: () -> Unit = {},
    showMatchEditAction: Boolean = false,
    isEditingMatches: Boolean = false,
    onStartMatchEdit: (() -> Unit)? = null,
    onCancelMatchEdit: (() -> Unit)? = null,
    onCommitMatchEdit: (() -> Unit)? = null,
    primaryActionLabel: String? = null,
    onPrimaryActionClick: (() -> Unit)? = null,
    primaryActionEnabled: Boolean = true,
    primaryActionColors: ButtonColors? = null,
    showPrimaryActionFirst: Boolean = false,
    showConfirmResultsAction: Boolean = false,
    confirmResultsEnabled: Boolean = false,
    confirmResultsInProgress: Boolean = false,
    onConfirmResultsClick: () -> Unit = {},
    selectedWeeklyOccurrenceLabel: String? = null,
    onClearSelectedWeeklyOccurrence: (() -> Unit)? = null,
    onShowDetailsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var isDivisionMenuExpanded by remember { mutableStateOf(false) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        tonalElevation = 3.dp,
        shadowElevation = 6.dp
    ) {
        ScrollableFloatingDockRow {
            if (!selectedWeeklyOccurrenceLabel.isNullOrBlank() && onClearSelectedWeeklyOccurrence != null) {
                Button(onClick = onClearSelectedWeeklyOccurrence) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedWeeklyOccurrenceLabel,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear occurrence",
                        )
                    }
                }
            }
            if (showPrimaryActionFirst && !primaryActionLabel.isNullOrBlank() && onPrimaryActionClick != null) {
                Button(
                    onClick = onPrimaryActionClick,
                    enabled = primaryActionEnabled,
                    colors = primaryActionColors ?: ButtonDefaults.buttonColors(),
                ) {
                    Text(
                        text = primaryActionLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (divisionOptions.isNotEmpty()) {
                Box {
                    Button(
                        onClick = { isDivisionMenuExpanded = true },
                        modifier = Modifier.widthIn(min = 120.dp),
                    ) {
                        Text(text = "Division")
                    }
                    DropdownMenu(
                        expanded = isDivisionMenuExpanded,
                        onDismissRequest = { isDivisionMenuExpanded = false }
                    ) {
                        divisionOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option.label) },
                                onClick = {
                                    isDivisionMenuExpanded = false
                                    onDivisionSelected(option.id)
                                },
                                leadingIcon = {
                                    if (option.id == selectedDivisionId) {
                                        Icon(
                                            imageVector = Icons.Default.Check,
                                            contentDescription = null
                                        )
                                    }
                                }
                            )
                        }
                    }
                }
            }
            if (showBracketToggle) {
                Button(onClick = onBracketToggle) {
                    Text(
                        text = if (isLosersBracket) "Losers Bracket" else "Winners Bracket",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (showMatchEditAction) {
                if (isEditingMatches && onCommitMatchEdit != null && onCancelMatchEdit != null) {
                    Button(onClick = onCommitMatchEdit) {
                        Text("Save")
                    }
                    Button(onClick = onCancelMatchEdit) {
                        Text("Cancel")
                    }
                } else if (!isEditingMatches && onStartMatchEdit != null) {
                    Button(onClick = onStartMatchEdit) {
                        Text("Manage")
                    }
                }
            }
            if (showConfirmResultsAction) {
                Button(
                    onClick = onConfirmResultsClick,
                    enabled = confirmResultsEnabled
                ) {
                    Text(
                        text = if (confirmResultsInProgress) "Confirming..." else "Confirm Results",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (!showPrimaryActionFirst &&
                !primaryActionLabel.isNullOrBlank() &&
                onPrimaryActionClick != null
            ) {
                Button(
                    onClick = onPrimaryActionClick,
                    enabled = primaryActionEnabled,
                    colors = primaryActionColors ?: ButtonDefaults.buttonColors(),
                ) {
                    Text(
                        text = primaryActionLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Button(
                onClick = onShowDetailsClick,
            ) {
                Text(
                    text = "Back to details",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
@Suppress("DEPRECATION")
private fun ScrollableFloatingDockRow(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    var rowSize by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val showLeftIndicator by remember { derivedStateOf { scrollState.value > 0 } }
    val showRightIndicator by remember { derivedStateOf { scrollState.value < scrollState.maxValue } }
    val rowHeight = with(density) { rowSize.height.toDp() }

    Box(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .onSizeChanged { rowSize = it }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
        DockEdgeFade(
            visible = showLeftIndicator && rowSize.height > 0,
            isLeft = true,
            height = rowHeight,
            modifier = Modifier.align(Alignment.CenterStart),
        )
        DockEdgeFade(
            visible = showRightIndicator && rowSize.height > 0,
            isLeft = false,
            height = rowHeight,
            modifier = Modifier.align(Alignment.CenterEnd),
        )
        DockScrollIndicator(
            visible = showLeftIndicator,
            icon = Icons.Filled.KeyboardArrowLeft,
            contentDescription = "Scroll dock left",
            onClick = {
                coroutineScope.launch {
                    val target = (scrollState.value - 220).coerceAtLeast(0)
                    scrollState.animateScrollTo(target)
                }
            },
            modifier = Modifier.align(Alignment.CenterStart),
        )
        DockScrollIndicator(
            visible = showRightIndicator,
            icon = Icons.Filled.KeyboardArrowRight,
            contentDescription = "Scroll dock right",
            onClick = {
                coroutineScope.launch {
                    val target = (scrollState.value + 220).coerceAtMost(scrollState.maxValue)
                    scrollState.animateScrollTo(target)
                }
            },
            modifier = Modifier.align(Alignment.CenterEnd),
        )
    }
}

@Composable
private fun DockEdgeFade(
    visible: Boolean,
    isLeft: Boolean,
    height: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier,
) {
    if (!visible) return
    val surfaceColor = MaterialTheme.colorScheme.surface
    val colors = if (isLeft) {
        listOf(surfaceColor, surfaceColor.copy(alpha = 0f))
    } else {
        listOf(surfaceColor.copy(alpha = 0f), surfaceColor)
    }
    Box(
        modifier = modifier
            .height(height)
            .width(28.dp)
            .background(Brush.horizontalGradient(colors))
    )
}

@Composable
private fun DockScrollIndicator(
    visible: Boolean,
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!visible) return
    IconButton(
        onClick = onClick,
        modifier = modifier.padding(horizontal = 2.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ParticipantsFloatingBar(
    selectedSection: ParticipantsSection,
    availableSections: List<ParticipantsSection>,
    onSectionSelected: (ParticipantsSection) -> Unit,
    showManageAction: Boolean = false,
    isManagingParticipants: Boolean = false,
    onStartManagingParticipants: (() -> Unit)? = null,
    onStopManagingParticipants: (() -> Unit)? = null,
    selectedWeeklyOccurrenceLabel: String? = null,
    onClearSelectedWeeklyOccurrence: (() -> Unit)? = null,
    onShowDetailsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var isSectionMenuExpanded by remember { mutableStateOf(false) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        tonalElevation = 3.dp,
        shadowElevation = 6.dp
    ) {
        ScrollableFloatingDockRow {
            if (!selectedWeeklyOccurrenceLabel.isNullOrBlank() && onClearSelectedWeeklyOccurrence != null) {
                Button(onClick = onClearSelectedWeeklyOccurrence) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedWeeklyOccurrenceLabel,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear occurrence",
                        )
                    }
                }
            }
            Box {
                Button(
                    onClick = { isSectionMenuExpanded = true },
                    modifier = Modifier.widthIn(min = 120.dp)
                ) {
                    Text(
                        text = selectedSection.label,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                DropdownMenu(
                    expanded = isSectionMenuExpanded,
                    onDismissRequest = { isSectionMenuExpanded = false }
                ) {
                    availableSections.forEach { section ->
                        DropdownMenuItem(
                            text = { Text(section.label) },
                            onClick = {
                                isSectionMenuExpanded = false
                                onSectionSelected(section)
                            },
                            leadingIcon = {
                                if (section == selectedSection) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = null
                                    )
                                }
                            }
                        )
                    }
                }
            }
            if (showManageAction) {
                if (isManagingParticipants && onStopManagingParticipants != null) {
                    Button(onClick = onStopManagingParticipants) {
                        Text("Done")
                    }
                } else if (!isManagingParticipants && onStartManagingParticipants != null) {
                    Button(onClick = onStartManagingParticipants) {
                        Text("Manage")
                    }
                }
            }
            Button(
                onClick = onShowDetailsClick,
            ) {
                Text(
                    text = "Back to details",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun JoinOptionsSheet(
    options: List<JoinOption>,
    paymentProcessor: EventDetailComponent,
    isWeeklyParentEvent: Boolean,
    weeklySessionOptions: List<WeeklySessionOption>,
    weeklyOccurrenceSummaries: Map<String, WeeklyOccurrenceSummary>,
    selectedWeeklyOccurrenceLabel: String?,
    selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary?,
    selectedWeeklyOccurrenceJoined: Boolean,
    selectedWeeklyOccurrenceStarted: Boolean,
    selectedDivisionId: String?,
    divisionOptions: List<BracketDivisionOption>,
    onDivisionSelected: (String) -> Unit,
    onDismiss: () -> Unit,
    onSelectOption: (JoinOption) -> Unit,
    onSelectWeeklySession: (WeeklySessionOption) -> Unit,
) {
    var isDivisionMenuExpanded by remember { mutableStateOf(false) }
    var divisionMenuAnchorSize by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val sheetScrollState = rememberScrollState()
    val hasRequiredDivisionSelection = remember(selectedDivisionId, divisionOptions) {
        selectedDivisionId?.let { selectedId ->
            divisionOptions.any { option -> option.id == selectedId }
        } == true
    }
    val shouldEnableJoinActions = divisionOptions.isEmpty() || hasRequiredDivisionSelection
    val selectedDivisionLabel = remember(selectedDivisionId, divisionOptions) {
        val selected = divisionOptions.firstOrNull { it.id == selectedDivisionId }
        selected?.label.orEmpty()
    }
    val showWeeklySelectionList = isWeeklyParentEvent

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(0.9f),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = maxHeight)
                .verticalScroll(sheetScrollState)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Join options",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold
            )
            if (showWeeklySelectionList) {
                Text(
                    text = "Select a weekly occurrence",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                if (weeklySessionOptions.isEmpty()) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                    ) {
                        Text(
                            text = "No upcoming weekly occurrences are available.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        weeklySessionOptions.forEach { session ->
                            val summary = weeklyOccurrenceSummaryKey(
                                slotId = session.slotId,
                                occurrenceDate = session.occurrenceDate,
                            )?.let(weeklyOccurrenceSummaries::get)
                            Button(
                                onClick = { onSelectWeeklySession(session) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                    horizontalAlignment = Alignment.Start,
                                ) {
                                    Text(
                                        text = session.label,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = "Divisions: ${session.divisionLabel}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                    Text(
                                        text = summary?.let(::formatWeeklyOccurrenceFullness) ?: "Tap to continue",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (isWeeklyParentEvent && !selectedWeeklyOccurrenceLabel.isNullOrBlank()) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "Occurrence: $selectedWeeklyOccurrenceLabel",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (selectedWeeklyOccurrenceSummary != null) {
                        Text(
                            text = formatWeeklyOccurrenceFullness(selectedWeeklyOccurrenceSummary),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = if (selectedWeeklyOccurrenceSummary.isFull()) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
            if (isWeeklyParentEvent && selectedWeeklyOccurrenceStarted) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.45f),
                ) {
                    Text(
                        text = "This occurrence has already started.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            } else if (isWeeklyParentEvent && selectedWeeklyOccurrenceJoined) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                ) {
                    Text(
                        text = "Already registered for this occurrence. Select another occurrence to continue.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            val shouldRenderJoinOptions = shouldRenderJoinOptionsActions(
                isWeeklyParentEvent = isWeeklyParentEvent,
                selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrenceLabel,
                selectedWeeklyOccurrenceJoined = selectedWeeklyOccurrenceJoined,
                selectedWeeklyOccurrenceStarted = selectedWeeklyOccurrenceStarted,
            )
            if (shouldRenderJoinOptions) {
                if (divisionOptions.isNotEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = { isDivisionMenuExpanded = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .onSizeChanged { size -> divisionMenuAnchorSize = size }
                        ) {
                            val label = if (selectedDivisionLabel.isNotBlank()) {
                                "Division: $selectedDivisionLabel"
                            } else {
                                "select a division"
                            }
                            Text(label)
                        }
                        DropdownMenu(
                            expanded = isDivisionMenuExpanded,
                            onDismissRequest = { isDivisionMenuExpanded = false },
                            modifier = if (divisionMenuAnchorSize.width > 0) {
                                Modifier.width(with(density) { divisionMenuAnchorSize.width.toDp() })
                            } else {
                                Modifier
                            }
                        ) {
                            divisionOptions.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option.label) },
                                    onClick = {
                                        isDivisionMenuExpanded = false
                                        onDivisionSelected(option.id)
                                    },
                                    leadingIcon = {
                                        if (option.id == selectedDivisionId) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null
                                            )
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
                options.forEach { option ->
                    if (option.requiresPayment) {
                        if (shouldEnableJoinActions) {
                            StripeButton(
                                onClick = { onSelectOption(option) },
                                paymentProcessor = paymentProcessor,
                                text = option.label,
                                colors = ButtonDefaults.buttonColors(),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        } else {
                            Button(
                                onClick = {},
                                enabled = false,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(option.label)
                            }
                        }
                    } else {
                        Button(
                            onClick = { onSelectOption(option) },
                            enabled = shouldEnableJoinActions,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(option.label)
                        }
                    }
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) {
                Text("Close")
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@Composable
@OptIn(ExperimentalTime::class, ExperimentalMaterial3Api::class)
fun EventDetailScreen(
    component: EventDetailComponent, mapComponent: MapComponent
) {
    PreparePaymentProcessor(component)

    val popupHandler = LocalPopupHandler.current
    val loadingHandler = LocalLoadingHandler.current
    val selectedEvent by component.eventWithRelations.collectAsState()
    val sports by component.sports.collectAsState()
    val currentUser by component.currentUser.collectAsState()
    val playerInteractionComponent = remember {
        getKoin().get<PlayerInteractionComponent> { parametersOf(component) }
    }
    val scheduleTrackedUserIds by component.scheduleTrackedUserIds.collectAsState()
    val validTeams by component.validTeams.collectAsState()
    val showDetails by component.showDetails.collectAsState()
    val eventTeamsAndParticipantsLoading by component.eventTeamsAndParticipantsLoading.collectAsState()
    val eventMatchesLoading by component.eventMatchesLoading.collectAsState()
    val editedEvent by component.editedEvent.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val showFeeBreakdown by component.showFeeBreakdown.collectAsState()
    val currentFeeBreakdown by component.currentFeeBreakdown.collectAsState()
    val editableMatches by component.editableMatches.collectAsState()
    val eventFields by component.eventFields.collectAsState()
    val selectedDivision by component.selectedDivision.collectAsState()
    val selectedWeeklyOccurrence by component.selectedWeeklyOccurrence.collectAsState()
    val selectedWeeklyOccurrenceSummary by component.selectedWeeklyOccurrenceSummary.collectAsState()
    val weeklyOccurrenceSummaries by component.weeklyOccurrenceSummaries.collectAsState()
    val losersBracket by component.losersBracket.collectAsState()
    val showTeamDialog by component.showTeamSelectionDialog.collectAsState()
    val showMatchEditDialog by component.showMatchEditDialog.collectAsState()
    val joinChoiceDialog by component.joinChoiceDialog.collectAsState()
    val childJoinSelectionDialog by component.childJoinSelectionDialog.collectAsState()
    val paymentPlanPreviewDialog by component.paymentPlanPreviewDialog.collectAsState()
    val withdrawTargets by component.withdrawTargets.collectAsState()
    val textSignaturePrompt by component.textSignaturePrompt.collectAsState()
    val webSignaturePrompt by component.webSignaturePrompt.collectAsState()
    val billingAddressPrompt by component.billingAddressPrompt.collectAsState()
    val eventImageIds by component.eventImageIds.collectAsState()
    val organizationTemplates by component.organizationTemplates.collectAsState()
    val organizationTemplatesLoading by component.organizationTemplatesLoading.collectAsState()
    val organizationTemplatesError by component.organizationTemplatesError.collectAsState()
    val leagueDivisionStandings by component.leagueDivisionStandings.collectAsState()
    val leagueDivisionStandingsLoading by component.leagueDivisionStandingsLoading.collectAsState()
    val leagueStandingsConfirming by component.leagueStandingsConfirming.collectAsState()
    val suggestedUsers by component.suggestedUsers.collectAsState()
    val pendingStaffInvites by component.pendingStaffInvites.collectAsState()
    val editableLeagueTimeSlots by component.editableLeagueTimeSlots.collectAsState()
    val editableFieldsForDetails by component.editableFields.collectAsState()
    val editableLeagueScoringConfig by component.editableLeagueScoringConfig.collectAsState()

    val isHost by component.isHost.collectAsState()
    val isEditing by component.isEditing.collectAsState()
    val isEventFull by component.isEventFull.collectAsState()
    val isUserInEvent by component.isUserInEvent.collectAsState()
    val isFreeAgent by component.isUserFreeAgent.collectAsState()
    val isWaitListed by component.isUserInWaitlist.collectAsState()
    val isCaptain by component.isUserCaptain.collectAsState()
    val isDark = isSystemInDarkTheme()
    val isEditingMatches by component.isEditingMatches.collectAsState()
    val isTemplateEvent = selectedEvent.event.state.equals("TEMPLATE", ignoreCase = true)
    val eventType = selectedEvent.event.eventType
    val isTournamentEvent = eventType == EventType.TOURNAMENT
    val hasBracketView = isTournamentEvent ||
        (eventType == EventType.LEAGUE && selectedEvent.event.includePlayoffs)
    val hasScheduleView = eventType == EventType.LEAGUE ||
        eventType == EventType.TOURNAMENT ||
        eventType == EventType.WEEKLY_EVENT ||
        selectedEvent.matches.isNotEmpty()
    val hasStandingsView = eventType == EventType.LEAGUE
    val isAssistantHost = remember(currentUser.id, selectedEvent.event.assistantHostIds) {
        val currentUserId = currentUser.id.trim()
        currentUserId.isNotBlank() && selectedEvent.event.assistantHostIds.any { assistantHostId ->
            assistantHostId.trim() == currentUserId
        }
    }
    val isEventOfficial = remember(
        currentUser.id,
        selectedEvent.event.eventOfficials,
        selectedEvent.event.officialIds,
    ) {
        isCurrentUserEventOfficial(
            currentUserId = currentUser.id,
            event = selectedEvent.event,
        )
    }
    val isOrganizationManager = remember(
        currentUser.id,
        selectedEvent.organization?.ownerId,
        selectedEvent.organization?.hostIds,
    ) {
        val currentUserId = currentUser.id.trim()
        currentUserId.isNotBlank() && (
            selectedEvent.organization?.ownerId?.trim() == currentUserId ||
                selectedEvent.organization?.hostIds?.any { hostId -> hostId.trim() == currentUserId } == true
            )
    }
    val canManageTemplate = remember(isHost, isAssistantHost, isOrganizationManager) {
        isHost || isAssistantHost || isOrganizationManager
    }
    val canEditEventDetails = remember(
        isHost,
        isTemplateEvent,
        canManageTemplate,
        selectedEvent.event.organizationId,
    ) {
        if (isTemplateEvent) {
            canManageTemplate
        } else {
            isHost && selectedEvent.event.organizationId.isNullOrBlank()
        }
    }
    val canDeleteEvent = remember(isHost, isTemplateEvent, canManageTemplate) {
        if (isTemplateEvent) {
            canManageTemplate
        } else {
            isHost
        }
    }
    val canManageLeagueStandings = remember(
        currentUser.id,
        selectedEvent.event.hostId,
        selectedEvent.event.assistantHostIds,
    ) {
        val currentUserId = currentUser.id.trim()
        currentUserId.isNotBlank() && (
            selectedEvent.event.hostId.trim() == currentUserId ||
                selectedEvent.event.assistantHostIds.any { assistantHostId ->
                    assistantHostId.trim() == currentUserId
                }
            )
    }
    val showOfficialsPanel = remember(
        currentUser.id,
        selectedEvent.event,
        selectedEvent.organization,
    ) {
        canViewOfficialsPanel(
            currentUserId = currentUser.id,
            event = selectedEvent.event,
            organization = selectedEvent.organization,
        )
    }
    val selectedSport = remember(sports, editedEvent.sportId) {
        sports.firstOrNull { it.id == editedEvent.sportId }
    }
    val standingsSport = remember(sports, selectedEvent.event.sportId) {
        sports.firstOrNull { it.id == selectedEvent.event.sportId }
    }
    val showStandingsDrawColumn = remember(selectedEvent.event, standingsSport) {
        resolveLeagueStandingsSupportsDraw(
            event = selectedEvent.event,
            sport = standingsSport,
        )
    }
    val canConfirmLeagueResultsFromDock = hasStandingsView && canManageLeagueStandings
    val canManageMatchEditingFromDock = canManageTemplate
    val canEditMatches = canManageMatchEditingFromDock && isEditingMatches
    val showScheduleMatchManagement = canManageMatchEditingFromDock &&
        shouldShowScheduleMatchManagement(eventType)
    val canManageParticipantsFromDock = canManageTemplate
    val computedLeagueStandings = remember(
        selectedEvent.teams,
        selectedEvent.matches,
        selectedEvent.event.singleDivision,
        selectedDivision,
        selectedEvent.leagueScoringConfig,
        showStandingsDrawColumn,
    ) {
        val standingsMatches = if (
            selectedEvent.event.singleDivision || selectedDivision.isNullOrBlank()
        ) {
            selectedEvent.matches
        } else {
            selectedEvent.matches.filter { match ->
                divisionsEquivalent(match.match.division, selectedDivision)
            }
        }
        buildLeagueStandings(
            teams = selectedEvent.teams,
            matches = standingsMatches,
            config = selectedEvent.leagueScoringConfig,
            supportsDraw = showStandingsDrawColumn,
        )
    }
    val leagueStandings = remember(
        computedLeagueStandings,
        leagueDivisionStandings,
        selectedEvent.teams,
    ) {
        val remoteRows = leagueDivisionStandings?.rows.orEmpty()
        if (remoteRows.isEmpty()) {
            computedLeagueStandings
        } else {
            val teamsById = selectedEvent.teams.associateBy { it.team.id }
            remoteRows.map { row ->
                TeamStanding(
                    team = teamsById[row.teamId],
                    teamId = row.teamId,
                    teamName = row.teamName,
                    wins = row.wins,
                    losses = row.losses,
                    draws = row.draws,
                    goalsFor = row.goalsFor,
                    goalsAgainst = row.goalsAgainst,
                    matchesPlayed = row.matchesPlayed,
                    basePoints = row.basePoints,
                    finalPoints = row.finalPoints,
                    pointsDelta = row.pointsDelta,
                )
            }
        }
    }

    var showTeamSelectionDialog by remember { mutableStateOf(false) }
    var showFab by remember { mutableStateOf(false) }
    var showOptionsDropdown by remember { mutableStateOf(false) }
    var showEventStateDropdown by remember { mutableStateOf(false) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }
    var showWithdrawTargetDialog by remember { mutableStateOf(false) }
    var showRefundReasonDialog by remember { mutableStateOf(false) }
    var showReportEventDialog by remember { mutableStateOf(false) }
    var reportEventNotes by remember { mutableStateOf("") }
    var selectedWithdrawalTarget by remember { mutableStateOf<WithdrawTargetOption?>(null) }
    var refundReason by remember { mutableStateOf("") }
    var showNotifyDialog by remember { mutableStateOf(false) }
    var showJoinOptionsSheet by remember { mutableStateOf(false) }
    var selectedJoinOptionDivisionId by rememberSaveable { mutableStateOf<String?>(null) }
    var showStandingsConfirmDialog by remember { mutableStateOf(false) }
    var showBuildBracketConfirmDialog by remember { mutableStateOf(false) }
    var showStickyDockByScroll by remember { mutableStateOf(true) }
    var mapRevealCenter by remember { mutableStateOf(Offset.Zero) }
    var pendingMapPlace by remember { mutableStateOf<MVPPlace?>(null) }
    var isLocationPickerMapMode by remember { mutableStateOf(false) }
    var isManagingParticipants by rememberSaveable { mutableStateOf(false) }
    fun originalLocationPlace(): MVPPlace? {
        val lat = editedEvent.lat
        val long = editedEvent.long
        if (editedEvent.location.isBlank() || (lat == 0.0 && long == 0.0)) return null
        return MVPPlace(
            name = editedEvent.location,
            id = "__selected_event_location__",
            coordinates = listOf(long, lat),
            address = editedEvent.address,
        )
    }
    val hasAnyPaidDivision = remember(
        selectedEvent.event.priceCents,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
    ) {
        selectedEvent.event.hasAnyPaidDivision()
    }

    var imageScheme by remember {
        mutableStateOf(
            DynamicScheme(
                seedColor = Color(selectedEvent.event.seedColor),
                isDark = isDark,
                specVersion = ColorSpec.SpecVersion.SPEC_2025,
                style = PaletteStyle.Neutral,
            )
        )
    }

    LaunchedEffect(isEditing, selectedEvent, editedEvent) {
        imageScheme = DynamicScheme(
            seedColor = if (isEditing) Color(editedEvent.seedColor) else Color(selectedEvent.event.seedColor),
            isDark = isDark,
            specVersion = ColorSpec.SpecVersion.SPEC_2025,
            style = PaletteStyle.Neutral,
        )
    }

    val refundPolicy = getRefundPolicy(selectedEvent.event)
    val eventHasStarted = refundPolicy.eventHasStarted
    val isWeeklyEvent = selectedEvent.event.eventType == EventType.WEEKLY_EVENT
    val selectedWeeklyOccurrenceStarted = remember(selectedWeeklyOccurrence?.sessionStart) {
        selectedWeeklyOccurrence?.sessionStart?.let { sessionStart ->
            Clock.System.now() >= sessionStart
        } == true
    }
    val joinBlockedByStart = if (isWeeklyEvent) {
        selectedWeeklyOccurrenceStarted
    } else {
        eventHasStarted
    }
    val hasWeeklyParentTimeSlots = remember(selectedEvent.event.timeSlotIds) {
        selectedEvent.event.timeSlotIds.any { slotId -> slotId.isNotBlank() }
    }
    val hasDirectionsTarget = remember(
        selectedEvent.event.address,
        selectedEvent.event.lat,
        selectedEvent.event.long,
    ) {
        !selectedEvent.event.address.isNullOrBlank() ||
            selectedEvent.event.lat != 0.0 ||
            selectedEvent.event.long != 0.0
    }
    val isWeeklyParentEvent = isWeeklyEvent && hasWeeklyParentTimeSlots
    val weeklySessionOptions = remember(
        isWeeklyParentEvent,
        selectedEvent.event.id,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.timeSlots,
    ) {
        if (!isWeeklyParentEvent) {
            emptyList()
        } else {
            buildWeeklySessionOptions(
                event = selectedEvent.event,
                timeSlots = selectedEvent.timeSlots,
            )
        }
    }
    LaunchedEffect(
        isWeeklyParentEvent,
        selectedEvent.event.id,
        weeklySessionOptions,
    ) {
        if (!isWeeklyParentEvent) return@LaunchedEffect
        component.prefetchWeeklyOccurrenceSummaries(
            weeklySessionOptions.mapNotNull { session ->
                val slotId = session.slotId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
                EventOccurrenceSelection(
                    slotId = slotId,
                    occurrenceDate = session.occurrenceDate,
                    label = session.label,
                )
            },
        )
    }
    val weeklyScheduleOptions = remember(
        isWeeklyParentEvent,
        selectedEvent.event.id,
        selectedEvent.event.start,
        selectedEvent.event.end,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.timeSlots,
    ) {
        if (!isWeeklyParentEvent) {
            emptyList()
        } else {
            buildWeeklyScheduleOptions(
                event = selectedEvent.event,
                timeSlots = selectedEvent.timeSlots,
            )
        }
    }
    val weeklyScheduleOptionsById = remember(weeklyScheduleOptions) {
        weeklyScheduleOptions.associateBy { session -> session.id }
    }
    val weeklyScheduleItems = remember(
        weeklyScheduleOptions,
        selectedEvent.event,
    ) {
        weeklyScheduleOptions.map { session ->
            ScheduleItem.EventEntry(
                event = selectedEvent.event.copy(
                    id = session.id,
                    name = session.label,
                    location = session.divisionLabel,
                    start = session.start,
                    end = session.end,
                ),
            )
        }
    }
    val teamSignup = selectedEvent.event.teamSignup
    val teamSelectionSportLabel = remember(selectedEvent.sport, sports, selectedEvent.event.sportId) {
        selectedEvent.sport?.name
            ?: sports.firstOrNull { it.id == selectedEvent.event.sportId }?.name
            ?: selectedEvent.event.sportId
                ?.takeIf(String::isNotBlank)
                ?.replace('_', ' ')
                ?.replace('-', ' ')
                ?.toTitleCase()
            ?: "this event"
    }
    val canLeaveSelf = isUserInEvent && (!teamSignup || isCaptain || isFreeAgent || isWaitListed)
    val selectableWithdrawTargets = remember(withdrawTargets, teamSignup, isCaptain) {
        withdrawTargets.filter { target ->
            if (!target.isSelf) return@filter true
            when (target.membership) {
                WithdrawTargetMembership.PARTICIPANT -> !teamSignup || isCaptain
                WithdrawTargetMembership.WAITLIST -> true
                WithdrawTargetMembership.FREE_AGENT -> true
            }
        }
    }
    val refundableWithdrawTargets = remember(withdrawTargets, hasAnyPaidDivision) {
        if (!hasAnyPaidDivision) {
            emptyList()
        } else {
            withdrawTargets.filter { it.membership == WithdrawTargetMembership.PARTICIPANT }
        }
    }
    val canRequestRefundAfterStart = eventHasStarted && refundableWithdrawTargets.isNotEmpty()
    val actionWithdrawTargets = if (canRequestRefundAfterStart) {
        refundableWithdrawTargets
    } else {
        selectableWithdrawTargets
    }
    val canLeaveEvent = !eventHasStarted && (canLeaveSelf || selectableWithdrawTargets.isNotEmpty())
    val singleWithdrawTarget = selectableWithdrawTargets.singleOrNull()
    val leaveMessage = when {
        selectableWithdrawTargets.size > 1 -> "Withdraw Profile"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.FREE_AGENT -> "Leave as Free Agent"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.WAITLIST -> "Leave Waitlist"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT &&
            hasAnyPaidDivision &&
            refundPolicy.canAutoRefund -> "Withdraw and Get Refund"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT &&
            hasAnyPaidDivision -> "Withdraw and Request Refund"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT -> "Leave Event"
        isFreeAgent -> "Leave as Free Agent"
        isWaitListed -> "Leave Waitlist"
        hasAnyPaidDivision && refundPolicy.canAutoRefund -> "Leave and Get Refund"
        hasAnyPaidDivision -> "Leave and Request Refund"
        else -> "Leave Event"
    }
    val openLeaveOrRefundForTarget: (WithdrawTargetOption?) -> Unit = { target ->
        val shouldRefund = when {
            target != null -> {
                target.membership == WithdrawTargetMembership.PARTICIPANT && hasAnyPaidDivision
            }

            else -> {
                hasAnyPaidDivision && !isFreeAgent && !isWaitListed
            }
        }

        if (shouldRefund) {
            if (refundPolicy.canAutoRefund) {
                component.withdrawAndRefund(target?.userId)
            } else {
                selectedWithdrawalTarget = target
                showRefundReasonDialog = true
            }
        } else {
            component.leaveEvent(target?.userId)
        }
    }
    val leaveOrRefundActionLabel = when {
        canRequestRefundAfterStart -> {
            if (actionWithdrawTargets.size > 1) {
                "Request Refunds"
            } else {
                "Request Refund"
            }
        }
        else -> leaveMessage
    }
    val openLeaveOrRefundAction: () -> Unit = {
        when {
            actionWithdrawTargets.size > 1 -> {
                showWithdrawTargetDialog = true
            }

            actionWithdrawTargets.size == 1 -> {
                openLeaveOrRefundForTarget(actionWithdrawTargets.first())
            }

            else -> {
                openLeaveOrRefundForTarget(null)
            }
        }
    }
    val selectedWeeklyOccurrenceJoined =
        isWeeklyParentEvent && selectedWeeklyOccurrence != null && isUserInEvent
    val shouldShowViewSchedulePrimaryAction = shouldUseViewSchedulePrimaryAction(
        isWeeklyParentEvent = isWeeklyParentEvent,
        isUserInEvent = isUserInEvent,
        isHost = isHost,
        isAssistantHost = isAssistantHost,
        isEventOfficial = isEventOfficial,
    )
    val showOverviewOpenDetailsAction = isWeeklyParentEvent || !shouldShowViewSchedulePrimaryAction
    val showStickyActions = !showDetails && !isEditing && !showMap && showStickyDockByScroll
    val isEventRefreshInProgress = eventTeamsAndParticipantsLoading || eventMatchesLoading
    val joinDivisionOptions = remember(
        selectedDivision,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedEvent.matches,
    ) {
        val options = mutableListOf<BracketDivisionOption>()
        val seenIds = mutableSetOf<String>()
        fun addOption(rawId: String?, explicitLabel: String? = null) {
            val normalizedId = rawId
                ?.normalizeDivisionIdentifier()
                .orEmpty()
            if (normalizedId.isEmpty() || !seenIds.add(normalizedId)) {
                return
            }
            val label = explicitLabel
                ?.takeIf { it.isNotBlank() }
                ?: normalizedId.toDivisionDisplayLabel(selectedEvent.event.divisionDetails)
            options += BracketDivisionOption(
                id = normalizedId,
                label = label.ifBlank { normalizedId }
            )
        }
        selectedEvent.event.divisionDetails.forEach { detail ->
            val fallbackId = detail.id.ifBlank { detail.key }
            addOption(fallbackId, detail.name)
        }
        selectedEvent.event.divisions.forEach { divisionId ->
            addOption(divisionId)
        }
        selectedEvent.matches.forEach { match ->
            addOption(match.match.division)
        }
        addOption(selectedDivision)
        options
    }
    val playoffDivisionIds = remember(selectedEvent.event.divisionDetails) {
        buildSet {
            selectedEvent.event.divisionDetails
                .flatMap { detail -> detail.playoffPlacementDivisionIds }
                .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
                .filter { normalized -> normalized.isNotBlank() }
                .forEach { normalized -> add(normalized) }

            selectedEvent.event.divisionDetails
                .filter { detail -> detail.kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true }
                .map { detail -> detail.id.normalizeDivisionIdentifier() }
                .filter { normalized -> normalized.isNotBlank() }
                .forEach { normalized -> add(normalized) }
        }
    }
    val isLeaguePlayoffSplit = remember(
        selectedEvent.event.includePlayoffs,
        playoffDivisionIds,
    ) {
        selectedEvent.event.includePlayoffs && playoffDivisionIds.isNotEmpty()
    }
    val leagueDivisionOptions = remember(
        joinDivisionOptions,
        playoffDivisionIds,
        isLeaguePlayoffSplit,
    ) {
        if (!isLeaguePlayoffSplit) {
            joinDivisionOptions
        } else {
            joinDivisionOptions
                .filterNot { option -> option.id in playoffDivisionIds }
                .ifEmpty { joinDivisionOptions }
        }
    }
    val playoffDivisionOptions = remember(
        joinDivisionOptions,
        playoffDivisionIds,
        isLeaguePlayoffSplit,
    ) {
        if (!isLeaguePlayoffSplit) {
            joinDivisionOptions
        } else {
            joinDivisionOptions
                .filter { option -> option.id in playoffDivisionIds }
                .ifEmpty { joinDivisionOptions }
        }
    }
    val selectedJoinDivisionId = remember(
        selectedDivision,
        joinDivisionOptions,
    ) {
        joinDivisionOptions.resolveSelectedDivisionId(selectedDivision)
    }
    LaunchedEffect(showJoinOptionsSheet) {
        if (showJoinOptionsSheet) {
            selectedJoinOptionDivisionId = null
        }
    }
    val joinOptionPriceCents = remember(
        selectedEvent.event.priceCents,
        selectedEvent.event.divisions,
        selectedEvent.event.divisionDetails,
        selectedDivision,
        selectedJoinOptionDivisionId,
        hasAnyPaidDivision,
    ) {
        val preferredDivisionId = selectedJoinOptionDivisionId ?: selectedDivision
        when {
            !preferredDivisionId.isNullOrBlank() -> selectedEvent.event.resolvedDivisionPriceCents(preferredDivisionId)
            selectedEvent.event.singleDivision -> selectedEvent.event.resolvedDivisionPriceCents()
            hasAnyPaidDivision -> selectedEvent.event.divisionPriceRange().maxPriceCents
            else -> 0
        }
    }
    val joinOptions = remember(
        isUserInEvent,
        selectedWeeklyOccurrenceJoined,
        isEventFull,
        teamSignup,
        joinOptionPriceCents,
        joinBlockedByStart,
        isWeeklyParentEvent,
        selectedWeeklyOccurrence,
        selectedJoinOptionDivisionId,
        joinDivisionOptions,
    ) {
        val requiresWeeklySelection = isWeeklyParentEvent && selectedWeeklyOccurrence == null
        val shouldHideJoinOptions = when {
            joinBlockedByStart -> true
            isWeeklyParentEvent -> requiresWeeklySelection || selectedWeeklyOccurrenceJoined
            else -> isUserInEvent
        }
        if (shouldHideJoinOptions) {
            emptyList()
        } else {
            buildList {
                if (isEventFull) {
                    if (teamSignup) {
                        add(
                            JoinOption(
                                label = if (joinOptionPriceCents > 0) {
                                    "Join Waitlist as Team (No Payment Yet)"
                                } else {
                                    "Join Waitlist as Team"
                                },
                                requiresPayment = joinOptionPriceCents > 0,
                                onClick = {
                                    selectedJoinOptionDivisionId?.let { component.selectDivision(it) }
                                    showTeamSelectionDialog = true
                                }
                            )
                        )
                    } else {
                        add(
                            JoinOption(
                                label = if (joinOptionPriceCents > 0) {
                                    "Join Waitlist (No Payment Yet)"
                                } else {
                                    "Join Waitlist"
                                },
                                requiresPayment = joinOptionPriceCents > 0,
                                onClick = component::joinEvent
                            )
                        )
                    }
                } else if (teamSignup) {
                    add(
                        JoinOption(
                            label = "Join as Free Agent",
                            requiresPayment = false,
                            onClick = component::joinEvent
                        )
                    )
                    add(
                        JoinOption(
                            label = if (joinOptionPriceCents > 0) {
                                "Purchase Ticket for Team"
                            } else {
                                "Join as Team"
                            },
                            requiresPayment = joinOptionPriceCents > 0,
                            onClick = {
                                selectedJoinOptionDivisionId?.let { component.selectDivision(it) }
                                showTeamSelectionDialog = true
                            }
                        )
                    )
                } else {
                    add(
                        JoinOption(
                            label = if (joinOptionPriceCents > 0) "Purchase Ticket" else "Join Event",
                            requiresPayment = joinOptionPriceCents > 0,
                            onClick = component::joinEvent
                        )
                    )
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
        component.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    LaunchedEffect(playerInteractionComponent, loadingHandler, popupHandler) {
        playerInteractionComponent.setLoadingHandler(loadingHandler)
        playerInteractionComponent.errorState.collect { error ->
            if (error != null) {
                popupHandler.showPopup(error)
            }
        }
    }

    LaunchedEffect(showDetails, isEditing, showMap) {
        if (showDetails || isEditing || showMap) {
            showJoinOptionsSheet = false
            showStickyDockByScroll = true
        }
    }

    LaunchedEffect(isEditing) {
        if (!isEditing) {
            pendingMapPlace = null
            isLocationPickerMapMode = false
        }
    }

    LaunchedEffect(showMap) {
        if (!showMap) {
            pendingMapPlace = null
            isLocationPickerMapMode = false
        }
    }

    CompositionLocalProvider(LocalTournamentComponent provides component) {
        CircularRevealUnderlay(
            isRevealed = showMap,
            revealCenterInWindow = mapRevealCenter,
            animationDurationMillis = 800,
            modifier = Modifier.fillMaxSize(),
            backgroundContent = {
                EventMap(
                    component = mapComponent,
                    onEventSelected = { _ ->
                        pendingMapPlace = null
                        isLocationPickerMapMode = false
                        mapComponent.toggleMap()
                    },
                    onPlaceSelected = { place ->
                        if (isLocationPickerMapMode) {
                            pendingMapPlace = place
                        }
                    },
                    onPlaceSelectionPoint = { x, y ->
                        mapRevealCenter = Offset(x, y)
                    },
                    selectionRequiresConfirmation = isLocationPickerMapMode,
                    originalPlace = originalLocationPlace(),
                    selectedPlace = pendingMapPlace,
                    onPlaceSelectionCleared = {
                        pendingMapPlace = null
                    },
                    canClickPOI = isLocationPickerMapMode,
                    focusedLocation = when {
                        pendingMapPlace != null -> {
                            LatLng(pendingMapPlace!!.latitude, pendingMapPlace!!.longitude)
                        }
                        originalLocationPlace() != null -> {
                            LatLng(originalLocationPlace()!!.latitude, originalLocationPlace()!!.longitude)
                        }
                        editedEvent.location.isNotBlank() -> {
                            LatLng(editedEvent.lat, editedEvent.long)
                        }
                        else -> {
                            mapComponent.currentLocation.value ?: LatLng(0.0, 0.0)
                        }
                    },
                    focusedEvent = if (!isLocationPickerMapMode && selectedEvent.event.location.isNotBlank()) {
                        selectedEvent.event
                    } else {
                        null
                    },
                    mapActionLabel = if (pendingMapPlace != null) {
                        "Select Location"
                    } else {
                        "Close Map"
                    },
                    usePrimaryActionButton = pendingMapPlace != null,
                    onBackPressed = {
                        pendingMapPlace?.let(component::selectPlace)
                        pendingMapPlace = null
                        isLocationPickerMapMode = false
                        mapComponent.toggleMap()
                    },
                )
            },
        ) {
            PullToRefreshContainer(
                isRefreshing = isEventRefreshInProgress,
                onRefresh = component::refreshEventDetails,
                enabled = !showMap,
                modifier = Modifier.fillMaxSize(),
            ) {
                Scaffold(Modifier.fillMaxSize()) { innerPadding ->
                Box(
                    Modifier.background(MaterialTheme.colorScheme.background).fillMaxSize()
                ) {
                    Column(Modifier.fillMaxSize()) {
                AnimatedVisibility(
                    !showDetails,
                    enter = EnterTransition.None,
                    exit = ExitTransition.None,
                ) {
                    Box {
                        EventDetails(
                            paymentProcessor = component,
                            mapComponent = mapComponent,
                            hostHasAccount = currentUser.hasStripeAccount == true,
                            eventWithRelations = selectedEvent,
                            editEvent = editedEvent,
                            navPadding = LocalNavBarPadding.current,
                            topInset = innerPadding.calculateTopPadding(),
                            editView = isEditing,
                            showOfficialsPanel = showOfficialsPanel,
                            isNewEvent = false,
                            onOpenLocationMap = {
                                pendingMapPlace = null
                                isLocationPickerMapMode = true
                                mapComponent.toggleMap()
                            },
                            onAddCurrentUser = {},
                            imageScheme = imageScheme,
                            imageIds = eventImageIds,
                            onHostCreateAccount = component::onHostCreateAccount,
                            onPlaceSelected = component::selectPlace,
                            onEditEvent = component::editEventField,
                            onEditTournament = component::editTournamentField,
                            onEventTypeSelected = component::onTypeSelected,
                            onSportSelected = { sportId ->
                                component.editEventField {
                                    copy(
                                        sportId = sportId.takeIf(String::isNotBlank),
                                        matchRulesOverride = null,
                                        resolvedMatchRules = null,
                                    )
                                }
                            },
                            sports = sports,
                            onUpdateDoTeamsOfficiate = { doTeamsOfficiate ->
                                component.editEventField {
                                    copy(
                                        doTeamsOfficiate = doTeamsOfficiate,
                                        teamOfficialsMaySwap = if (doTeamsOfficiate) teamOfficialsMaySwap else false,
                                    )
                                }
                            },
                            onUpdateTeamOfficialsMaySwap = { teamOfficialsMaySwap ->
                                component.editEventField {
                                    copy(
                                        teamOfficialsMaySwap = if (doTeamsOfficiate == true) teamOfficialsMaySwap else false,
                                    )
                                }
                            },
                            onUpdateOfficialSchedulingMode = { mode ->
                                component.editEventField {
                                    copy(officialSchedulingMode = mode)
                                }
                            },
                            onLoadOfficialPositionDefaults = {
                                component.editEventField {
                                    syncOfficialStaffing(
                                        sport = sports.firstOrNull { sport -> sport.id == sportId },
                                        replacePositionsWithSportDefaults = true,
                                    )
                                }
                            },
                            onAddOfficialPosition = {
                                component.editEventField {
                                    addOfficialPosition(sport = selectedSport)
                                }
                            },
                            onUpdateOfficialPositionName = { positionId, name ->
                                component.editEventField {
                                    updateOfficialPosition(
                                        positionId = positionId,
                                        name = name,
                                        sport = selectedSport,
                                    )
                                }
                            },
                            onUpdateOfficialPositionCount = { positionId, count ->
                                component.editEventField {
                                    updateOfficialPosition(
                                        positionId = positionId,
                                        count = count,
                                        sport = selectedSport,
                                    )
                                }
                            },
                            onRemoveOfficialPosition = { positionId ->
                                component.editEventField {
                                    removeOfficialPosition(
                                        positionId = positionId,
                                        sport = selectedSport,
                                    )
                                }
                            },
                            onUpdateOfficialUserPositions = { userId, positionIds ->
                                component.editEventField {
                                    updateOfficialUserPositions(
                                        userId = userId,
                                        positionIds = positionIds,
                                        sport = selectedSport,
                                    )
                                }
                            },
                            editableFields = editableFieldsForDetails,
                            leagueTimeSlots = editableLeagueTimeSlots,
                            leagueScoringConfig = editableLeagueScoringConfig,
                            onAddLeagueTimeSlot = component::addLeagueTimeSlot,
                            onUpdateLeagueTimeSlot = { index, updated ->
                                component.updateLeagueTimeSlot(index) { updated }
                            },
                            onRemoveLeagueTimeSlot = component::removeLeagueTimeSlot,
                            onSelectFieldCount = component::selectFieldCount,
                            onUpdateLocalFieldName = component::updateLocalFieldName,
                            onLeagueScoringConfigChange = { updated ->
                                component.updateLeagueScoringConfig { updated }
                            },
                            onUploadSelected = component::onUploadSelected,
                            onDeleteImage = component::deleteImage,
                            currentUserForHostActions = currentUser,
                            onHostMessageUser = component::onNavigateToChat,
                            onHostSendFriendRequest = { user ->
                                playerInteractionComponent.sendFriendRequest(user)
                            },
                            onHostFollowUser = { user ->
                                playerInteractionComponent.followUser(user)
                            },
                            onHostUnfollowUser = { user ->
                                playerInteractionComponent.unfollowUser(user)
                            },
                            onHostBlockUser = { user, leaveSharedChats ->
                                playerInteractionComponent.blockUser(user, leaveSharedChats)
                            },
                            onHostUnblockUser = { user ->
                                playerInteractionComponent.unblockUser(user)
                            },
                            onHostFollowOrganization = { _ ->
                                popupHandler.showPopup(
                                    com.razumly.mvp.core.util.ErrorMessage(
                                        "Follow for organizations is not available yet.",
                                    ),
                                )
                            },
                            onMapRevealCenterChange = { center ->
                                mapRevealCenter = center
                            },
                            onFloatingDockVisibilityChange = { shouldShow ->
                                showStickyDockByScroll = shouldShow
                            },
                            organizationTemplates = organizationTemplates,
                            organizationTemplatesLoading = organizationTemplatesLoading,
                            organizationTemplatesError = organizationTemplatesError,
                            pendingStaffInvites = pendingStaffInvites,
                            userSuggestions = suggestedUsers,
                            onSearchUsers = component::searchUsers,
                            onAddPendingStaffInvite = { firstName, lastName, email, roles ->
                                component.addPendingStaffInvite(firstName, lastName, email, roles)
                            },
                            onRemovePendingStaffInvite = component::removePendingStaffInvite,
                            onUpdateAssistantHostIds = { assistantHostIds ->
                                component.editEventField {
                                    copy(
                                        assistantHostIds = assistantHostIds
                                            .map(String::trim)
                                            .filter(String::isNotBlank)
                                            .filterNot { userId -> userId == hostId }
                                            .distinct(),
                                    )
                                }
                            },
                            onAddOfficialId = { officialId ->
                                component.editEventField {
                                    addOfficialUser(
                                        userId = officialId,
                                        sport = selectedSport,
                                    )
                                }
                            },
                            onRemoveOfficialId = { officialId ->
                                component.editEventField {
                                    removeOfficialUser(
                                        userId = officialId,
                                        sport = selectedSport,
                                    )
                                }
                            },
                        ) { isValid ->
                            val buttonColors = ButtonColors(
                                containerColor = Color(imageScheme.primary),
                                contentColor = Color(imageScheme.onPrimary),
                                disabledContainerColor = Color(imageScheme.onSurface),
                                disabledContentColor = Color(imageScheme.onSurfaceVariant)
                            )
                            AnimatedContent(
                                targetState = isEditing,
                                transitionSpec = { buttonTransitionSpec() },
                                label = "buttonTransition"
                            ) { editMode ->
                                if (editMode) {
                                    val canRescheduleEditedEvent =
                                        editedEvent.eventType == EventType.LEAGUE ||
                                            editedEvent.eventType == EventType.TOURNAMENT
                                    val canBuildBracketsForEditedEvent =
                                        editedEvent.eventType == EventType.TOURNAMENT ||
                                            (
                                                editedEvent.eventType == EventType.LEAGUE &&
                                                    editedEvent.includePlayoffs
                                                )
                                    Column(
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Button(
                                                onClick = {
                                                    component.updateEvent()
                                                }, enabled = isValid, colors = buttonColors
                                            ) {
                                                Text("Confirm")
                                            }
                                            Button(
                                                onClick = {
                                                    component.cancelEditingEvent()
                                                }, colors = buttonColors
                                            ) {
                                                Text("Cancel")
                                            }
                                        }
                                        if (isHost && !editedEvent.state.equals("TEMPLATE", ignoreCase = true)) {
                                            val selectedLifecycleState = remember(editedEvent.state) {
                                                editedEvent.toEditableLifecycleState()
                                            }
                                            Box(
                                                modifier = Modifier.fillMaxWidth(),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Button(
                                                    onClick = { showEventStateDropdown = true },
                                                    colors = buttonColors,
                                                ) {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    ) {
                                                        Text(selectedLifecycleState.label)
                                                        Icon(
                                                            imageVector = Icons.Default.KeyboardArrowDown,
                                                            contentDescription = null,
                                                        )
                                                    }
                                                }
                                                DropdownMenu(
                                                    expanded = showEventStateDropdown,
                                                    onDismissRequest = { showEventStateDropdown = false },
                                                ) {
                                                    EditableLifecycleState.values().forEach { option ->
                                                        DropdownMenuItem(
                                                            text = { Text(option.label) },
                                                            onClick = {
                                                                component.editEventField {
                                                                    copy(
                                                                        state = option.toEventState(currentState = state),
                                                                    )
                                                                }
                                                                showEventStateDropdown = false
                                                            },
                                                            leadingIcon = if (option == selectedLifecycleState) {
                                                                {
                                                                    Icon(
                                                                        imageVector = Icons.Default.Check,
                                                                        contentDescription = null,
                                                                    )
                                                                }
                                                            } else {
                                                                null
                                                            },
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                        if (canBuildBracketsForEditedEvent) {
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Button(
                                                    onClick = { component.rescheduleEvent() },
                                                    enabled = isValid,
                                                    colors = buttonColors,
                                                    modifier = Modifier.weight(1f),
                                                ) {
                                                    Text("Reschedule Event")
                                                }
                                                Button(
                                                    onClick = { showBuildBracketConfirmDialog = true },
                                                    enabled = isValid,
                                                    colors = buttonColors,
                                                    modifier = Modifier.weight(1f),
                                                ) {
                                                    Text("Build Bracket(s)")
                                                }
                                            }
                                        } else if (canRescheduleEditedEvent) {
                                            Button(
                                                onClick = { component.rescheduleEvent() },
                                                enabled = isValid,
                                                colors = buttonColors,
                                            ) {
                                                Text("Reschedule Event")
                                            }
                                        }
                                        Button(
                                            onClick = { component.createTemplateFromCurrentEvent() },
                                            enabled = !editedEvent.state.equals("TEMPLATE", ignoreCase = true),
                                            colors = buttonColors,
                                        ) {
                                            Text("Create Template")
                                        }
                                    }
                                } else {
                                    EventOverviewSections(
                                        eventWithRelations = selectedEvent,
                                        teamsAndParticipantsLoading = eventTeamsAndParticipantsLoading,
                                        matchesLoading = eventMatchesLoading,
                                        showFullnessSummary = !isWeeklyParentEvent || selectedWeeklyOccurrenceSummary != null,
                                        selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                        selectedWeeklyOccurrenceSummary = selectedWeeklyOccurrenceSummary,
                                        showOpenDetailsAction = showOverviewOpenDetailsAction,
                                        onOpenDetails = component::viewEvent
                                    )
                                }
                            }
                        }

                        if (!showMap) {
                            Box(
                                Modifier.padding(top = 64.dp, start = 16.dp)
                                    .align(Alignment.TopStart)
                            ) {
                                IconButton(
                                    { component.backCallback.onBack() },
                                    modifier = Modifier.background(
                                        Color(imageScheme.surface).copy(alpha = 0.7f),
                                        shape = CircleShape
                                    ),
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = "Close",
                                        tint = Color(imageScheme.onSurface)
                                    )
                                }
                            }
                            Box(
                                modifier = Modifier.align(Alignment.TopEnd)
                                    .padding(top = 64.dp, end = 16.dp)
                            ) {
                                IconButton(
                                    onClick = { showOptionsDropdown = true },
                                    modifier = Modifier.background(
                                        Color(imageScheme.surface).copy(alpha = 0.7f),
                                        shape = CircleShape
                                    )
                                ) {
                                    Icon(
                                        Icons.Default.MoreVert,
                                        contentDescription = "More options",
                                        tint = Color(imageScheme.onSurface)
                                    )
                                }

                                DropdownMenu(
                                    expanded = showOptionsDropdown,
                                    onDismissRequest = { showOptionsDropdown = false }) {
                                    // Edit option
                                    if (canEditEventDetails) {
                                        DropdownMenuItem(
                                            text = { Text("Edit") }, onClick = {
                                            component.startEditingEvent()
                                            showOptionsDropdown = false
                                        }, leadingIcon = {
                                            Icon(Icons.Default.Edit, contentDescription = null)
                                        }, enabled = canEditEventDetails
                                        )
                                    }

                                    if (
                                        selectedEvent.event.state != "TEMPLATE" &&
                                        (
                                            selectedEvent.event.organizationId.isNullOrBlank() ||
                                                isHost
                                            )
                                    ) {
                                        DropdownMenuItem(
                                            text = { Text("Create Template") },
                                            onClick = {
                                                component.createTemplateFromCurrentEvent()
                                                showOptionsDropdown = false
                                            },
                                            leadingIcon = {
                                                Icon(Icons.Default.Check, contentDescription = null)
                                            },
                                        )
                                    }

                                    if (isHost && joinOptions.isNotEmpty()) {
                                        DropdownMenuItem(
                                            text = { Text("Join Event") },
                                            onClick = {
                                                showJoinOptionsSheet = true
                                                showOptionsDropdown = false
                                            },
                                            leadingIcon = {
                                                Icon(Icons.Default.Add, contentDescription = null)
                                            },
                                        )
                                    }

                                    DropdownMenuItem(text = { Text("Share") }, onClick = {
                                        component.shareEvent()
                                        showOptionsDropdown = false
                                    }, leadingIcon = {
                                        Icon(Icons.Default.Share, contentDescription = null)
                                    })

                                    if (!isHost) {
                                        DropdownMenuItem(
                                            text = { Text("Report Event") },
                                            onClick = {
                                                showReportEventDialog = true
                                                showOptionsDropdown = false
                                            },
                                            leadingIcon = {
                                                Icon(Icons.Default.Close, contentDescription = null)
                                            },
                                        )
                                    }

                                    if (canRequestRefundAfterStart || canLeaveEvent) {
                                        DropdownMenuItem(
                                            text = { Text(leaveOrRefundActionLabel) },
                                            onClick = {
                                                showOptionsDropdown = false
                                                openLeaveOrRefundAction()
                                            },
                                            leadingIcon = {
                                                Icon(Icons.Default.Close, contentDescription = null)
                                            },
                                        )
                                    }

                                    if (isHost) {
                                        DropdownMenuItem(
                                            text = { Text("Notify Players") },
                                            onClick = {
                                                showNotifyDialog = true
                                                showOptionsDropdown = false
                                            },
                                            leadingIcon = {
                                                Icon(
                                                    Icons.AutoMirrored.Filled.Announcement,
                                                    contentDescription = null,
                                                )
                                            })
                                    }

                                    if (canDeleteEvent) {
                                        DropdownMenuItem(
                                            text = { Text("Delete") }, onClick = {
                                            showDeleteConfirmation = true
                                            showOptionsDropdown = false
                                        }, leadingIcon = {
                                            Icon(
                                                Icons.Default.Delete,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.error
                                            )
                                        }, colors = MenuDefaults.itemColors(
                                            textColor = MaterialTheme.colorScheme.error
                                        )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                AnimatedVisibility(
                    showDetails,
                    enter = EnterTransition.None,
                    exit = ExitTransition.None,
                ) {
                    Column(Modifier.padding(innerPadding).padding(top = 4.dp)) {
                        val availableTabs = remember(hasBracketView, hasScheduleView, hasStandingsView) {
                            buildList {
                                add(DetailTab.PARTICIPANTS)
                                if (hasScheduleView) add(DetailTab.SCHEDULE)
                                if (hasStandingsView) add(DetailTab.LEAGUES)
                                if (hasBracketView) add(DetailTab.BRACKET)
                            }
                        }
                        var selectedTab by rememberSaveable { mutableStateOf(DetailTab.PARTICIPANTS) }
                        val standingsTabDivisionOptions = remember(
                            joinDivisionOptions,
                            leagueDivisionOptions,
                            isLeaguePlayoffSplit,
                        ) {
                            if (isLeaguePlayoffSplit) {
                                leagueDivisionOptions
                            } else {
                                joinDivisionOptions
                            }
                        }
                        val bracketTabDivisionOptions = remember(
                            joinDivisionOptions,
                            playoffDivisionOptions,
                            isLeaguePlayoffSplit,
                        ) {
                            if (isLeaguePlayoffSplit) {
                                playoffDivisionOptions
                            } else {
                                joinDivisionOptions
                            }
                        }
                        val selectedStandingsDivisionId = remember(
                            selectedJoinDivisionId,
                            standingsTabDivisionOptions,
                        ) {
                            standingsTabDivisionOptions.resolveSelectedDivisionId(selectedJoinDivisionId)
                        }
                        val selectedBracketDivisionId = remember(
                            selectedJoinDivisionId,
                            bracketTabDivisionOptions,
                        ) {
                            bracketTabDivisionOptions.resolveSelectedDivisionId(selectedJoinDivisionId)
                        }
                        val participantSections = remember(selectedEvent.event.teamSignup) {
                            if (selectedEvent.event.teamSignup) {
                                listOf(
                                    ParticipantsSection.TEAMS,
                                    ParticipantsSection.PARTICIPANTS,
                                    ParticipantsSection.FREE_AGENTS
                                )
                            } else {
                                listOf(ParticipantsSection.PARTICIPANTS)
                            }
                        }
                        var selectedParticipantsSection by rememberSaveable {
                            mutableStateOf(
                                if (selectedEvent.event.teamSignup) {
                                    ParticipantsSection.TEAMS
                                } else {
                                    ParticipantsSection.PARTICIPANTS
                                }
                            )
                        }
                        LaunchedEffect(availableTabs) {
                            if (selectedTab !in availableTabs) {
                                selectedTab = availableTabs.first()
                            }
                        }
                        LaunchedEffect(
                            selectedTab,
                            selectedStandingsDivisionId,
                            selectedBracketDivisionId,
                            selectedDivision,
                        ) {
                            val targetDivisionId = when (selectedTab) {
                                DetailTab.LEAGUES -> selectedStandingsDivisionId
                                DetailTab.BRACKET -> selectedBracketDivisionId
                                DetailTab.PARTICIPANTS,
                                DetailTab.SCHEDULE,
                                -> null
                            }
                            if (!targetDivisionId.isNullOrBlank() &&
                                !divisionsEquivalent(selectedDivision, targetDivisionId)
                            ) {
                                component.selectDivision(targetDivisionId)
                            }
                        }
                        LaunchedEffect(participantSections) {
                            if (selectedParticipantsSection !in participantSections) {
                                selectedParticipantsSection = participantSections.first()
                            }
                        }
                        EventDetailTabStrip(
                            availableTabs = availableTabs,
                            selectedTab = selectedTab,
                            onTabSelected = { selectedTab = it },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(start = 12.dp, end = 12.dp, bottom = 10.dp),
                        )
                        Box(Modifier.fillMaxSize()) {
                            when (selectedTab) {
                                DetailTab.BRACKET -> {
                                    TournamentBracketView(
                                        showFab = { showFab = it },
                                        onMatchClick = { match ->
                                            if (!canEditMatches) {
                                                component.matchSelected(match)
                                            }
                                        },
                                        isEditingMatches = canEditMatches,
                                        editableMatches = editableMatches,
                                        onEditMatch = { match ->
                                            if (canEditMatches) {
                                                component.showMatchEditDialog(match)
                                            } else {
                                                component.matchSelected(match)
                                            }
                                        },
                                        showEventOfficialNames = canEditMatches || isEventOfficial,
                                        limitOfficialsToCurrentUser = isEventOfficial && !canEditMatches,
                                    )
                                }

                                DetailTab.SCHEDULE -> {
                                    if (isWeeklyParentEvent) {
                                        ScheduleView(
                                            items = weeklyScheduleItems,
                                            fields = eventFields,
                                            showFab = { showFab = it },
                                            onMatchClick = {},
                                            onEventClick = { selectedOccurrenceEvent ->
                                                weeklyScheduleOptionsById[selectedOccurrenceEvent.id]?.let { session ->
                                                    component.selectWeeklySession(
                                                        sessionStart = session.start,
                                                        sessionEnd = session.end,
                                                        slotId = session.slotId,
                                                        occurrenceDate = session.occurrenceDate,
                                                        label = session.label,
                                                    )
                                                }
                                            },
                                            eventCardContent = { scheduleEvent, _, _, onClick ->
                                                val session = weeklyScheduleOptionsById[scheduleEvent.id]
                                                if (session != null) {
                                                    val activeOccurrence = selectedWeeklyOccurrence
                                                    val isSelectedOccurrence = activeOccurrence?.slotId == session.slotId &&
                                                        activeOccurrence?.occurrenceDate == session.occurrenceDate
                                                    val isClosedOccurrence = Clock.System.now() >= session.start
                                                    Surface(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(horizontal = 16.dp, vertical = 20.dp)
                                                            .clickable(onClick = onClick),
                                                        shape = RoundedCornerShape(16.dp),
                                                        color = if (isSelectedOccurrence) {
                                                            MaterialTheme.colorScheme.primaryContainer
                                                        } else {
                                                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f)
                                                        },
                                                        tonalElevation = if (isSelectedOccurrence) 3.dp else 0.dp,
                                                    ) {
                                                        Column(
                                                            modifier = Modifier
                                                                .fillMaxWidth()
                                                                .padding(14.dp),
                                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                                        ) {
                                                            Text(
                                                                text = session.label,
                                                                style = MaterialTheme.typography.titleSmall,
                                                                fontWeight = FontWeight.SemiBold,
                                                                color = if (isSelectedOccurrence) {
                                                                    MaterialTheme.colorScheme.onPrimaryContainer
                                                                } else {
                                                                    MaterialTheme.colorScheme.onSurface
                                                                },
                                                            )
                                                            Text(
                                                                text = session.divisionLabel,
                                                                style = MaterialTheme.typography.bodySmall,
                                                                color = if (isSelectedOccurrence) {
                                                                    MaterialTheme.colorScheme.onPrimaryContainer
                                                                } else {
                                                                    MaterialTheme.colorScheme.onSurfaceVariant
                                                                },
                                                            )
                                                            if (isSelectedOccurrence) {
                                                                selectedWeeklyOccurrenceSummary?.let { summary ->
                                                                    val fullnessLabel = summary.participantCapacity?.let { capacity ->
                                                                        "${summary.participantCount} of $capacity spots filled"
                                                                    } ?: "${summary.participantCount} spots filled"
                                                                    Text(
                                                                        text = fullnessLabel,
                                                                        style = MaterialTheme.typography.bodySmall,
                                                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                                    )
                                                                }
                                                            } else if (isClosedOccurrence) {
                                                                Text(
                                                                    text = "Started",
                                                                    style = MaterialTheme.typography.bodySmall,
                                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                                )
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    Surface(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(horizontal = 16.dp, vertical = 20.dp)
                                                            .clickable(onClick = onClick),
                                                        shape = RoundedCornerShape(16.dp),
                                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f),
                                                    ) {
                                                        Column(
                                                            modifier = Modifier
                                                                .fillMaxWidth()
                                                                .padding(14.dp),
                                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                                        ) {
                                                            Text(
                                                                text = scheduleEvent.name.ifBlank { "Weekly occurrence" },
                                                                style = MaterialTheme.typography.titleSmall,
                                                                fontWeight = FontWeight.SemiBold,
                                                                color = MaterialTheme.colorScheme.onSurface,
                                                            )
                                                            scheduleEvent.location.takeIf { it.isNotBlank() }?.let { label ->
                                                                Text(
                                                                    text = label,
                                                                    style = MaterialTheme.typography.bodySmall,
                                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                        )
                                    } else if (eventMatchesLoading) {
                                        showFab = false
                                        DetailTabLoadingState("Loading schedule matches...")
                                    } else {
                                        val allScheduleMatches = if (canEditMatches) {
                                            editableMatches
                                        } else {
                                            selectedEvent.matches
                                        }
                                        val scheduleMatches = if (
                                            selectedEvent.event.singleDivision || selectedDivision.isNullOrBlank()
                                        ) {
                                            allScheduleMatches
                                        } else {
                                            allScheduleMatches.filter { match ->
                                                divisionsEquivalent(match.match.division, selectedDivision)
                                            }
                                        }
                                        val scheduledMatches = scheduleMatches.filter { match ->
                                            match.match.start != null
                                        }
                                        ScheduleView(
                                            items = scheduledMatches.map { match -> ScheduleItem.MatchEntry(match) },
                                            fields = eventFields,
                                            showFab = { showFab = it },
                                            trackedUserIds = scheduleTrackedUserIds,
                                            showEventOfficialNames = canEditMatches || isEventOfficial,
                                            limitOfficialsToCurrentUser = isEventOfficial && !canEditMatches,
                                            canManageMatches = canEditMatches,
                                            onToggleLockAllMatches = { locked, matchIds ->
                                                component.setLockForEditableMatches(matchIds, locked)
                                            },
                                            onMatchClick = { match ->
                                                if (canEditMatches) {
                                                    component.showMatchEditDialog(
                                                        match = match,
                                                        creationContext = MatchCreateContext.SCHEDULE,
                                                    )
                                                } else {
                                                    component.matchSelected(match)
                                                }
                                            }
                                        )
                                    }
                                }
                                DetailTab.LEAGUES -> {
                                    LeagueStandingsTab(
                                        standings = leagueStandings,
                                        showDrawColumn = showStandingsDrawColumn,
                                        showFab = { showFab = it },
                                        validationMessages = leagueDivisionStandings?.validationMessages.orEmpty(),
                                        isLoading = leagueDivisionStandingsLoading,
                                        isConfirming = leagueStandingsConfirming,
                                        canConfirmStandings = canManageLeagueStandings,
                                    )
                                }

                                DetailTab.PARTICIPANTS -> {
                                    if (eventTeamsAndParticipantsLoading) {
                                        showFab = false
                                        DetailTabLoadingState("Loading teams and participants...")
                                    } else if (isWeeklyParentEvent && selectedWeeklyOccurrence == null) {
                                        showFab = true
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .padding(horizontal = 24.dp),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text(
                                                text = "Select an occurrence from the Schedule tab to view or manage participants.",
                                                style = MaterialTheme.typography.bodyLarge,
                                                textAlign = TextAlign.Center,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    } else {
                                        ParticipantsView(
                                            showFab = { showFab = it },
                                            section = selectedParticipantsSection,
                                            onNavigateToChat = component::onNavigateToChat,
                                            manageMode = isManagingParticipants,
                                            canManageParticipants = canManageParticipantsFromDock,
                                        )
                                    }
                                }
                            }
                            @Suppress("RedundantQualifierName")
                            androidx.compose.animation.AnimatedVisibility(
                                visible = showFab,
                                modifier = Modifier.align(Alignment.BottomCenter)
                                    .padding(LocalNavBarPadding.current)
                                    .padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
                                enter = slideInVertically() + fadeIn(),
                                exit = slideOutVertically() + fadeOut()
                            ) {
                                when (selectedTab) {
                                    DetailTab.BRACKET -> BracketFloatingBar(
                                        selectedDivisionId = selectedBracketDivisionId,
                                        divisionOptions = bracketTabDivisionOptions,
                                        onDivisionSelected = component::selectDivision,
                                        showBracketToggle = selectedEvent.event.doubleElimination,
                                        isLosersBracket = losersBracket,
                                        onBracketToggle = component::toggleLosersBracket,
                                        showMatchEditAction = canManageMatchEditingFromDock,
                                        isEditingMatches = canEditMatches,
                                        onStartMatchEdit = component::startEditingMatches,
                                        onCancelMatchEdit = component::cancelEditingMatches,
                                        onCommitMatchEdit = component::commitMatchChanges,
                                        primaryActionLabel = if (canEditMatches) {
                                            "Add Match"
                                        } else {
                                            null
                                        },
                                        onPrimaryActionClick = if (canEditMatches) {
                                            component::addBracketMatch
                                        } else {
                                            null
                                        },
                                        primaryActionEnabled = canEditMatches,
                                        primaryActionColors = if (canEditMatches) {
                                            ButtonDefaults.buttonColors(
                                                containerColor = Color(0xFF2E7D32),
                                                contentColor = Color.White,
                                            )
                                        } else {
                                            null
                                        },
                                        showPrimaryActionFirst = true,
                                        selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                        onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                            component::clearSelectedWeeklySession
                                        } else {
                                            null
                                        },
                                        onShowDetailsClick = component::toggleDetails,
                                    )

                                    DetailTab.SCHEDULE -> BracketFloatingBar(
                                        selectedDivisionId = selectedJoinDivisionId,
                                        divisionOptions = if (isWeeklyParentEvent) {
                                            emptyList()
                                        } else {
                                            joinDivisionOptions
                                        },
                                        onDivisionSelected = component::selectDivision,
                                        showMatchEditAction = showScheduleMatchManagement,
                                        isEditingMatches = showScheduleMatchManagement && canEditMatches,
                                        onStartMatchEdit = component::startEditingMatches,
                                        onCancelMatchEdit = component::cancelEditingMatches,
                                        onCommitMatchEdit = component::commitMatchChanges,
                                        primaryActionLabel = if (showScheduleMatchManagement && canEditMatches) {
                                            "Add Match"
                                        } else {
                                            null
                                        },
                                        onPrimaryActionClick = if (showScheduleMatchManagement && canEditMatches) {
                                            component::addScheduleMatch
                                        } else {
                                            null
                                        },
                                        primaryActionEnabled = showScheduleMatchManagement && canEditMatches,
                                        primaryActionColors = if (showScheduleMatchManagement && canEditMatches) {
                                            ButtonDefaults.buttonColors(
                                                containerColor = Color(0xFF2E7D32),
                                                contentColor = Color.White,
                                            )
                                        } else {
                                            null
                                        },
                                        showPrimaryActionFirst = true,
                                        selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                        onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                            component::clearSelectedWeeklySession
                                        } else {
                                            null
                                        },
                                        onShowDetailsClick = component::toggleDetails,
                                    )

                                    DetailTab.LEAGUES -> BracketFloatingBar(
                                        selectedDivisionId = selectedStandingsDivisionId,
                                        divisionOptions = standingsTabDivisionOptions,
                                        onDivisionSelected = component::selectDivision,
                                        showMatchEditAction = canManageMatchEditingFromDock,
                                        isEditingMatches = canEditMatches,
                                        onStartMatchEdit = component::startEditingMatches,
                                        onCancelMatchEdit = component::cancelEditingMatches,
                                        onCommitMatchEdit = component::commitMatchChanges,
                                        showConfirmResultsAction = canConfirmLeagueResultsFromDock,
                                        confirmResultsEnabled = canConfirmLeagueResultsFromDock &&
                                            !leagueDivisionStandingsLoading &&
                                            !leagueStandingsConfirming &&
                                            leagueStandings.isNotEmpty(),
                                        confirmResultsInProgress = leagueStandingsConfirming,
                                        onConfirmResultsClick = { showStandingsConfirmDialog = true },
                                        selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                        onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                            component::clearSelectedWeeklySession
                                        } else {
                                            null
                                        },
                                        onShowDetailsClick = component::toggleDetails,
                                    )

                                    DetailTab.PARTICIPANTS -> ParticipantsFloatingBar(
                                        selectedSection = selectedParticipantsSection,
                                        availableSections = participantSections,
                                        onSectionSelected = { selectedParticipantsSection = it },
                                        showManageAction = canManageParticipantsFromDock,
                                        isManagingParticipants = isManagingParticipants,
                                        onStartManagingParticipants = {
                                            isManagingParticipants = true
                                            component.startManagingParticipants()
                                        },
                                        onStopManagingParticipants = {
                                            isManagingParticipants = false
                                            component.stopManagingParticipants()
                                        },
                                        selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                                        onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                                            component::clearSelectedWeeklySession
                                        } else {
                                            null
                                        },
                                        onShowDetailsClick = component::toggleDetails,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            AnimatedVisibility(
                visible = showStickyActions,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(LocalNavBarPadding.current)
                    .padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
                enter = slideInVertically(initialOffsetY = { fullHeight -> fullHeight / 2 }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { fullHeight -> fullHeight / 2 }) + fadeOut(),
            ) {
                StickyActionBar(
                    primaryLabel = when {
                        isWeeklyParentEvent && !joinBlockedByStart -> "Join Event"
                        shouldShowViewSchedulePrimaryAction -> "View Schedule and Participants"
                        !isUserInEvent && !joinBlockedByStart -> "Join options"
                        joinBlockedByStart && isWeeklyParentEvent -> "Occurrence Started"
                        joinBlockedByStart -> "Event Started"
                        else -> "Joined with Team"
                    },
                    primaryEnabled = if (isWeeklyParentEvent) {
                        !joinBlockedByStart
                    } else {
                        shouldShowViewSchedulePrimaryAction || (!isUserInEvent && !joinBlockedByStart)
                    },
                    onPrimaryClick = {
                        when {
                            isWeeklyParentEvent && !joinBlockedByStart -> showJoinOptionsSheet = true
                            shouldShowViewSchedulePrimaryAction -> component.viewEvent()
                            !isUserInEvent && !joinBlockedByStart -> showJoinOptionsSheet = true
                        }
                    },
                    onMapClick = mapComponent::toggleMap,
                    onDirectionsClick = component::openEventDirections,
                    directionsEnabled = hasDirectionsTarget,
                    onMapButtonPositioned = { center ->
                        mapRevealCenter = center
                    },
                    onShareClick = component::shareEvent,
                    selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                    onClearSelectedWeeklyOccurrence = if (isWeeklyParentEvent) {
                        component::clearSelectedWeeklySession
                    } else {
                        null
                    },
                )
            }
            }
                }
        }

        if (showWithdrawTargetDialog && actionWithdrawTargets.isNotEmpty()) {
            WithdrawTargetDialog(
                targets = actionWithdrawTargets,
                onDismiss = { showWithdrawTargetDialog = false },
                onTargetSelected = { target ->
                    showWithdrawTargetDialog = false
                    openLeaveOrRefundForTarget(target)
                },
            )
        }

            val canRenderJoinOptionsSheet = isWeeklyParentEvent || joinOptions.isNotEmpty()
            if (showJoinOptionsSheet && canRenderJoinOptionsSheet) {
                ModalBottomSheet(
                    onDismissRequest = { showJoinOptionsSheet = false }
                ) {
                    JoinOptionsSheet(
                        options = joinOptions,
                        paymentProcessor = component,
                        isWeeklyParentEvent = isWeeklyParentEvent,
                        weeklySessionOptions = weeklySessionOptions,
                        weeklyOccurrenceSummaries = weeklyOccurrenceSummaries,
                        selectedWeeklyOccurrenceLabel = selectedWeeklyOccurrence?.label,
                        selectedWeeklyOccurrenceSummary = selectedWeeklyOccurrenceSummary,
                        selectedWeeklyOccurrenceJoined = selectedWeeklyOccurrenceJoined,
                        selectedWeeklyOccurrenceStarted = joinBlockedByStart && isWeeklyParentEvent,
                        selectedDivisionId = selectedJoinOptionDivisionId,
                        divisionOptions = if (teamSignup) {
                            joinDivisionOptions
                        } else {
                            emptyList()
                        },
                        onDivisionSelected = { divisionId ->
                            selectedJoinOptionDivisionId = divisionId
                            component.selectDivision(divisionId)
                        },
                        onDismiss = { showJoinOptionsSheet = false },
                        onSelectOption = { action ->
                            showJoinOptionsSheet = false
                            action.onClick()
                        },
                        onSelectWeeklySession = { session ->
                            component.selectWeeklySession(
                                sessionStart = session.start,
                                sessionEnd = session.end,
                                slotId = session.slotId,
                                occurrenceDate = session.occurrenceDate,
                                label = session.label,
                            )
                        },
                    )
                }
            }

            showTeamDialog?.let { dialogState ->
                TeamSelectionDialog(
                    dialogState = dialogState, onTeamSelected = { teamId ->
                        component.selectTeamForMatch(
                            dialogState.matchId, dialogState.position, teamId
                        )
                    }, onDismiss = component::dismissTeamSelection
                )
            }
            showMatchEditDialog?.let { dialogState ->
                MatchEditDialog(
                    match = dialogState.match,
                    teams = dialogState.teams,
                    fields = dialogState.fields,
                    allMatches = dialogState.allMatches,
                    eventOfficials = dialogState.eventOfficials,
                    officialPositions = dialogState.officialPositions,
                    users = dialogState.players,
                    eventType = dialogState.eventType,
                    isCreateMode = dialogState.isCreateMode,
                    creationContext = dialogState.creationContext,
                    onDismissRequest = component::dismissMatchEditDialog,
                    onConfirm = component::updateMatchFromDialog,
                    onDelete = component::deleteMatchFromDialog,
                )
            }
            if (showTeamSelectionDialog) {
                TeamSelectionDialog(
                    eventSportLabel = teamSelectionSportLabel,
                    teams = validTeams,
                    onTeamSelected = { selectedTeam ->
                        showTeamSelectionDialog = false
                        component.joinEventAsTeam(selectedTeam)
                    },
                    onDismiss = {
                        showTeamSelectionDialog = false
                    },
                    onCreateTeam = { component.createNewTeam() },
                )
            }
            joinChoiceDialog?.let {
                AlertDialog(
                    onDismissRequest = component::dismissJoinChoiceDialog,
                    title = { Text("Join Event") },
                    text = {
                        Text("You have linked children. Do you want to join yourself or register a child instead?")
                    },
                    confirmButton = {
                        Button(onClick = component::confirmJoinAsSelf) {
                            Text("Join Myself")
                        }
                    },
                    dismissButton = {
                        Button(onClick = component::showChildJoinSelection) {
                            Text("Register Child")
                        }
                    },
                )
            }
            childJoinSelectionDialog?.let { dialogState ->
                ChildJoinSelectionDialog(
                    dialogState = dialogState,
                    onDismiss = component::dismissChildJoinSelectionDialog,
                    onChildSelected = component::selectChildForJoin,
                )
            }
            paymentPlanPreviewDialog?.let { dialogState ->
                PaymentPlanPreviewDialog(
                    dialogState = dialogState,
                    onContinue = component::confirmPaymentPlanPreviewDialog,
                    onCancel = component::dismissPaymentPlanPreviewDialog,
                )
            }
            if (showStandingsConfirmDialog) {
                AlertDialog(
                    onDismissRequest = { showStandingsConfirmDialog = false },
                    title = { Text("Confirm Results") },
                    text = {
                        Text("Update playoff assignments based on these results?")
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                showStandingsConfirmDialog = false
                                component.confirmLeagueStandings(applyReassignment = true)
                            }
                        ) {
                            Text("Yes")
                        }
                    },
                    dismissButton = {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(
                                onClick = {
                                    showStandingsConfirmDialog = false
                                    component.confirmLeagueStandings(applyReassignment = false)
                                }
                            ) {
                                Text("No")
                            }
                            TextButton(
                                onClick = { showStandingsConfirmDialog = false }
                            ) {
                                Text("Cancel")
                            }
                        }
                    },
                )
            }
            if (showBuildBracketConfirmDialog) {
                AlertDialog(
                    onDismissRequest = { showBuildBracketConfirmDialog = false },
                    title = { Text("Build Bracket(s)") },
                    text = {
                        Text(
                            "This rebuilds playoff/tournament bracket(s) from max participant count. " +
                                "It will reset the bracket and any playoff/tournament match results."
                        )
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                showBuildBracketConfirmDialog = false
                                component.buildBrackets()
                            }
                        ) {
                            Text("Build")
                        }
                    },
                    dismissButton = {
                        TextButton(
                            onClick = { showBuildBracketConfirmDialog = false }
                        ) {
                            Text("Cancel")
                        }
                    },
                )
            }
            if (showDeleteConfirmation) {
                AlertDialog(
                    onDismissRequest = { showDeleteConfirmation = false },
                    title = { Text(if (isTemplateEvent) "Delete Template" else "Delete Event") },
                    text = {
                        Text(
                            if (isTemplateEvent) {
                                "Are you sure you want to delete this template? This action cannot be undone."
                            } else if (hasAnyPaidDivision) {
                                "Are you sure you want to delete this event? All participants will receive a full refund. This action cannot be undone."
                            } else {
                                "Are you sure you want to delete this event? This action cannot be undone."
                            }
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                component.deleteEvent()
                                showDeleteConfirmation = false
                            }, colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Text("Delete")
                        }
                    },
                    dismissButton = {
                        Button(onClick = { showDeleteConfirmation = false }) {
                            Text("Cancel")
                        }
                    })
            }

            if (showNotifyDialog) {
                SendNotificationDialog(onSend = {
                    component.sendNotification(
                        title = "Event Notification", message = "Event Notification"
                    )
                    showNotifyDialog = false
                }, onDismiss = {
                    showNotifyDialog = false
                })
            }

            if (showReportEventDialog) {
                AlertDialog(
                    onDismissRequest = { showReportEventDialog = false },
                    title = { Text("Report event") },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Report objectionable content or abusive behavior tied to this event.")
                            StandardTextField(
                                value = reportEventNotes,
                                onValueChange = { reportEventNotes = it },
                                modifier = Modifier.fillMaxWidth(),
                                label = "Notes (optional)",
                            )
                        }
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                component.reportEvent(reportEventNotes)
                                reportEventNotes = ""
                                showReportEventDialog = false
                            }
                        ) {
                            Text("Report")
                        }
                    },
                    dismissButton = {
                        TextButton(
                            onClick = {
                                reportEventNotes = ""
                                showReportEventDialog = false
                            }
                        ) {
                            Text("Cancel")
                        }
                    },
                )
            }

            if (showRefundReasonDialog) {
                RefundReasonDialog(
                    currentReason = refundReason,
                    onReasonChange = { refundReason = it },
                    onConfirm = {
                        component.requestRefund(
                            reason = refundReason,
                            targetUserId = selectedWithdrawalTarget?.userId,
                        )
                        showRefundReasonDialog = false
                        refundReason = ""
                        selectedWithdrawalTarget = null
                    },
                    onDismiss = {
                        showRefundReasonDialog = false
                        refundReason = ""
                        selectedWithdrawalTarget = null
                    })
            }

            textSignaturePrompt?.let { prompt ->
                TextSignatureDialog(
                    prompt = prompt,
                    onConfirm = component::confirmTextSignature,
                    onDismiss = component::dismissTextSignature,
                )
            }

            webSignaturePrompt?.let { prompt ->
                val signerLabel = prompt.step?.requiredSignerLabel
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let { label -> "Required signer: $label" }
                val progressLabel = if (prompt.totalSteps > 1) {
                    "Document ${prompt.currentStep} of ${prompt.totalSteps}"
                } else {
                    null
                }
                val description = listOfNotNull(progressLabel, signerLabel).joinToString(" - ")

                EmbeddedWebModal(
                    title = prompt.step?.title ?: "Sign required document",
                    url = prompt.url,
                    description = description,
                    onDismiss = component::dismissWebSignaturePrompt,
                )
            }

            if (showFeeBreakdown && currentFeeBreakdown != null) {
                FeeBreakdownDialog(
                    feeBreakdown = currentFeeBreakdown!!,
                    onConfirm = { component.confirmFeeBreakdown() },
                    onCancel = { component.dismissFeeBreakdown() })
            }

            billingAddressPrompt?.let { address ->
                BillingAddressDialog(
                    initialAddress = address,
                    onConfirm = component::submitBillingAddress,
                    onDismiss = component::dismissBillingAddressPrompt,
                )
            }
        }
    }
}
@Composable
fun TeamSelectionDialog(
    eventSportLabel: String,
    teams: List<TeamWithPlayers>,
    onTeamSelected: (TeamWithPlayers) -> Unit,
    onDismiss: () -> Unit,
    onCreateTeam: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select a team for $eventSportLabel") },
        text = {
            // List only valid teams
            LazyColumn {
                items(teams) { team ->
                    Row(modifier = Modifier.fillMaxWidth().clickable { onTeamSelected(team) }
                        .padding(8.dp)) {
                        TeamCard(team)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onCreateTeam) {
                Text("Manage Teams")
            }
        })
}

@Composable
private fun ChildJoinSelectionDialog(
    dialogState: ChildJoinSelectionDialogState,
    onDismiss: () -> Unit,
    onChildSelected: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Child") },
        text = {
            LazyColumn {
                items(dialogState.children, key = { it.userId }) { child ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onChildSelected(child.userId) }
                            .padding(vertical = 8.dp),
                    ) {
                        Text(text = child.fullName, style = MaterialTheme.typography.bodyLarge)
                        val subtitle = if (child.hasEmail) {
                            child.email ?: "Email available"
                        } else {
                            "Missing email. Registration can start, but child signature stays pending until email is added."
                        }
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (child.hasEmail) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.error
                            },
                        )
                    }
                    HorizontalDivider()
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

private fun WithdrawTargetMembership.displayName(): String = when (this) {
    WithdrawTargetMembership.PARTICIPANT -> "Registered"
    WithdrawTargetMembership.WAITLIST -> "Waitlist"
    WithdrawTargetMembership.FREE_AGENT -> "Free Agent"
}

@Composable
private fun WithdrawTargetDialog(
    targets: List<WithdrawTargetOption>,
    onDismiss: () -> Unit,
    onTargetSelected: (WithdrawTargetOption) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Withdraw Profile") },
        text = {
            LazyColumn {
                items(targets, key = { it.userId }) { target ->
                    val title = if (target.isSelf) "My Registration" else target.fullName
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onTargetSelected(target) }
                            .padding(vertical = 8.dp),
                    ) {
                        Text(
                            text = title.ifBlank { "Registration" },
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            text = target.membership.displayName(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    HorizontalDivider()
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

@Composable
private fun LeagueStandingsTab(
    standings: List<TeamStanding>,
    showDrawColumn: Boolean,
    validationMessages: List<String>,
    isLoading: Boolean,
    isConfirming: Boolean,
    canConfirmStandings: Boolean,
    showFab: (Boolean) -> Unit,
) {
    val standingsListState = rememberLazyListState()
    val standingsColumns = remember(showDrawColumn) {
        visibleLeagueStandingsColumns(showDrawColumn)
    }
    val isScrollingUp by standingsListState.isScrollingUp()
    showFab(if (standings.isEmpty()) true else isScrollingUp)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
    ) {
        if (canConfirmStandings && (validationMessages.isNotEmpty() || isLoading || isConfirming)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (validationMessages.isNotEmpty()) {
                    validationMessages.forEach { validationMessage ->
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
        } else if (isLoading) {
            LinearProgressIndicator(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }

        if (standings.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "Standings will appear once scores are reported.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            return@Column
        }

        LeagueStandingsHeader(columns = standingsColumns)
        LazyColumn(
            modifier = Modifier
                .fillMaxSize(),
            state = standingsListState,
        ) {
            items(standings, key = { it.teamId }) { standing ->
                LeagueStandingRow(
                    standing = standing,
                    columns = standingsColumns,
                )
            }
        }
    }
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

@Composable
fun TextSignatureDialog(
    prompt: TextSignaturePromptState,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    var accepted by remember(prompt.step.templateId) { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(prompt.step.title ?: "Required Document Signature") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Document ${prompt.currentStep} of ${prompt.totalSteps}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                prompt.step.requiredSignerLabel?.let { signerLabel ->
                    Text(
                        text = "Required signer: $signerLabel",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = prompt.step.content ?: "No document text was provided.",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp, max = 320.dp)
                        .verticalScroll(rememberScrollState())
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = accepted, onCheckedChange = { accepted = it })
                    Text("I have read and agree to this document.")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = accepted
            ) {
                Text("Accept and Continue")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun RefundReasonDialog(
    currentReason: String,
    onReasonChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Refund Request") }, text = {
        Column {
            Text(
                "Please provide a reason for your refund request:",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            StandardTextField(
                value = currentReason,
                onValueChange = onReasonChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = "Enter reason...",
            )
        }
    }, confirmButton = {
        Button(
            onClick = onConfirm, enabled = currentReason.isNotBlank()
        ) {
            Text("Submit Refund Request")
        }
    }, dismissButton = {
        Button(onClick = onDismiss) {
            Text("Cancel")
        }
    })
}

private fun Int.centsToDollars(): String {
    val dollars = this / 100.0
    val rounded = round(dollars * 100) / 100
    val wholePart = rounded.toInt()
    val decimalPart = ((rounded - wholePart) * 100).toInt()
    return if (decimalPart == 0) {
        "$wholePart.00"
    } else if (decimalPart < 10) {
        "$wholePart.0$decimalPart"
    } else {
        "$wholePart.$decimalPart"
    }
}

@Composable
fun FeeBreakdownDialog(
    feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit
) {
    AlertDialog(onDismissRequest = onCancel, title = { Text("Payment Breakdown") }, text = {
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                "Review the charges before proceeding:", style = MaterialTheme.typography.bodyMedium
            )

            HorizontalDivider()

            FeeRow("Event Price", "$${feeBreakdown.eventPrice.centsToDollars()}")
            FeeRow("Processing Fee", "$${feeBreakdown.processingFee.centsToDollars()}")
            FeeRow("Stripe Fee", "$${feeBreakdown.stripeFee.centsToDollars()}")
            feeBreakdown.taxAmount?.takeIf { it > 0 }?.let { taxAmount ->
                FeeRow("Tax", "$${taxAmount.centsToDollars()}")
            }

            HorizontalDivider()

            FeeRow(
                "Total Charge", "$${feeBreakdown.totalCharge.centsToDollars()}", isTotal = true
            )

            Text(
                "Host receives: $${feeBreakdown.hostReceives.centsToDollars()}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }, confirmButton = {
        Button(onClick = onConfirm) {
            Text("Proceed to Payment")
        }
    }, dismissButton = {
        Button(onClick = onCancel) {
            Text("Cancel")
        }
    })
}

@Composable
private fun PaymentPlanPreviewDialog(
    dialogState: PaymentPlanPreviewDialogState,
    onContinue: () -> Unit,
    onCancel: () -> Unit,
) {
    val installmentRows = remember(dialogState.installmentAmounts, dialogState.installmentDueDates) {
        val rowCount = maxOf(
            dialogState.installmentAmounts.size,
            dialogState.installmentDueDates.size,
        )
        List(rowCount) { index ->
            val amountCents = dialogState.installmentAmounts.getOrNull(index)?.coerceAtLeast(0) ?: 0
            val dueDate = dialogState.installmentDueDates
                .getOrNull(index)
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: "TBD"
            Triple(index + 1, amountCents, dueDate)
        }
    }
    val ownerSubject = if (dialogState.ownerLabel.equals("You", ignoreCase = true)) {
        "you"
    } else {
        dialogState.ownerLabel
    }

    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Payment Plan Preview") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Continuing will join the event and start a payment plan for $ownerSubject.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                dialogState.divisionLabel
                    ?.takeIf(String::isNotBlank)
                    ?.let { divisionLabel ->
                        Text(
                            text = "Division: $divisionLabel",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                HorizontalDivider()

                FeeRow(
                    label = "Plan Total",
                    amount = "$${dialogState.totalAmountCents.centsToDollars()}",
                    isTotal = true,
                )

                if (installmentRows.isNotEmpty()) {
                    HorizontalDivider()
                    installmentRows.forEach { (sequence, amountCents, dueDate) ->
                        FeeRow(
                            label = "Installment $sequence (Due $dueDate)",
                            amount = "$${amountCents.centsToDollars()}",
                        )
                    }
                } else {
                    Text(
                        text = "Installment schedule will be generated after joining.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = onContinue) {
                Text("Continue")
            }
        },
        dismissButton = {
            Button(onClick = onCancel) {
                Text("Cancel")
            }
        },
    )
}

@Composable
private fun FeeRow(
    label: String, amount: String, isTotal: Boolean = false
) {
    Row(
        modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = if (isTotal) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal
        )
        Text(
            text = amount,
            style = if (isTotal) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal
        )
    }
}
