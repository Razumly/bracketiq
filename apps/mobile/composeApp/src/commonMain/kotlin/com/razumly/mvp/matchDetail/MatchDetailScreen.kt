@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.activePlayerRegistrations
import com.razumly.mvp.core.data.dataTypes.normalizedOfficialAssignments
import com.razumly.mvp.core.network.dto.MatchRosterDto
import com.razumly.mvp.core.network.dto.MatchRosterEntryDto
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.guides.EventGuideIds
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.presentation.guides.matchOfficialPreCheckInGuide
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.core.presentation.util.playMatchTimerAlert
import com.razumly.mvp.core.presentation.util.toTeamDisplayLabel
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.eventDetail.composables.DropdownField
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.Remove24Px
import dev.icerock.moko.geo.LatLng
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.not_official_check_in_message
import mvp.composeapp.generated.resources.official_check_in_title
import mvp.composeapp.generated.resources.official_checkin_message
import org.jetbrains.compose.resources.stringResource
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private const val WEB_LAYOUT_BREAKPOINT_DP = 600
private const val FIELD_DISTANCE_WARNING_THRESHOLD_MILES = 0.01
private const val EARTH_RADIUS_MILES = 3958.8
private const val MATCH_DELAY_STATUS = "DELAYED"
private val DelayedMatchTimeContainerColor = Color(0xFFFFD54F)
private val DelayedMatchTimeContentColor = Color(0xFF3A2A00)
private val MatchDetailBottomDockLift = 28.dp
private val MatchDetailBottomDockContentReserve = 80.dp
private val MatchDetailActionButtonHeight = 56.dp
private val MatchDetailDetailsButtonWidth = 156.dp
private val MatchDetailCourtButtonMinWidth = 96.dp
private val MatchDetailCourtButtonMaxWidth = 220.dp

private fun matchLogTypeLabel(type: String): String = when (type.trim().uppercase()) {
    "POINT" -> "Point"
    "GOAL" -> "Goal"
    "RUN" -> "Run"
    "DISCIPLINE" -> "Penalty or card"
    "NOTE" -> "Match note"
    "ADMIN" -> "Admin note"
    else -> type
        .lowercase()
        .split("_", "-", " ")
        .filter { it.isNotBlank() }
        .joinToString(" ") { part -> part.replaceFirstChar { char -> char.titlecase() } }
        .ifBlank { "Match note" }
}

private data class MatchLocationTarget(
    val focusedLocation: LatLng,
    val place: MVPPlace?,
    val warningDistanceMiles: Double?,
)

internal fun matchTeamDisplayLabel(
    team: TeamWithRelations?,
    fallbackLabel: String,
): String = team?.toTeamDisplayLabel(fallbackLabel) ?: fallbackLabel

internal data class MatchParticipantOption(
    val selectionId: String,
    val label: String,
    val eventRegistrationId: String?,
    val participantUserId: String,
)

private data class MatchIncidentDialogTarget(
    val eventTeamId: String?,
)

private data class MatchActionDialogTarget(
    val action: String,
    val forfeitingEventTeamId: String? = null,
    val title: String,
    val message: String,
    val confirmLabel: String,
)

internal data class MatchOfficialDetailRow(
    val positionLabel: String,
    val officialName: String,
    val checkedIn: Boolean,
)

internal fun titleCaseMatchValue(value: String?): String {
    val normalized = value?.trim().orEmpty()
    if (normalized.isBlank()) return ""
    return normalized
        .lowercase()
        .split("_", "-", " ")
        .filter(String::isNotBlank)
        .joinToString(" ") { part -> part.replaceFirstChar { char -> char.titlecase() } }
}

private fun parseMatchInstant(value: String?): Instant? {
    val normalized = value?.trim()?.takeIf(String::isNotBlank) ?: return null
    return runCatching { Instant.parse(normalized) }.getOrNull()
}

private fun MatchMVP.isDelayedStatus(): Boolean =
    status.equals(MATCH_DELAY_STATUS, ignoreCase = true)

private fun formatClockSeconds(seconds: Int): String {
    val safeSeconds = seconds.coerceAtLeast(0)
    val hours = safeSeconds / 3600
    val minutes = (safeSeconds % 3600) / 60
    val remainingSeconds = safeSeconds % 60
    return if (hours > 0) {
        "$hours:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}"
    } else {
        "${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}"
    }
}

private fun formatClockSecondsAsMinutes(seconds: Int): String {
    val safeSeconds = seconds.coerceAtLeast(0)
    val minutes = safeSeconds / 60
    val remainingSeconds = safeSeconds % 60
    return "$minutes:${remainingSeconds.toString().padStart(2, '0')}"
}

private fun durationSecondsForSegmentSequence(
    rules: ResolvedMatchRulesMVP,
    sequence: Int,
): Int? {
    val durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence.getOrNull(sequence - 1)
        ?: rules.timekeeping.segmentDurationMinutes
    return durationMinutes?.takeIf { it > 0 }?.times(60)
}

private fun regulationOffsetSecondsForSegment(
    segment: MatchSegmentMVP?,
    rules: ResolvedMatchRulesMVP,
): Int {
    if (segment == null || !rules.timekeeping.addedTimeEnabled) return 0
    val sequence = segment.sequence.coerceAtLeast(1)
    var offsetSeconds = 0
    for (index in 1 until sequence) {
        offsetSeconds += durationSecondsForSegmentSequence(rules, index) ?: 0
    }
    return offsetSeconds
}

private fun formatAddedTimeIncidentClock(regulationEndSeconds: Int, addedSeconds: Int): String {
    val regulationMinute = (regulationEndSeconds / 60).coerceAtLeast(0)
    val addedMinute = ((addedSeconds.coerceAtLeast(1) + 59) / 60).coerceAtLeast(1)
    return "$regulationMinute+$addedMinute"
}

internal fun buildMatchOfficialDetailRows(
    match: MatchMVP,
    positions: List<EventOfficialPosition>,
    usersById: Map<String, UserData>,
): List<MatchOfficialDetailRow> {
    val positionsById = positions.associateBy(EventOfficialPosition::id)
    val assignments = match.normalizedOfficialAssignments()
    if (assignments.isNotEmpty()) {
        return assignments.map { assignment ->
            val position = positionsById[assignment.positionId]
            MatchOfficialDetailRow(
                positionLabel = officialPositionLabel(
                    position = position,
                    slotIndex = assignment.slotIndex,
                    holderType = assignment.holderType,
                ),
                officialName = officialDisplayName(usersById[assignment.userId]),
                checkedIn = assignment.checkedIn,
            )
        }
    }

    val legacyOfficialId = match.officialId?.trim()?.takeIf(String::isNotBlank) ?: return emptyList()
    return listOf(
        MatchOfficialDetailRow(
            positionLabel = "Official",
            officialName = officialDisplayName(usersById[legacyOfficialId]),
            checkedIn = match.officialCheckedIn == true,
        )
    )
}

private fun officialPositionLabel(
    position: EventOfficialPosition?,
    slotIndex: Int,
    holderType: OfficialAssignmentHolderType,
): String {
    val baseLabel = position?.name?.trim()?.takeIf(String::isNotBlank) ?: "Official"
    val slotLabel = if ((position?.count ?: 1) > 1) {
        "$baseLabel ${slotIndex + 1}"
    } else {
        baseLabel
    }
    return if (holderType == OfficialAssignmentHolderType.PLAYER) {
        "$slotLabel (Player)"
    } else {
        slotLabel
    }
}

private fun officialDisplayName(user: UserData?): String =
    user?.fullName?.trim()?.takeIf(String::isNotBlank) ?: "Unknown official"

internal fun matchDisplayScore(
    scoringModel: String,
    segments: List<MatchSegmentMVP>,
    teamId: String?,
    legacyScores: List<Int>,
    currentSegmentIndex: Int,
): Int {
    val orderedSegments = segments.sortedBy { segment -> segment.sequence }
    if (scoringModel.trim().uppercase() == "SETS") {
        return segmentScore(
            segment = orderedSegments.getOrNull(currentSegmentIndex),
            teamId = teamId,
            fallbackScores = legacyScores,
            index = currentSegmentIndex,
        )
    }

    val normalizedTeamId = teamId?.trim()?.takeIf(String::isNotBlank) ?: return legacyScores.sum()
    val hasSegmentScores = orderedSegments.any { segment ->
        segment.scores.containsKey(normalizedTeamId)
    }
    return if (hasSegmentScores) {
        orderedSegments.sumOf { segment -> segment.scores[normalizedTeamId] ?: 0 }
    } else {
        legacyScores.sum()
    }
}

internal fun matchDetailSegmentCount(
    rules: ResolvedMatchRulesMVP,
    segments: List<MatchSegmentMVP>,
    team1Scores: List<Int>,
    team2Scores: List<Int>,
): Int {
    val matchScoreSegmentCount = listOf(
        segments.size,
        team1Scores.size,
        team2Scores.size,
    ).maxOrNull() ?: 0
    return matchScoreSegmentCount.takeIf { it > 0 } ?: rules.segmentCount.coerceAtLeast(1)
}

internal fun shouldShowMatchSegmentBreakdown(
    rules: ResolvedMatchRulesMVP,
    segments: List<MatchSegmentMVP>,
    team1Scores: List<Int>,
    team2Scores: List<Int>,
): Boolean = matchDetailSegmentCount(
    rules = rules,
    segments = segments,
    team1Scores = team1Scores,
    team2Scores = team2Scores,
) > 1

internal fun activeMatchSegmentLabel(
    segmentBaseLabel: String,
    currentSegmentIndex: Int,
    showSegmentBreakdown: Boolean,
): String? = if (showSegmentBreakdown) {
    "$segmentBaseLabel ${currentSegmentIndex + 1}"
} else {
    null
}

internal data class MatchSegmentTrackerEntry(
    val label: String,
    val team1Score: Int,
    val team2Score: Int,
    val isActive: Boolean,
    val isComplete: Boolean,
)

internal fun buildMatchSegmentTrackerEntries(
    rules: ResolvedMatchRulesMVP,
    segmentBaseLabel: String,
    segments: List<MatchSegmentMVP>,
    team1Id: String?,
    team2Id: String?,
    team1Scores: List<Int>,
    team2Scores: List<Int>,
    currentSegmentIndex: Int,
): List<MatchSegmentTrackerEntry> {
    if (rules.scoringModel != "SETS") {
        return emptyList()
    }
    val orderedSegments = segments.sortedBy { segment -> segment.sequence }
    val segmentCount = matchDetailSegmentCount(
        rules = rules,
        segments = orderedSegments,
        team1Scores = team1Scores,
        team2Scores = team2Scores,
    )
    return List(segmentCount) { index ->
        val segment = orderedSegments.getOrNull(index)
        MatchSegmentTrackerEntry(
            label = "$segmentBaseLabel ${index + 1}",
            team1Score = segmentScore(segment, team1Id, team1Scores, index),
            team2Score = segmentScore(segment, team2Id, team2Scores, index),
            isActive = index == currentSegmentIndex,
            isComplete = segment?.status.equals("COMPLETE", ignoreCase = true),
        )
    }
}

internal fun incidentDialogTypes(
    rules: ResolvedMatchRulesMVP,
    teamScoped: Boolean,
): List<String> {
    val scoringType = scoringIncidentType(rules)
    val supportedTypes = rules.supportedIncidentTypes
        .mapNotNull { type -> type.trim().uppercase().takeIf(String::isNotBlank) }
        .ifEmpty { listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN") }
        .distinct()
    val includeScoring = teamScoped && rules.pointIncidentRequiresParticipant
    val filteredTypes = supportedTypes.filter { type ->
        val scoring = isScoringIncidentType(type) || type == scoringType
        when {
            scoring -> false
            teamScoped -> !isTeamAgnosticIncidentType(type)
            else -> isTeamAgnosticIncidentType(type)
        }
    }
    return if (includeScoring) {
        listOf(scoringType) + filteredTypes
    } else {
        filteredTypes
    }.distinct()
}

internal fun defaultIncidentDialogType(
    rules: ResolvedMatchRulesMVP,
    options: List<String>,
): String {
    val scoringType = scoringIncidentType(rules)
    return if (rules.pointIncidentRequiresParticipant) {
        options.firstOrNull { type -> type == scoringType || isScoringIncidentType(type) } ?: options.firstOrNull().orEmpty()
    } else {
        options.firstOrNull().orEmpty()
    }
}

private fun scoringIncidentType(rules: ResolvedMatchRulesMVP): String =
    rules.autoCreatePointIncidentType?.trim()?.uppercase()?.takeIf(String::isNotBlank) ?: "POINT"

private fun isTeamAgnosticIncidentType(type: String): Boolean = when (type.trim().uppercase()) {
    "NOTE", "ADMIN" -> true
    else -> false
}

@Composable
fun MatchDetailScreen(
    component: MatchContentComponent,
    mapComponent: MapComponent,
    onBackClick: () -> Unit,
) {
    val match by component.matchWithTeams.collectAsState()
    val event by component.event.collectAsState()
    val rules by component.matchRules.collectAsState()
    val officialUsers by component.officialUsers.collectAsState()
    val isOfficial by component.isOfficial.collectAsState()
    val officialCheckedIn by component.officialCheckedIn.collectAsState()
    val officialCheckInSaving by component.officialCheckInSaving.collectAsState()
    val matchStartSaving by component.matchStartSaving.collectAsState()
    val matchTimeSaving by component.matchTimeSaving.collectAsState()
    val matchActionSaving by component.matchActionSaving.collectAsState()
    val segmentConfirmSaving by component.segmentConfirmSaving.collectAsState()
    val showOfficialCheckInDialog by component.showOfficialCheckInDialog.collectAsState()
    val matchTeamCheckIns by component.matchTeamCheckIns.collectAsState()
    val showTeamCheckInDialog by component.showTeamCheckInDialog.collectAsState()
    val teamCheckInSaving by component.teamCheckInSaving.collectAsState()
    val currentUserManagedMatchTeamId by component.currentUserManagedMatchTeamId.collectAsState()
    val matchRosters by component.matchRosters.collectAsState()
    val matchRosterLoading by component.matchRosterLoading.collectAsState()
    val matchRosterSaving by component.matchRosterSaving.collectAsState()
    val showMatchRosterDialog by component.showMatchRosterDialog.collectAsState()
    val currentSet by component.currentSet.collectAsState()
    val matchFinished by component.matchFinished.collectAsState()
    val canManageMatchActions by component.canManageMatchActions.collectAsState()
    val assignedTeamOfficialPendingCheckIn by component.assignedTeamOfficialPendingCheckIn.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val currentLocation by mapComponent.currentLocation.collectAsState()
    val isWebLayout = getScreenWidth() >= WEB_LAYOUT_BREAKPOINT_DP
    val useNativeMapOverlayTransition = Platform.isIOS && !isWebLayout
    val showScoreControls = !isWebLayout
    val showOfficialScoreControls = showScoreControls && isOfficial
    var showScoreGestureHint by rememberSaveable(match.match.id) { mutableStateOf(true) }
    val navBottomPadding = LocalNavBarPadding.current.calculateBottomPadding()
    val density = LocalDensity.current
    val safeBottomPadding = with(density) { WindowInsets.safeDrawing.getBottom(this).toDp() }
    val bottomDockBottomPadding = maxOf(navBottomPadding, safeBottomPadding) + MatchDetailBottomDockLift
    val team1 = match.team1
    val team2 = match.team2
    val currentUserManagedMatchTeam = remember(currentUserManagedMatchTeamId, team1, team2) {
        when (currentUserManagedMatchTeamId) {
            team1?.team?.id -> team1
            team2?.team?.id -> team2
            else -> null
        }
    }
    val currentUserManagedMatchRoster = remember(matchRosters, currentUserManagedMatchTeamId) {
        matchRosters?.rosters?.firstOrNull { roster -> roster.eventTeamId == currentUserManagedMatchTeamId }
    }
    val canEditMatchRoster = event?.teamSignup == true &&
        event?.allowMatchRosterEdits == true &&
        (matchFinished || event?.let { isTeamCheckInWindowOpen(match.match, it) } == true) &&
        currentUserManagedMatchTeamId != null
    val matchCheckInEnabled = event?.teamSignup == true && event?.teamCheckInMode?.name == "MATCH"
    val incidentDefinitionsByCode = remember(rules.incidentTypeDefinitions) {
        rules.incidentTypeDefinitions.associateBy { definition ->
            definition.code.trim().uppercase()
        }
    }
    fun incidentLabel(type: String): String =
        incidentDefinitionsByCode[type.trim().uppercase()]?.label
            ?: matchLogTypeLabel(type)
    val participantOptionsByTeam = remember(team1, team2, match.match.team1Id, match.match.team2Id) {
        buildMap {
            match.match.team1Id?.takeIf(String::isNotBlank)?.let { teamId ->
                put(teamId, buildParticipantOptions(team1, teamId))
            }
            match.match.team2Id?.takeIf(String::isNotBlank)?.let { teamId ->
                put(teamId, buildParticipantOptions(team2, teamId))
            }
        }
    }

    var mapRevealCenter by remember { mutableStateOf(Offset.Zero) }
    var showMatchDetails by remember { mutableStateOf(false) }
    var pendingIncidentTarget by remember(match.match.id) { mutableStateOf<MatchIncidentDialogTarget?>(null) }
    var pendingMatchAction by remember(match.match.id) { mutableStateOf<MatchActionDialogTarget?>(null) }
    var showForfeitTeamDialog by remember(match.match.id) { mutableStateOf(false) }
    var incidentType by remember(match.match.id) { mutableStateOf("") }
    var incidentParticipantId by remember(match.match.id) { mutableStateOf<String?>(null) }
    var incidentMinute by remember(match.match.id) { mutableStateOf("") }
    var incidentNote by remember(match.match.id) { mutableStateOf("") }
    var editingActualTimes by remember(match.match.id) { mutableStateOf(false) }
    var actualStartDraft by remember(match.match.id, match.match.actualStart) {
        mutableStateOf(parseMatchInstant(match.match.actualStart))
    }
    var actualEndDraft by remember(match.match.id, match.match.actualEnd) {
        mutableStateOf(parseMatchInstant(match.match.actualEnd))
    }
    var actualTimeError by remember(match.match.id) { mutableStateOf<String?>(null) }
    var delayPromptNowMillis by remember(match.match.id) { mutableStateOf(Clock.System.now().toEpochMilliseconds()) }
    var presentedDelayPromptKey by remember(match.match.id, match.match.start) { mutableStateOf<String?>(null) }
    var deniedDelayPromptKey by remember(match.match.id, match.match.start) { mutableStateOf<String?>(null) }
    val locationTarget = remember(match.field, match.match.id, event, currentLocation) {
        resolveLocationTarget(
            field = match.field,
            event = event,
            fallbackLocation = currentLocation,
            matchId = match.match.id,
        )
    }

    LaunchedEffect(locationTarget.place) {
        mapComponent.setEvents(emptyList())
        mapComponent.setPlaces(locationTarget.place?.let(::listOf) ?: emptyList())
    }

    val activeParticipantOptions = remember(participantOptionsByTeam, pendingIncidentTarget) {
        pendingIncidentTarget?.eventTeamId?.let { teamId -> participantOptionsByTeam[teamId] }.orEmpty()
    }
    val selectedParticipant = remember(activeParticipantOptions, incidentParticipantId) {
        activeParticipantOptions.firstOrNull { option -> option.selectionId == incidentParticipantId }
    }
    val fieldLocationLabel = remember(match.field, locationTarget.place) {
        match.field?.name?.trim()?.takeIf(String::isNotBlank)
            ?: locationTarget.place?.name?.trim()?.takeIf(String::isNotBlank)
            ?: "Field Location"
    }
    val nativeMapOverlayProgress by animateFloatAsState(
        targetValue = if (showMap && useNativeMapOverlayTransition) 1f else 0f,
        animationSpec = tween(durationMillis = 450),
        label = "matchDetailNativeMapOverlayProgress",
    )
    LaunchedEffect(pendingIncidentTarget, activeParticipantOptions) {
        if (pendingIncidentTarget == null || pendingIncidentTarget?.eventTeamId == null) {
            incidentParticipantId = null
            return@LaunchedEffect
        }
        if (activeParticipantOptions.isEmpty()) {
            incidentParticipantId = null
            return@LaunchedEffect
        }
        if (incidentParticipantId == null || activeParticipantOptions.none { option -> option.selectionId == incidentParticipantId }) {
            incidentParticipantId = activeParticipantOptions.first().selectionId
        }
    }
    val orderedSegments = remember(match.match.segments) {
        match.match.segments.sortedBy { segment -> segment.sequence }
    }
    val visibleIncidents = remember(match.match.incidents) {
        match.match.incidents.filterNot { incident -> incident.isPendingIncidentDelete() }
    }
    val officialRows = remember(match.match, event?.officialPositions, officialUsers) {
        buildMatchOfficialDetailRows(
            match = match.match,
            positions = event?.officialPositions.orEmpty(),
            usersById = officialUsers,
        )
    }
    val activeSegment = orderedSegments.getOrNull(currentSet)
    var timerNowMillis by remember(match.match.id) { mutableStateOf(Clock.System.now().toEpochMilliseconds()) }
    val activeSegmentDurationMinutes = activeSegment?.let { segment ->
        rules.timekeeping.segmentDurationMinutesBySequence.getOrNull(segment.sequence - 1)
            ?: rules.timekeeping.segmentDurationMinutes
    } ?: rules.timekeeping.segmentDurationMinutes
    val activeSegmentDurationSeconds = activeSegmentDurationMinutes?.takeIf { it > 0 }?.times(60)
    val useCumulativeClock = rules.timekeeping.addedTimeEnabled
    val activeSegmentRegulationOffsetSeconds = regulationOffsetSecondsForSegment(activeSegment, rules)
    val regulationDurationSeconds = activeSegmentDurationSeconds ?: 0
    val activeSegmentRegulationEndSeconds = activeSegmentRegulationOffsetSeconds + regulationDurationSeconds
    val hasMatchClock = rules.timekeeping.timerMode != "NONE" && activeSegmentDurationSeconds != null
    val activeSegmentStartedAt = parseMatchInstant(activeSegment?.startedAt)
    val activeSegmentEndedAt = parseMatchInstant(activeSegment?.endedAt)
    val rawClockSeconds = activeSegmentStartedAt?.let { started ->
        (((activeSegmentEndedAt?.toEpochMilliseconds() ?: timerNowMillis) - started.toEpochMilliseconds()) / 1000L)
            .coerceAtLeast(0L)
            .toInt()
    } ?: 0
    val segmentClockSeconds = if (hasMatchClock && rules.timekeeping.stopAtRegulationEnd) {
        rawClockSeconds.coerceAtMost(regulationDurationSeconds)
    } else {
        rawClockSeconds
    }
    val clockSeconds = if (useCumulativeClock) {
        activeSegmentRegulationOffsetSeconds + segmentClockSeconds
    } else {
        segmentClockSeconds
    }
    val clockInAddedTime = hasMatchClock &&
        rules.timekeeping.addedTimeEnabled &&
        rawClockSeconds > regulationDurationSeconds
    val activeTimerRunning = hasMatchClock &&
        activeSegmentStartedAt != null &&
        activeSegmentEndedAt == null &&
        (!rules.timekeeping.stopAtRegulationEnd || rawClockSeconds < regulationDurationSeconds)
    val regulationClockEnded = hasMatchClock &&
        activeSegmentStartedAt != null &&
        activeSegmentEndedAt == null &&
        rules.timekeeping.stopAtRegulationEnd &&
        rawClockSeconds >= regulationDurationSeconds
    val displayClockFormatter: (Int) -> String = if (useCumulativeClock) ::formatClockSecondsAsMinutes else ::formatClockSeconds
    val clockDisplay = when {
        !hasMatchClock -> ""
        activeSegmentStartedAt == null -> displayClockFormatter(if (useCumulativeClock) activeSegmentRegulationOffsetSeconds else 0)
        clockInAddedTime ->
            "${displayClockFormatter(if (useCumulativeClock) activeSegmentRegulationEndSeconds else regulationDurationSeconds)} +${formatClockSeconds(rawClockSeconds - regulationDurationSeconds)}"
        else -> displayClockFormatter(clockSeconds)
    }
    val clockMinute = if (hasMatchClock && activeSegmentStartedAt != null) {
        (clockSeconds + 59) / 60
    } else {
        null
    }
    val incidentClockInput = when {
        !hasMatchClock || activeSegmentStartedAt == null -> ""
        useCumulativeClock && clockInAddedTime ->
            formatAddedTimeIncidentClock(activeSegmentRegulationEndSeconds, rawClockSeconds - regulationDurationSeconds)
        else -> clockMinute?.toString().orEmpty()
    }
    var regulationAlertedTimerKey by remember(match.match.id) { mutableStateOf<String?>(null) }
    val regulationTimerKey = "${activeSegment?.id.orEmpty()}:${activeSegment?.startedAt.orEmpty()}"
    LaunchedEffect(activeTimerRunning, activeSegment?.id, activeSegment?.startedAt, activeSegment?.endedAt) {
        while (activeTimerRunning) {
            timerNowMillis = Clock.System.now().toEpochMilliseconds()
            delay(1_000L)
        }
    }
    LaunchedEffect(regulationClockEnded, regulationTimerKey) {
        if (regulationClockEnded && regulationAlertedTimerKey != regulationTimerKey) {
            playMatchTimerAlert()
            regulationAlertedTimerKey = regulationTimerKey
        }
    }
    val delayPromptKey = "${match.match.id}:${match.match.start?.toString().orEmpty()}"
    val delayThresholdPassed = match.match.start?.let { scheduledStart ->
        delayPromptNowMillis >= (scheduledStart + 5.minutes).toEpochMilliseconds()
    } == true
    val officialMatchWindowOpen = isOfficialMatchWindowOpen(match.match)
    val delayPromptEligible = isOfficial &&
        officialCheckedIn &&
        officialMatchWindowOpen &&
        !matchFinished &&
        !showOfficialCheckInDialog &&
        !match.match.isDelayedStatus() &&
        match.match.actualStart.isNullOrBlank() &&
        delayThresholdPassed
    val showDelayPrompt = remember(
        delayPromptEligible,
        presentedDelayPromptKey,
        delayPromptKey,
    ) {
        delayPromptEligible && presentedDelayPromptKey != delayPromptKey
    }
    val showSetDelayedButton = delayPromptEligible &&
        deniedDelayPromptKey == delayPromptKey
    LaunchedEffect(
        match.match.id,
        match.match.start,
        match.match.actualStart,
        match.match.status,
        isOfficial,
        officialCheckedIn,
        officialMatchWindowOpen,
        matchFinished,
        showOfficialCheckInDialog,
    ) {
        while (
            isOfficial &&
            officialCheckedIn &&
            officialMatchWindowOpen &&
            !matchFinished &&
            !showOfficialCheckInDialog &&
            !match.match.isDelayedStatus() &&
            match.match.actualStart.isNullOrBlank() &&
            match.match.start != null
        ) {
            delayPromptNowMillis = Clock.System.now().toEpochMilliseconds()
            delay(1_000L)
        }
    }
    val canAdjustScore = showOfficialScoreControls &&
        !matchFinished &&
        officialCheckedIn &&
        !match.match.actualStart.isNullOrBlank() &&
        activeSegment?.status != "COMPLETE"
    val canIncrementScore = canAdjustScore &&
        canIncrementCurrentSegment(match.match, rules, event, currentSet)
    val isTimedMatch = rules.scoringModel == "POINTS_ONLY"
    val team1Score = matchDisplayScore(
        scoringModel = rules.scoringModel,
        segments = orderedSegments,
        teamId = match.match.team1Id,
        legacyScores = match.match.team1Points,
        currentSegmentIndex = currentSet,
    )
    val team2Score = matchDisplayScore(
        scoringModel = rules.scoringModel,
        segments = orderedSegments,
        teamId = match.match.team2Id,
        legacyScores = match.match.team2Points,
        currentSegmentIndex = currentSet,
    )
    val segmentBaseLabel = rules.segmentLabel.ifBlank {
        if (event?.usesSets == true) "Set" else "Total"
    }
    val showSegmentBreakdown = shouldShowMatchSegmentBreakdown(
        rules = rules,
        segments = orderedSegments,
        team1Scores = match.match.team1Points,
        team2Scores = match.match.team2Points,
    )
    val activeSegmentLabel = activeMatchSegmentLabel(
        segmentBaseLabel = segmentBaseLabel,
        currentSegmentIndex = currentSet,
        showSegmentBreakdown = showSegmentBreakdown,
    )
    val segmentTrackerEntries = remember(
        rules,
        segmentBaseLabel,
        orderedSegments,
        match.match.team1Id,
        match.match.team2Id,
        match.match.team1Points,
        match.match.team2Points,
        currentSet,
    ) {
        buildMatchSegmentTrackerEntries(
            rules = rules,
            segmentBaseLabel = segmentBaseLabel,
            segments = orderedSegments,
            team1Id = match.match.team1Id,
            team2Id = match.match.team2Id,
            team1Scores = match.match.team1Points,
            team2Scores = match.match.team2Points,
            currentSegmentIndex = currentSet,
        )
    }
    val canConfirmResult = showOfficialScoreControls &&
        officialCheckedIn &&
        !match.match.actualStart.isNullOrBlank() &&
        !matchFinished &&
        activeSegment?.status != "COMPLETE"
    val confirmResultEnabled = canConfirmResult &&
        !segmentConfirmSaving &&
        canConfirmCurrentSegment(match.match, rules, event, currentSet)
    val canStartMatch = showOfficialScoreControls &&
        officialCheckedIn &&
        officialMatchWindowOpen &&
        !matchFinished &&
        activeSegment?.status != "COMPLETE" &&
        activeSegment?.startedAt.isNullOrBlank()
    val canResetMatchTimer = showOfficialScoreControls &&
        officialCheckedIn &&
        officialMatchWindowOpen &&
        !matchFinished &&
        hasMatchClock &&
        activeSegment?.status != "COMPLETE" &&
        activeSegmentStartedAt != null
    val promptScoringIncident = shouldRequireScoringIncident(rules, event)
    val teamIncidentTypes = remember(rules) {
        incidentDialogTypes(rules = rules, teamScoped = true)
    }
    val teamAgnosticIncidentTypes = remember(rules) {
        incidentDialogTypes(rules = rules, teamScoped = false)
    }
    val showTeamIncidentButtons = teamIncidentTypes.isNotEmpty()
    val showTeamAgnosticIncidentButton = !showTeamIncidentButtons && teamAgnosticIncidentTypes.isNotEmpty()
    val screenBackgroundBrush = Brush.verticalGradient(
        colors = listOf(
            MaterialTheme.colorScheme.tertiaryContainer,
            MaterialTheme.colorScheme.primaryContainer,
        )
    )
    val guideController = LocalGuideController.current
    val officialGuideId = remember(event?.id, match.match.eventId, match.match.id) {
        EventGuideIds.matchOfficialPreCheckIn(
            eventId = event?.id ?: match.match.eventId,
            matchId = match.match.id,
        )
    }
    val officialGuide = remember(officialGuideId) {
        matchOfficialPreCheckInGuide(officialGuideId)
    }
    val officialGuideCompleted = guideController?.isGuideCompleted(officialGuideId) == true
    val shouldGateOfficialCheckInDialog =
        assignedTeamOfficialPendingCheckIn &&
            !officialGuideCompleted
    val hasMatchIdentityTarget = guideController?.hasTarget(EventGuideTargets.MatchIdentity) == true
    val hasOfficialAssignmentTarget =
        guideController?.hasTarget(EventGuideTargets.MatchOfficialAssignment) == true
    val hasMatchScoreControlsTarget =
        guideController?.hasTarget(EventGuideTargets.MatchScoreControls) == true
    val hasMatchResultControlsTarget =
        guideController?.hasTarget(EventGuideTargets.MatchResultControls) == true

    LaunchedEffect(
        guideController,
        officialGuideId,
        assignedTeamOfficialPendingCheckIn,
        officialGuideCompleted,
        showMap,
        hasMatchIdentityTarget,
        hasOfficialAssignmentTarget,
        hasMatchScoreControlsTarget,
        hasMatchResultControlsTarget,
    ) {
        val controller = guideController ?: return@LaunchedEffect
        if (!assignedTeamOfficialPendingCheckIn || officialGuideCompleted || showMap) return@LaunchedEffect

        controller.maybeStartGuide(
            guide = officialGuide,
            requiredTargetIds = setOf(
                EventGuideTargets.MatchIdentity,
                EventGuideTargets.MatchOfficialAssignment,
            ),
        )
    }

    fun openIncidentDialog(teamId: String?) {
        val resolvedTeamId = teamId?.trim()?.takeIf(String::isNotBlank)
        val options = incidentDialogTypes(rules = rules, teamScoped = resolvedTeamId != null)
        if (options.isEmpty()) return
        pendingIncidentTarget = MatchIncidentDialogTarget(eventTeamId = resolvedTeamId)
        incidentType = defaultIncidentDialogType(rules, options)
        incidentMinute = incidentClockInput
        incidentNote = ""
        incidentParticipantId = resolvedTeamId?.let { teamKey ->
            participantOptionsByTeam[teamKey]?.firstOrNull()?.selectionId
        }
    }

    val team1Text = remember(team1) { matchTeamDisplayLabel(team1, fallbackLabel = "Team 1") }
    val team2Text = remember(team2) { matchTeamDisplayLabel(team2, fallbackLabel = "Team 2") }

    val canUseMatchStatusActions = (canManageMatchActions || (isOfficial && officialCheckedIn && officialMatchWindowOpen)) &&
        !matchFinished
    val matchSuspended = match.match.status.equals("SUSPENDED", ignoreCase = true)
    val canUsePreStartMatchActions = canUseMatchStatusActions &&
        match.match.actualStart.isNullOrBlank() &&
        !matchSuspended
    val canSuspendMatch = canUseMatchStatusActions && !matchSuspended
    val canResumeMatch = canUseMatchStatusActions && matchSuspended

    if (showOfficialCheckInDialog && !shouldGateOfficialCheckInDialog) {
        val message = if (isOfficial) {
            stringResource(Res.string.official_checkin_message)
        } else {
            stringResource(Res.string.not_official_check_in_message)
        }
        AlertDialog(
            onDismissRequest = { },
            title = { Text(stringResource(Res.string.official_check_in_title)) },
            text = { Text(message) },
            confirmButton = {
                Button(
                    onClick = { component.confirmOfficialCheckIn() },
                    enabled = !officialCheckInSaving,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (officialCheckInSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        }
                        Text(
                            when {
                                officialCheckInSaving -> "Saving..."
                                isOfficial -> "Check in"
                                else -> "Officiate"
                            }
                        )
                    }
                }
            },
            dismissButton = {
                Button(
                    onClick = { component.dismissOfficialDialog() },
                    enabled = !officialCheckInSaving,
                ) {
                    Text("No")
                }
            }
        )
    }

    if (showTeamCheckInDialog) {
        val teamName = currentUserManagedMatchTeam?.team?.name?.takeIf(String::isNotBlank) ?: "your team"
        AlertDialog(
            onDismissRequest = {
                if (!teamCheckInSaving) {
                    component.dismissTeamCheckInDialog()
                }
            },
            title = { Text("Check in for match?") },
            text = { Text("Check in $teamName for this match.") },
            confirmButton = {
                Button(
                    onClick = { component.confirmTeamCheckIn() },
                    enabled = !teamCheckInSaving,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (teamCheckInSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        }
                        Text(if (teamCheckInSaving) "Saving..." else "Check in")
                    }
                }
            },
            dismissButton = {
                Button(
                    onClick = { component.dismissTeamCheckInDialog() },
                    enabled = !teamCheckInSaving,
                ) {
                    Text("Not now")
                }
            },
        )
    }

    val managedRosterTeamId = currentUserManagedMatchTeamId
    if (showMatchRosterDialog && managedRosterTeamId != null) {
        MatchRosterDialog(
            teamName = currentUserManagedMatchTeam?.team?.name?.takeIf(String::isNotBlank) ?: "Team",
            eventTeamId = managedRosterTeamId,
            roster = currentUserManagedMatchRoster,
            loading = matchRosterLoading,
            saving = matchRosterSaving,
            completed = matchFinished,
            allowTemporaryMatchPlayers = matchRosters?.allowTemporaryMatchPlayers == true,
            onRemovePlayer = { userId ->
                component.removeMatchRosterPlayer(managedRosterTeamId, userId)
            },
            onRestorePlayer = { userId ->
                component.restoreMatchRosterPlayer(managedRosterTeamId, userId)
            },
            onAddTemporaryPlayer = { firstName, lastName, email ->
                component.addTemporaryMatchRosterPlayer(
                    eventTeamId = managedRosterTeamId,
                    firstName = firstName,
                    lastName = lastName,
                    email = email,
                )
            },
            onLinkTemporaryPlayer = { entryId, email ->
                component.addTemporaryMatchRosterPlayer(
                    eventTeamId = managedRosterTeamId,
                    firstName = null,
                    lastName = null,
                    email = email,
                    entryId = entryId,
                )
            },
            onDismiss = component::dismissMatchRoster,
        )
    }

    if (showDelayPrompt) {
        AlertDialog(
            onDismissRequest = {
                presentedDelayPromptKey = delayPromptKey
                deniedDelayPromptKey = delayPromptKey
            },
            title = { Text("Mark match as delayed?") },
            text = { Text("This match is more than five minutes past its scheduled start time.") },
            confirmButton = {
                Button(
                    onClick = {
                        presentedDelayPromptKey = delayPromptKey
                        deniedDelayPromptKey = null
                        component.markMatchDelayed()
                    },
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
                        Text(if (matchTimeSaving) "Saving..." else "Yes")
                    }
                }
            },
            dismissButton = {
                Button(
                    onClick = {
                        presentedDelayPromptKey = delayPromptKey
                        deniedDelayPromptKey = delayPromptKey
                    },
                    enabled = !matchTimeSaving,
                ) {
                    Text("No")
                }
            },
        )
    }

    if (showForfeitTeamDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!matchActionSaving) {
                    showForfeitTeamDialog = false
                }
            },
            title = { Text("Forfeit match") },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Choose the team that is forfeiting this match.")
                    match.match.team1Id?.takeIf(String::isNotBlank)?.let { teamId ->
                        Button(
                            onClick = {
                                component.forfeitTeam(teamId)
                                showForfeitTeamDialog = false
                            },
                            enabled = !matchActionSaving,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = "Forfeit $team1Text",
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    match.match.team2Id?.takeIf(String::isNotBlank)?.let { teamId ->
                        Button(
                            onClick = {
                                component.forfeitTeam(teamId)
                                showForfeitTeamDialog = false
                            },
                            enabled = !matchActionSaving,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = "Forfeit $team2Text",
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                Button(
                    onClick = { showForfeitTeamDialog = false },
                    enabled = !matchActionSaving,
                ) {
                    Text("Cancel")
                }
            },
        )
    }

    pendingMatchAction?.let { actionTarget ->
        AlertDialog(
            onDismissRequest = {
                if (!matchActionSaving) {
                    pendingMatchAction = null
                }
            },
            title = { Text(actionTarget.title) },
            text = { Text(actionTarget.message) },
            confirmButton = {
                Button(
                    onClick = {
                        when (actionTarget.action) {
                            "FORFEIT" -> actionTarget.forfeitingEventTeamId?.let(component::forfeitTeam)
                            "CANCEL" -> component.cancelMatch()
                            "SUSPEND" -> component.suspendMatch()
                            "RESUME" -> component.resumeMatch()
                        }
                        pendingMatchAction = null
                    },
                    enabled = !matchActionSaving,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (matchActionSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        }
                        Text(if (matchActionSaving) "Saving..." else actionTarget.confirmLabel)
                    }
                }
            },
            dismissButton = {
                Button(
                    onClick = { pendingMatchAction = null },
                    enabled = !matchActionSaving,
                ) {
                    Text("No")
                }
            },
        )
    }

    if (pendingIncidentTarget != null) {
        val incidentOptions = incidentDialogTypes(
            rules = rules,
            teamScoped = pendingIncidentTarget?.eventTeamId != null,
        )
        val selectedIncidentType = incidentType.takeIf(String::isNotBlank)
            ?: incidentOptions.firstOrNull()
            ?: "NOTE"
        val selectedTypeIsScoring = isScoringIncidentType(selectedIncidentType)
        val requiresParticipant = selectedTypeIsScoring && rules.pointIncidentRequiresParticipant
        fun clearIncidentDialog() {
            pendingIncidentTarget = null
            incidentType = ""
            incidentParticipantId = null
            incidentMinute = ""
            incidentNote = ""
        }
        MatchIncidentEntryDialog(
            incidentOptions = incidentOptions,
            selectedIncidentType = selectedIncidentType,
            onIncidentTypeChange = { type -> incidentType = type },
            incidentLabel = { type -> incidentLabel(type) },
            teamScoped = pendingIncidentTarget?.eventTeamId != null,
            participantOptions = activeParticipantOptions,
            selectedParticipant = selectedParticipant,
            onParticipantSelected = { option -> incidentParticipantId = option?.selectionId },
            requiresParticipant = requiresParticipant,
            minute = incidentMinute,
            onMinuteChange = { value -> incidentMinute = value.filter { char -> char.isDigit() || char == '+' } },
            note = incidentNote,
            onNoteChange = { value -> incidentNote = value },
            onSave = {
                component.recordMatchIncident(
                    eventTeamId = pendingIncidentTarget?.eventTeamId,
                    incidentType = selectedIncidentType,
                    eventRegistrationId = selectedParticipant?.eventRegistrationId,
                    participantUserId = selectedParticipant?.participantUserId,
                    minute = incidentMinute.toIntOrNull(),
                    clockInput = incidentMinute,
                    note = incidentNote.takeIf(String::isNotBlank),
                )
                clearIncidentDialog()
            },
            onDismiss = { clearIncidentDialog() },
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(brush = screenBackgroundBrush),
    ) {
        if (useNativeMapOverlayTransition && nativeMapOverlayProgress > 0.001f) {
            NativeMapRevealOverlay(
                progress = nativeMapOverlayProgress,
                revealCenterInWindow = mapRevealCenter,
                modifier = Modifier.fillMaxSize(),
            ) {
                EventMap(
                    component = mapComponent,
                    onEventSelected = { },
                    onPlaceSelected = { },
                    canClickPOI = false,
                    focusedLocation = locationTarget.focusedLocation,
                    focusedEvent = null,
                    modifier = Modifier.fillMaxSize(),
                    onBackPressed = mapComponent::toggleMap,
                )
            }
        }
        CircularRevealUnderlay(
            isRevealed = showMap && !isWebLayout && !useNativeMapOverlayTransition,
            revealCenterInWindow = mapRevealCenter,
            modifier = Modifier.fillMaxSize(),
            backgroundContent = {
                if (!isWebLayout && !useNativeMapOverlayTransition) {
                    EventMap(
                        component = mapComponent,
                        onEventSelected = { },
                        onPlaceSelected = { },
                        canClickPOI = false,
                        focusedLocation = locationTarget.focusedLocation,
                        focusedEvent = null,
                        modifier = Modifier.fillMaxSize(),
                        onBackPressed = mapComponent::toggleMap,
                    )
                }
            },
            foregroundContent = {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .then(
                            if (useNativeMapOverlayTransition) {
                                Modifier
                            } else {
                                Modifier.background(brush = screenBackgroundBrush)
                            }
                        )
                ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = bottomDockBottomPadding + MatchDetailBottomDockContentReserve),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceEvenly
        ) {
                ScoreCard(
                    title = team1Text,
                    score = team1Score.toString(),
                onTap = {
                    if (promptScoringIncident) {
                        openIncidentDialog(match.match.team1Id)
                    } else {
                        component.updateScore(isTeam1 = true, increment = true)
                    }
                },
                onSwipeDecrease = {
                    component.updateScore(isTeam1 = true, increment = false)
                },
                enabled = canAdjustScore,
                tapEnabled = canIncrementScore,
                swipeEnabled = canAdjustScore,
                showControls = showOfficialScoreControls,
                addIncidentLabel = if (showTeamIncidentButtons) {
                    "Add Incident"
                } else {
                    null
                },
                onAddIncident = { openIncidentDialog(match.match.team1Id) },
                    modifier = Modifier
                        .weight(1f)
                        .guideTarget(EventGuideTargets.MatchScoreControls),
                )

                Row(
                    modifier = Modifier
                        .guideTarget(EventGuideTargets.MatchIdentity)
                        .background(
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(20.dp)
                    )
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text(
                    text = "Match: ${match.match.matchId}",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleLarge
                )
                activeSegmentLabel?.let { label ->
                    Text(
                        text = " | ",
                        color = MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.titleLarge
                    )
                    Text(
                        text = label,
                        color = MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.titleLarge
                    )
                }
            }

            if (hasMatchClock) {
                Column(
                    modifier = Modifier
                        .background(
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                            shape = RoundedCornerShape(16.dp),
                        )
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = activeSegmentLabel ?: segmentBaseLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = clockDisplay,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            regulationClockEnded -> MaterialTheme.colorScheme.error
                            clockInAddedTime -> MaterialTheme.colorScheme.tertiary
                            else -> MaterialTheme.colorScheme.onSurface
                        },
                    )
                    Text(
                        text = when {
                            activeTimerRunning -> "Running"
                            regulationClockEnded -> "Regulation time reached"
                            activeSegmentStartedAt != null -> "Stopped"
                            else -> "Ready"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (segmentTrackerEntries.isNotEmpty()) {
                MatchSegmentScoreTracker(
                    entries = segmentTrackerEntries,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

                if (showOfficialScoreControls) {
                    Row(
                        modifier = Modifier
                            .guideTarget(EventGuideTargets.MatchOfficialAssignment)
                            .guideTarget(EventGuideTargets.MatchResultControls),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                    if (canStartMatch) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Button(
                                onClick = { component.startMatch() },
                                enabled = !matchStartSaving,
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (matchStartSaving) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            strokeWidth = 2.dp,
                                            color = MaterialTheme.colorScheme.onPrimary,
                                        )
                                    }
                                    Text(
                                        if (activeSegment?.sequence == 1 && match.match.actualStart.isNullOrBlank()) {
                                            "Start Match"
                                        } else {
                                            "Start ${activeSegmentLabel ?: segmentBaseLabel}"
                                        }
                                    )
                                }
                            }
                            if (showSetDelayedButton) {
                                Button(
                                    onClick = { component.markMatchDelayed() },
                                    enabled = !matchTimeSaving,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = DelayedMatchTimeContainerColor,
                                        contentColor = DelayedMatchTimeContentColor,
                                        disabledContainerColor = DelayedMatchTimeContainerColor.copy(alpha = 0.6f),
                                        disabledContentColor = DelayedMatchTimeContentColor.copy(alpha = 0.7f),
                                    ),
                                ) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        if (matchTimeSaving) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(16.dp),
                                                strokeWidth = 2.dp,
                                                color = DelayedMatchTimeContentColor,
                                            )
                                        }
                                        Text(if (matchTimeSaving) "Saving..." else "Set as delayed")
                                    }
                                }
                            }
                        }
                    }
                    if (canResetMatchTimer) {
                        Button(
                            onClick = { component.resetMatchTimer() },
                            enabled = !matchStartSaving,
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (matchStartSaving) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                }
                                Text("Reset Timer")
                            }
                        }
                    }
                    Button(
                        onClick = { component.completeCurrentSet() },
                        enabled = confirmResultEnabled,
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (segmentConfirmSaving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                )
                            }
                            Text(
                                if (rules.scoringModel == "POINTS_ONLY") {
                                    "Save Match"
                                } else {
                                    "Confirm ${activeSegmentLabel ?: segmentBaseLabel}"
                                }
                            )
                        }
                    }
                }
                if (showTeamAgnosticIncidentButton) {
                    Button(
                        onClick = { openIncidentDialog(null) },
                        enabled = canConfirmResult,
                    ) {
                        Text("Add Incident")
                    }
                }
            }

            ScoreCard(
                title = team2Text,
                score = team2Score.toString(),
                modifier = Modifier
                    .weight(1f),
                onTap = {
                    if (promptScoringIncident) {
                        openIncidentDialog(match.match.team2Id)
                    } else {
                        component.updateScore(isTeam1 = false, increment = true)
                    }
                },
                onSwipeDecrease = {
                    component.updateScore(isTeam1 = false, increment = false)
                },
                enabled = canAdjustScore,
                tapEnabled = canIncrementScore,
                swipeEnabled = canAdjustScore,
                showControls = showOfficialScoreControls,
                addIncidentLabel = if (showTeamIncidentButtons) {
                    "Add Incident"
                } else {
                    null
                },
                onAddIncident = { openIncidentDialog(match.match.team2Id) },
            )
        }

        if (showScoreGestureHint && showOfficialScoreControls && canAdjustScore) {
            ScoreGestureInstructionOverlay(
                onDismiss = { showScoreGestureHint = false },
                modifier = Modifier.fillMaxSize(),
            )
        }

        if (!showMap) {
            Box(
                modifier = Modifier
                    .padding(top = 64.dp, start = 16.dp)
                    .align(Alignment.TopStart)
            ) {
                IconButton(
                    onClick = onBackClick,
                    modifier = Modifier.background(
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
                        shape = CircleShape,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, bottom = bottomDockBottomPadding),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (isWebLayout) {
                AnimatedVisibility(
                    visible = showMap,
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(280.dp)
                    ) {
                        EventMap(
                            component = mapComponent,
                            onEventSelected = { },
                            onPlaceSelected = { },
                            canClickPOI = false,
                            focusedLocation = locationTarget.focusedLocation,
                            focusedEvent = null,
                            modifier = Modifier.fillMaxSize(),
                            onBackPressed = null,
                        )
                    }
                }
            }

            ExpandedMatchDetailsPanel(
                visible = showMatchDetails,
                match = match.match,
                team1 = team1,
                team2 = team2,
                showSegmentBreakdown = showSegmentBreakdown,
                orderedSegments = orderedSegments,
                segmentBaseLabel = segmentBaseLabel,
                officialRows = officialRows,
                visibleIncidents = visibleIncidents,
                isOfficial = isOfficial,
                officialCheckedIn = officialCheckedIn,
                editingActualTimes = editingActualTimes,
                actualStartDraft = actualStartDraft,
                actualEndDraft = actualEndDraft,
                actualTimeError = actualTimeError,
                matchTimeSaving = matchTimeSaving,
                canEditRoster = canEditMatchRoster,
                onEditRoster = component::openMatchRoster,
                showMatchTeamCheckIns = matchCheckInEnabled,
                team1Name = team1Text,
                team1CheckedIn = match.match.team1Id
                    ?.let { teamId -> matchTeamCheckIns[teamId]?.status?.equals("CHECKED_IN", ignoreCase = true) == true }
                    == true,
                team2Name = team2Text,
                team2CheckedIn = match.match.team2Id
                    ?.let { teamId -> matchTeamCheckIns[teamId]?.status?.equals("CHECKED_IN", ignoreCase = true) == true }
                    == true,
                canUseMatchStatusActions = canUseMatchStatusActions,
                canUsePreStartMatchActions = canUsePreStartMatchActions &&
                    !match.match.team1Id.isNullOrBlank() &&
                    !match.match.team2Id.isNullOrBlank(),
                canSuspendMatch = canSuspendMatch,
                canResumeMatch = canResumeMatch,
                matchActionSaving = matchActionSaving,
                onForfeitClick = { showForfeitTeamDialog = true },
                onCancelMatchClick = {
                    pendingMatchAction = MatchActionDialogTarget(
                        action = "CANCEL",
                        title = "Cancel match?",
                        message = "This match will be cancelled and no winner will be recorded.",
                        confirmLabel = "Cancel match",
                    )
                },
                onSuspendMatchClick = {
                    pendingMatchAction = MatchActionDialogTarget(
                        action = "SUSPEND",
                        title = "Suspend match?",
                        message = "This match will be suspended and can be resumed later.",
                        confirmLabel = "Suspend",
                    )
                },
                onResumeMatchClick = {
                    pendingMatchAction = MatchActionDialogTarget(
                        action = "RESUME",
                        title = "Resume match?",
                        message = "This match will be reopened from its suspended state.",
                        confirmLabel = "Resume",
                    )
                },
                onEditActualTimes = {
                    actualStartDraft = parseMatchInstant(match.match.actualStart)
                    actualEndDraft = parseMatchInstant(match.match.actualEnd)
                    actualTimeError = null
                    editingActualTimes = true
                },
                onActualStartSelected = { actualStartDraft = it },
                onActualEndSelected = { actualEndDraft = it },
                onActualStartCleared = { actualStartDraft = null },
                onActualEndCleared = { actualEndDraft = null },
                onCancelActualTimes = {
                    actualStartDraft = parseMatchInstant(match.match.actualStart)
                    actualEndDraft = parseMatchInstant(match.match.actualEnd)
                    actualTimeError = null
                    editingActualTimes = false
                },
                onSaveActualTimes = {
                    val startDraft = actualStartDraft
                    val endDraft = actualEndDraft
                    if (startDraft != null && endDraft != null && endDraft <= startDraft) {
                        actualTimeError = "Actual end time must be after the actual start time."
                    } else {
                        actualTimeError = null
                        component.updateActualTimes(startDraft, endDraft)
                        editingActualTimes = false
                    }
                },
                onSegmentSelected = component::selectSegment,
                incidentLabel = { type -> incidentLabel(type) },
                onRemoveIncident = component::removeMatchIncident,
            )

            MatchDetailBottomActions(
                fieldLocationLabel = fieldLocationLabel,
                showMatchDetails = showMatchDetails,
                warningDistanceMiles = locationTarget.warningDistanceMiles,
                onMapToggle = mapComponent::toggleMap,
                onMatchDetailsToggle = { showMatchDetails = !showMatchDetails },
                onMapButtonCenterChanged = { mapRevealCenter = it },
            )
        }
                }
            },
        )
    }
}

@Composable
private fun MatchDetailBottomActions(
    fieldLocationLabel: String,
    showMatchDetails: Boolean,
    warningDistanceMiles: Double?,
    onMapToggle: () -> Unit,
    onMatchDetailsToggle: () -> Unit,
    onMapButtonCenterChanged: (Offset) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        tonalElevation = 3.dp,
        shadowElevation = 6.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = onMapToggle,
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .widthIn(
                            min = MatchDetailCourtButtonMinWidth,
                            max = MatchDetailCourtButtonMaxWidth,
                        )
                        .height(MatchDetailActionButtonHeight)
                        .onGloballyPositioned {
                            onMapButtonCenterChanged(it.boundsInWindow().center)
                        },
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = fieldLocationLabel,
                            modifier = Modifier.weight(1f, fill = false),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Default.Place,
                            contentDescription = "Show field on map",
                        )
                    }
                }
                Button(
                    onClick = onMatchDetailsToggle,
                    modifier = Modifier
                        .width(MatchDetailDetailsButtonWidth)
                        .height(MatchDetailActionButtonHeight),
                ) {
                    Text(
                        text = if (showMatchDetails) "Hide Details" else "Match Details",
                        maxLines = 1,
                    )
                }
            }
            warningDistanceMiles?.let { distance ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = "Field differs from event location",
                        tint = MaterialTheme.colorScheme.error,
                    )
                    Text(
                        text = "${roundMiles(distance)} mi from event",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun NativeMapRevealOverlay(
    progress: Float,
    revealCenterInWindow: Offset,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    var overlayTopLeft by remember { mutableStateOf(Offset.Zero) }
    var overlaySize by remember { mutableStateOf(Size.Zero) }
    val transformOrigin = remember(revealCenterInWindow, overlayTopLeft, overlaySize) {
        resolveTransformOrigin(
            revealCenterInWindow = revealCenterInWindow,
            containerTopLeftInWindow = overlayTopLeft,
            containerSize = overlaySize,
        )
    }

    Box(
        modifier = modifier
            .onGloballyPositioned { coordinates ->
                val bounds = coordinates.boundsInWindow()
                overlayTopLeft = bounds.topLeft
                overlaySize = bounds.size
            }
            .graphicsLayer {
                alpha = progress
                scaleX = 0.9f + (0.1f * progress)
                scaleY = 0.9f + (0.1f * progress)
                this.transformOrigin = transformOrigin
            },
        content = content,
    )
}

@Composable
fun ScoreCard(
    title: String,
    score: String,
    onTap: () -> Unit,
    onSwipeDecrease: () -> Unit,
    enabled: Boolean,
    tapEnabled: Boolean = enabled,
    swipeEnabled: Boolean = enabled,
    showControls: Boolean,
    addIncidentLabel: String? = null,
    onAddIncident: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val interactionModifier = if (showControls) {
        Modifier
            .semantics(mergeDescendants = true) {
                contentDescription = "$title score $score. Tap to increase. Swipe to decrease."
            }
            .pointerInput(swipeEnabled, onSwipeDecrease) {
                if (swipeEnabled) {
                    detectDragGestures(
                        onDrag = { change, _ -> change.consume() },
                        onDragEnd = onSwipeDecrease,
                    )
                }
            }
            .clickable(
                enabled = tapEnabled,
                onClick = onTap,
            )
    } else {
        Modifier
    }

    if (!showControls) {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )

            Text(
                text = score,
                style = MaterialTheme.typography.displayLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 64.sp
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .then(interactionModifier),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        Text(
            text = score,
            style = MaterialTheme.typography.displayLarge,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 64.sp,
        )
        if (addIncidentLabel != null && onAddIncident != null) {
            Button(
                onClick = onAddIncident,
                enabled = enabled,
            ) {
                Text(addIncidentLabel)
            }
        }
    }
}

@Composable
internal fun ScoreGestureInstructionOverlay(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.65f))
            .clickable(onClick = onDismiss),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "Click to increase",
                color = Color.White,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Text(
                text = "Swipe to decrease",
                color = Color.White,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

@Composable
internal fun MatchSegmentScoreTracker(
    entries: List<MatchSegmentTrackerEntry>,
    modifier: Modifier = Modifier,
) {
    if (entries.isEmpty()) {
        return
    }
    Box(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier.wrapContentWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            entries.forEach { entry ->
                val containerColor = when {
                    entry.isActive -> MaterialTheme.colorScheme.primaryContainer
                    entry.isComplete -> MaterialTheme.colorScheme.secondaryContainer
                    else -> MaterialTheme.colorScheme.surfaceVariant
                }
                val contentColor = when {
                    entry.isActive -> MaterialTheme.colorScheme.onPrimaryContainer
                    entry.isComplete -> MaterialTheme.colorScheme.onSecondaryContainer
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }
                Surface(
                    color = containerColor,
                    contentColor = contentColor,
                    shape = RoundedCornerShape(18.dp),
                    tonalElevation = if (entry.isActive) 2.dp else 0.dp,
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = entry.label,
                            style = MaterialTheme.typography.labelSmall,
                        )
                        Text(
                            text = "${entry.team1Score}-${entry.team2Score}",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

private fun matchRosterEntryName(entry: MatchRosterEntryDto): String =
    listOfNotNull(entry.firstName, entry.lastName)
        .joinToString(" ")
        .trim()
        .takeIf(String::isNotBlank)
        ?: entry.userName?.trim()?.takeIf(String::isNotBlank)
        ?: entry.email?.trim()?.takeIf(String::isNotBlank)
        ?: entry.userId?.trim()?.takeIf(String::isNotBlank)
        ?: "Temporary player"

@Composable
private fun MatchRosterDialog(
    teamName: String,
    eventTeamId: String,
    roster: MatchRosterDto?,
    loading: Boolean,
    saving: Boolean,
    completed: Boolean,
    allowTemporaryMatchPlayers: Boolean,
    onRemovePlayer: (String) -> Unit,
    onRestorePlayer: (String) -> Unit,
    onAddTemporaryPlayer: (String, String, String?) -> Unit,
    onLinkTemporaryPlayer: (String, String?) -> Unit,
    onDismiss: () -> Unit,
) {
    var firstName by remember(eventTeamId) { mutableStateOf("") }
    var lastName by remember(eventTeamId) { mutableStateOf("") }
    var email by remember(eventTeamId) { mutableStateOf("") }
    var linkEmailByEntryId by remember(eventTeamId) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val entries = roster?.entries.orEmpty()

    AlertDialog(
        onDismissRequest = {
            if (!saving) {
                onDismiss()
            }
        },
        title = { Text("$teamName match roster") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when {
                    loading -> Text("Loading roster...", style = MaterialTheme.typography.bodyMedium)
                    entries.isEmpty() -> Text("No roster entries found.", style = MaterialTheme.typography.bodyMedium)
                    else -> entries.forEach { entry ->
                        MatchRosterEntryRow(
                            entry = entry,
                            saving = saving,
                            completed = completed,
                            linkEmail = linkEmailByEntryId[entry.id.orEmpty()] ?: entry.email.orEmpty(),
                            onLinkEmailChange = { value ->
                                entry.id?.let { entryId ->
                                    linkEmailByEntryId = linkEmailByEntryId + (entryId to value)
                                }
                            },
                            onRemovePlayer = onRemovePlayer,
                            onRestorePlayer = onRestorePlayer,
                            onLinkTemporaryPlayer = { entryId, linkEmail ->
                                onLinkTemporaryPlayer(entryId, linkEmail.trim().takeIf(String::isNotBlank))
                            },
                        )
                    }
                }
                if (!completed && allowTemporaryMatchPlayers) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = "Add temporary player",
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                OutlinedTextField(
                                    value = firstName,
                                    onValueChange = { firstName = it },
                                    label = { Text("First") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(
                                    value = lastName,
                                    onValueChange = { lastName = it },
                                    label = { Text("Last") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            OutlinedTextField(
                                value = email,
                                onValueChange = { email = it },
                                label = { Text("Email") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Button(
                                onClick = {
                                    onAddTemporaryPlayer(
                                        firstName.trim(),
                                        lastName.trim(),
                                        email.trim().takeIf(String::isNotBlank),
                                    )
                                    firstName = ""
                                    lastName = ""
                                    email = ""
                                },
                                enabled = !saving && firstName.isNotBlank() && lastName.isNotBlank(),
                                modifier = Modifier.align(Alignment.End),
                            ) {
                                Text(if (saving) "Saving..." else "Add player")
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss, enabled = !saving) {
                Text("Close")
            }
        },
    )
}

@Composable
private fun MatchRosterEntryRow(
    entry: MatchRosterEntryDto,
    saving: Boolean,
    completed: Boolean,
    linkEmail: String,
    onLinkEmailChange: (String) -> Unit,
    onRemovePlayer: (String) -> Unit,
    onRestorePlayer: (String) -> Unit,
    onLinkTemporaryPlayer: (String, String) -> Unit,
) {
    val removed = entry.status?.equals("REMOVED", ignoreCase = true) == true
    val temporary = entry.source?.equals("TEMPORARY", ignoreCase = true) == true
    val entryUserId = entry.userId?.trim()?.takeIf(String::isNotBlank)
    val entryId = entry.id?.trim()?.takeIf(String::isNotBlank)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer { alpha = if (removed) 0.58f else 1f },
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = matchRosterEntryName(entry),
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (temporary) {
                            Text("Temporary", style = MaterialTheme.typography.labelSmall)
                        }
                        if (entry.noAccount == true) {
                            Text("No account", style = MaterialTheme.typography.labelSmall)
                        }
                        if (removed) {
                            Text("Removed", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                if (!completed && !temporary && entryUserId != null) {
                    Button(
                        onClick = {
                            if (removed) {
                                onRestorePlayer(entryUserId)
                            } else {
                                onRemovePlayer(entryUserId)
                            }
                        },
                        enabled = !saving,
                    ) {
                        Text(if (removed) "Add" else "Remove")
                    }
                }
            }
            if (temporary && entryUserId == null && entryId != null) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = linkEmail,
                        onValueChange = onLinkEmailChange,
                        label = { Text("Link email") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = { onLinkTemporaryPlayer(entryId, linkEmail) },
                        enabled = !saving && linkEmail.isNotBlank(),
                    ) {
                        Text("Link")
                    }
                }
            }
        }
    }
}

@Composable
internal fun MatchIncidentEntryDialog(
    incidentOptions: List<String>,
    selectedIncidentType: String,
    onIncidentTypeChange: (String) -> Unit,
    incidentLabel: (String) -> String = ::matchLogTypeLabel,
    teamScoped: Boolean,
    participantOptions: List<MatchParticipantOption>,
    selectedParticipant: MatchParticipantOption?,
    onParticipantSelected: (MatchParticipantOption?) -> Unit,
    requiresParticipant: Boolean,
    minute: String,
    onMinuteChange: (String) -> Unit,
    note: String,
    onNoteChange: (String) -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
) {
    val selectedTypeIsScoring = isScoringIncidentType(selectedIncidentType)
    val participantLabel = selectedParticipant?.label
        ?: if (participantOptions.isEmpty()) "No roster available" else ""
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Record incident") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (incidentOptions.size > 1) {
                    DropdownField(
                        modifier = Modifier.fillMaxWidth(),
                        value = incidentLabel(selectedIncidentType),
                        label = "Incident type",
                    ) { closeMenu ->
                        incidentOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(incidentLabel(option)) },
                                onClick = {
                                    onIncidentTypeChange(option)
                                    closeMenu()
                                },
                            )
                        }
                    }
                } else if (incidentOptions.size == 1) {
                    Text(
                        text = incidentLabel(selectedIncidentType),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
                if (teamScoped) {
                    DropdownField(
                        modifier = Modifier.fillMaxWidth(),
                        value = participantLabel,
                        label = if (requiresParticipant) "Player" else "Player (optional)",
                    ) { closeMenu ->
                        if (!requiresParticipant) {
                            DropdownMenuItem(
                                text = { Text("No player selected") },
                                onClick = {
                                    onParticipantSelected(null)
                                    closeMenu()
                                },
                            )
                        }
                        participantOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option.label) },
                                onClick = {
                                    onParticipantSelected(option)
                                    closeMenu()
                                },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = minute,
                    onValueChange = onMinuteChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Minute") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = onNoteChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Details") },
                    minLines = 2,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onSave,
                enabled = !requiresParticipant || selectedParticipant != null,
            ) {
                Text(if (selectedTypeIsScoring) "Save ${incidentLabel(selectedIncidentType)}" else "Save Incident")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

@Composable
internal fun MatchIncidentCard(
    summary: String,
    canRemove: Boolean,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        tonalElevation = 1.dp,
        shadowElevation = 1.dp,
    ) {
        Box(
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = summary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(
                    start = 12.dp,
                    top = 10.dp,
                    end = if (canRemove) 44.dp else 12.dp,
                    bottom = 10.dp,
                ),
            )
            if (canRemove) {
                IconButton(
                    onClick = onRemove,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(32.dp),
                ) {
                    Icon(
                        imageVector = MVPIcons.Remove24Px,
                        contentDescription = "Remove incident",
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}

private fun resolveLocationTarget(
    field: Field?,
    event: Event?,
    fallbackLocation: LatLng?,
    matchId: String,
): MatchLocationTarget {
    val fieldCoordinates = field.toLatLngOrNull()
    val eventCoordinates = event.toLatLngOrNull()
    val focusedLocation = fieldCoordinates ?: eventCoordinates ?: fallbackLocation ?: LatLng(0.0, 0.0)
    val warningDistance = if (fieldCoordinates != null && eventCoordinates != null) {
        calculateDistanceMiles(fieldCoordinates, eventCoordinates)
            .takeIf { it > FIELD_DISTANCE_WARNING_THRESHOLD_MILES }
    } else {
        null
    }

    val place = when {
        field != null && fieldCoordinates != null -> MVPPlace(
            name = field.name?.takeIf { it.isNotBlank() }
                ?: field.location?.takeIf { it.isNotBlank() }
                ?: "Field ${field.fieldNumber}",
            id = field.id.ifBlank { "match-field-$matchId" },
            coordinates = listOf(fieldCoordinates.longitude, fieldCoordinates.latitude),
        )

        eventCoordinates != null -> MVPPlace(
            name = event?.location?.takeIf { it.isNotBlank() }
                ?: event?.name?.takeIf { it.isNotBlank() }
                ?: "Event location",
            id = event?.id?.let { "event-location-$it" } ?: "event-location-$matchId",
            coordinates = listOf(eventCoordinates.longitude, eventCoordinates.latitude),
        )

        else -> null
    }

    return MatchLocationTarget(
        focusedLocation = focusedLocation,
        place = place,
        warningDistanceMiles = warningDistance,
    )
}

private fun resolveTransformOrigin(
    revealCenterInWindow: Offset,
    containerTopLeftInWindow: Offset,
    containerSize: Size,
): TransformOrigin {
    if (containerSize.width <= 0f || containerSize.height <= 0f) {
        return TransformOrigin.Center
    }

    val localCenter = if (revealCenterInWindow == Offset.Zero) {
        Offset(containerSize.width / 2f, containerSize.height / 2f)
    } else {
        Offset(
            x = (revealCenterInWindow.x - containerTopLeftInWindow.x)
                .coerceIn(0f, containerSize.width),
            y = (revealCenterInWindow.y - containerTopLeftInWindow.y)
                .coerceIn(0f, containerSize.height),
        )
    }

    return TransformOrigin(
        pivotFractionX = if (containerSize.width == 0f) 0.5f else localCenter.x / containerSize.width,
        pivotFractionY = if (containerSize.height == 0f) 0.5f else localCenter.y / containerSize.height,
    )
}

private fun Field?.toLatLngOrNull(): LatLng? {
    val lat = this?.lat
    val long = this?.long
    if (lat == null || long == null) return null
    if (!lat.isFinite() || !long.isFinite()) return null
    if (lat == 0.0 && long == 0.0) return null
    return LatLng(lat, long)
}

private fun Event?.toLatLngOrNull(): LatLng? {
    val event = this ?: return null
    val lat = event.lat
    val long = event.long
    if (!lat.isFinite() || !long.isFinite()) return null
    if (lat == 0.0 && long == 0.0) return null
    return LatLng(lat, long)
}

private fun calculateDistanceMiles(start: LatLng, end: LatLng): Double {
    val lat1 = start.latitude * PI / 180.0
    val lon1 = start.longitude * PI / 180.0
    val lat2 = end.latitude * PI / 180.0
    val lon2 = end.longitude * PI / 180.0

    val deltaLat = lat2 - lat1
    val deltaLon = lon2 - lon1

    val a = sin(deltaLat / 2).let { value -> value * value } +
        cos(lat1) * cos(lat2) *
        sin(deltaLon / 2).let { value -> value * value }
    val c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_MILES * c
}

private fun roundMiles(distanceMiles: Double): Double {
    return (distanceMiles * 10.0).roundToInt() / 10.0
}

private fun buildParticipantOptions(
    team: TeamWithRelations?,
    eventTeamId: String,
): List<MatchParticipantOption> {
    val playersById = team?.players.orEmpty().associateBy(UserData::id)
    val registrations = team?.team?.activePlayerRegistrations().orEmpty()
    if (registrations.isNotEmpty()) {
        return registrations.map { registration ->
            MatchParticipantOption(
                selectionId = registration.id,
                label = participantOptionLabel(playersById[registration.userId], registration),
                eventRegistrationId = registration.id,
                participantUserId = registration.userId,
            )
        }
    }

    return team?.players.orEmpty().map { player ->
        MatchParticipantOption(
            selectionId = player.id,
            label = participantOptionLabel(player, null),
            eventRegistrationId = null,
            participantUserId = player.id,
        )
    }.takeIf { it.isNotEmpty() }.orEmpty()
}

private fun participantOptionLabel(
    player: UserData?,
    registration: TeamPlayerRegistration?,
): String {
    val name = player?.fullName
        ?.takeIf(String::isNotBlank)
        ?: registration?.userId
        ?.takeIf(String::isNotBlank)
        ?: "Participant"
    val details = buildList {
        registration?.jerseyNumber?.takeIf(String::isNotBlank)?.let { jersey -> add("#$jersey") }
        registration?.position?.takeIf(String::isNotBlank)?.let(::add)
    }.joinToString(" ")
    return if (details.isBlank()) name else "$name ($details)"
}

private fun resolveIncidentParticipantLabel(
    participantUserId: String?,
    eventRegistrationId: String?,
    team: TeamWithRelations?,
): String? {
    val playersById = team?.players.orEmpty().associateBy(UserData::id)
    val registrationsById = team?.team?.activePlayerRegistrations().orEmpty().associateBy(TeamPlayerRegistration::id)
    val registration = eventRegistrationId?.let { registrationId -> registrationsById[registrationId] }
    val player = registration?.userId?.let { userId -> playersById[userId] }
        ?: participantUserId?.let { userId -> playersById[userId] }
    return if (player == null && registration == null) {
        null
    } else {
        participantOptionLabel(player, registration)
    }
}

private fun resolveScoringIncidentParticipantLabel(
    participantUserId: String?,
    eventRegistrationId: String?,
    team: TeamWithRelations?,
): String? {
    val playersById = team?.players.orEmpty().associateBy(UserData::id)
    val registrations = team?.team?.activePlayerRegistrations().orEmpty()
    val registration = eventRegistrationId?.let { registrationId ->
        registrations.firstOrNull { row -> row.id == registrationId }
    } ?: participantUserId?.let { userId ->
        registrations.firstOrNull { row -> row.userId == userId }
    }
    val player = registration?.userId?.let { userId -> playersById[userId] }
        ?: participantUserId?.let { userId -> playersById[userId] }
    val name = player?.fullName
        ?.takeIf(String::isNotBlank)
        ?: registration?.userId?.takeIf(String::isNotBlank)
        ?: participantUserId?.takeIf(String::isNotBlank)
        ?: return null
    val jersey = registration?.jerseyNumber?.trim()?.takeIf(String::isNotBlank)
    return if (jersey == null) name else "$name #$jersey"
}

private fun incidentTimeLabel(incident: com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP): String? =
    incident.clock?.trim()?.takeIf(String::isNotBlank)
        ?: incident.minute?.let { minute -> "$minute'" }

internal fun buildIncidentSummary(
    incident: com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP,
    team1: TeamWithRelations?,
    team2: TeamWithRelations?,
    incidentLabel: (String) -> String = ::matchLogTypeLabel,
): String {
    val teamLabel = when (incident.eventTeamId) {
        team1?.team?.id -> team1?.team?.name
        team2?.team?.id -> team2?.team?.name
        else -> null
    }
    if (isScoringIncidentType(incident.incidentType) || (incident.linkedPointDelta ?: 0) != 0) {
        val scoringParticipantLabel = when (incident.eventTeamId) {
            team1?.team?.id -> resolveScoringIncidentParticipantLabel(incident.participantUserId, incident.eventRegistrationId, team1)
            team2?.team?.id -> resolveScoringIncidentParticipantLabel(incident.participantUserId, incident.eventRegistrationId, team2)
            else -> null
        }
        return listOfNotNull(teamLabel, scoringParticipantLabel, incidentTimeLabel(incident))
            .joinToString(" | ")
            .ifBlank { incidentLabel(incident.incidentType) }
    }
    val participantLabel = when (incident.eventTeamId) {
        team1?.team?.id -> resolveIncidentParticipantLabel(incident.participantUserId, incident.eventRegistrationId, team1)
        team2?.team?.id -> resolveIncidentParticipantLabel(incident.participantUserId, incident.eventRegistrationId, team2)
        else -> null
    }
    val note = incident.note?.takeIf(String::isNotBlank)
    val pointDelta = incident.linkedPointDelta?.let { delta ->
        "point change ${if (delta > 0) "+" else ""}$delta"
    }
    val extras = listOfNotNull(teamLabel, participantLabel, incidentTimeLabel(incident), pointDelta, note)
    return if (extras.isEmpty()) {
        incidentLabel(incident.incidentType)
    } else {
        "${incidentLabel(incident.incidentType)}: ${extras.joinToString(" | ")}"
    }
}

private fun com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP.isPendingIncidentDelete(): Boolean =
    uploadStatus == "DELETE_PENDING" || uploadStatus == "DELETE_FAILED"
