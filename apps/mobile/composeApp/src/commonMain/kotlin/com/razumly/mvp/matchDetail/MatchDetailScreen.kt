@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
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
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getScreenWidth
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
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private const val WEB_LAYOUT_BREAKPOINT_DP = 600
private const val FIELD_DISTANCE_WARNING_THRESHOLD_MILES = 0.01
private const val EARTH_RADIUS_MILES = 3958.8

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

internal data class MatchParticipantOption(
    val selectionId: String,
    val label: String,
    val eventRegistrationId: String?,
    val participantUserId: String,
)

private data class MatchIncidentDialogTarget(
    val eventTeamId: String?,
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

private fun actualTimeLabel(value: String?): String {
    return parseMatchInstant(value)
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
): Int = listOf(
    rules.segmentCount,
    segments.size,
    team1Scores.size,
    team2Scores.size,
    1,
).max()

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
    val segmentConfirmSaving by component.segmentConfirmSaving.collectAsState()
    val showOfficialCheckInDialog by component.showOfficialCheckInDialog.collectAsState()
    val currentSet by component.currentSet.collectAsState()
    val matchFinished by component.matchFinished.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val currentLocation by mapComponent.currentLocation.collectAsState()
    val isWebLayout = getScreenWidth() >= WEB_LAYOUT_BREAKPOINT_DP
    val useNativeMapOverlayTransition = Platform.isIOS && !isWebLayout
    val showScoreControls = !isWebLayout
    val showOfficialScoreControls = showScoreControls && isOfficial
    val navBottomPadding = LocalNavBarPadding.current.calculateBottomPadding()
    val team1 = match.team1
    val team2 = match.team2
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
    val canAdjustScore = showOfficialScoreControls &&
        !matchFinished &&
        officialCheckedIn &&
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
        !matchFinished &&
        activeSegment?.status != "COMPLETE"
    val confirmResultEnabled = canConfirmResult &&
        !segmentConfirmSaving &&
        canConfirmCurrentSegment(match.match, rules, event, currentSet)
    val canStartMatch = showOfficialScoreControls &&
        officialCheckedIn &&
        !matchFinished &&
        match.match.actualStart.isNullOrBlank()
    val promptScoringIncident = shouldRequireScoringIncident(rules, event)
    val showScoreAdjustButtons = !promptScoringIncident
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

    fun openIncidentDialog(teamId: String?) {
        val resolvedTeamId = teamId?.trim()?.takeIf(String::isNotBlank)
        val options = incidentDialogTypes(rules = rules, teamScoped = resolvedTeamId != null)
        if (options.isEmpty()) return
        pendingIncidentTarget = MatchIncidentDialogTarget(eventTeamId = resolvedTeamId)
        incidentType = defaultIncidentDialogType(rules, options)
        incidentMinute = ""
        incidentNote = ""
        incidentParticipantId = resolvedTeamId?.let { teamKey ->
            participantOptionsByTeam[teamKey]?.firstOrNull()?.selectionId
        }
    }

    val team1Text = remember(team1) {
        derivedStateOf {
            when {
                team1?.team?.name != null -> team1.team.name
                team1?.players != null -> team1.players.joinToString(" & ") {
                    "${it.firstName}.${it.lastName.first()}"
                }

                else -> "Team 1"
            }
        }
    }.value

    val team2Text = remember(team2) {
        derivedStateOf {
            when {
                team2?.team?.name != null -> team2.team.name
                team2?.players != null -> team2.players.joinToString(" & ") {
                    "${it.firstName}.${it.lastName.first()}"
                }

                else -> "Team 2"
            }
        }
    }.value

    if (showOfficialCheckInDialog) {
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
            teamScoped = pendingIncidentTarget?.eventTeamId != null,
            participantOptions = activeParticipantOptions,
            selectedParticipant = selectedParticipant,
            onParticipantSelected = { option -> incidentParticipantId = option?.selectionId },
            requiresParticipant = requiresParticipant,
            minute = incidentMinute,
            onMinuteChange = { value -> incidentMinute = value.filter(Char::isDigit) },
            note = incidentNote,
            onNoteChange = { value -> incidentNote = value },
            onSave = {
                component.recordMatchIncident(
                    eventTeamId = pendingIncidentTarget?.eventTeamId,
                    incidentType = selectedIncidentType,
                    eventRegistrationId = selectedParticipant?.eventRegistrationId,
                    participantUserId = selectedParticipant?.participantUserId,
                    minute = incidentMinute.toIntOrNull(),
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
                .padding(bottom = navBottomPadding + 92.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceEvenly
        ) {
            ScoreCard(
                title = team1Text,
                score = team1Score.toString(),
                increase = {
                    if (promptScoringIncident) {
                        openIncidentDialog(match.match.team1Id)
                    } else {
                        component.updateScore(isTeam1 = true, increment = true)
                    }
                },
                decrease = {
                    component.updateScore(isTeam1 = true, increment = false)
                },
                enabled = canAdjustScore,
                decreaseEnabled = canAdjustScore,
                increaseEnabled = canIncrementScore,
                showControls = showOfficialScoreControls,
                showAdjustControls = showScoreAdjustButtons,
                addIncidentLabel = if (showTeamIncidentButtons) {
                    "Add Incident"
                } else {
                    null
                },
                onAddIncident = { openIncidentDialog(match.match.team1Id) },
                modifier = Modifier.weight(1f),
            )

            Row(
                modifier = Modifier
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

            if (segmentTrackerEntries.isNotEmpty()) {
                MatchSegmentScoreTracker(
                    entries = segmentTrackerEntries,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (showOfficialScoreControls) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (canStartMatch) {
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
                                Text("Start Match")
                            }
                        }
                    }
                    Button(
                        onClick = { component.confirmSet() },
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
                increase = {
                    if (promptScoringIncident) {
                        openIncidentDialog(match.match.team2Id)
                    } else {
                        component.updateScore(isTeam1 = false, increment = true)
                    }
                },
                decrease = {
                    component.updateScore(isTeam1 = false, increment = false)
                },
                enabled = canAdjustScore,
                decreaseEnabled = canAdjustScore,
                increaseEnabled = canIncrementScore,
                showControls = showOfficialScoreControls,
                showAdjustControls = showScoreAdjustButtons,
                addIncidentLabel = if (showTeamIncidentButtons) {
                    "Add Incident"
                } else {
                    null
                },
                onAddIncident = { openIncidentDialog(match.match.team2Id) },
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, bottom = navBottomPadding + 12.dp),
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

            AnimatedVisibility(
                visible = showMatchDetails,
                enter = expandVertically(),
                exit = shrinkVertically(),
                modifier = Modifier.fillMaxWidth()
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
                        if (shouldShowMatchStatusBlock(match.match)) {
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = "Status",
                                    style = MaterialTheme.typography.titleSmall,
                                )
                                Text(
                                    text = titleCaseMatchValue(
                                        match.match.resultStatus ?: match.match.status ?: "Pending",
                                    ).ifBlank { "Pending" },
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                match.match.resultType
                                    ?.let(::titleCaseMatchValue)
                                    ?.takeIf(String::isNotBlank)
                                    ?.let { result ->
                                        Text(
                                            text = "Result: $result",
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                match.match.statusReason
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
                                    TextButton(onClick = {
                                        actualStartDraft = parseMatchInstant(match.match.actualStart)
                                        actualEndDraft = parseMatchInstant(match.match.actualEnd)
                                        actualTimeError = null
                                        editingActualTimes = true
                                    }) {
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
                                    onTimeSelected = { actualStartDraft = it },
                                    onTimeCleared = { actualStartDraft = null },
                                )
                                MatchActualTimeField(
                                    label = "Actual end",
                                    selectedTime = actualEndDraft,
                                    onTimeSelected = { actualEndDraft = it },
                                    onTimeCleared = { actualEndDraft = null },
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.End,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    TextButton(
                                        onClick = {
                                            actualStartDraft = parseMatchInstant(match.match.actualStart)
                                            actualEndDraft = parseMatchInstant(match.match.actualEnd)
                                            actualTimeError = null
                                            editingActualTimes = false
                                        },
                                        enabled = !matchTimeSaving,
                                    ) {
                                        Text("Cancel")
                                    }
                                    Button(
                                        onClick = {
                                            if (actualStartDraft != null && actualEndDraft != null && actualEndDraft!! <= actualStartDraft!!) {
                                                actualTimeError = "Actual end time must be after the actual start time."
                                                return@Button
                                            }
                                            actualTimeError = null
                                            component.updateActualTimes(actualStartDraft, actualEndDraft)
                                            editingActualTimes = false
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
                                            Text("Save Times")
                                        }
                                    }
                                }
                            } else {
                                Text(
                                    text = "Start: ${actualTimeLabel(match.match.actualStart)}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                Text(
                                    text = "End: ${actualTimeLabel(match.match.actualEnd)}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                        if (showSegmentBreakdown) {
                            MatchSegmentTable(
                                segments = orderedSegments,
                                segmentLabel = segmentBaseLabel,
                                team1Id = match.match.team1Id,
                                team2Id = match.match.team2Id,
                                team1Scores = match.match.team1Points,
                                team2Scores = match.match.team2Points,
                                onSegmentSelected = component::selectSegment,
                            )
                        }
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
                        Text(
                            text = "Match Log",
                            style = MaterialTheme.typography.titleSmall,
                        )
                        if (visibleIncidents.isEmpty()) {
                            Text("No match details recorded.", style = MaterialTheme.typography.bodySmall)
                        } else {
                            visibleIncidents.sortedBy { incident -> incident.sequence }.forEach { incident ->
                                MatchIncidentCard(
                                    summary = buildIncidentSummary(
                                        incident = incident,
                                        team1 = team1,
                                        team2 = team2,
                                    ),
                                    canRemove = isOfficial && officialCheckedIn,
                                    onRemove = { component.removeMatchIncident(incident.id) },
                                )
                            }
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                tonalElevation = 3.dp,
                shadowElevation = 6.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = mapComponent::toggleMap,
                        modifier = Modifier.onGloballyPositioned {
                            mapRevealCenter = it.boundsInWindow().center
                        }
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(fieldLocationLabel)
                            Icon(
                                imageVector = Icons.Default.Place,
                                contentDescription = "Show field on map",
                            )
                        }
                    }
                    Button(
                        onClick = { showMatchDetails = !showMatchDetails },
                        modifier = Modifier.padding(start = 8.dp),
                    ) {
                        Text(if (showMatchDetails) "Hide Match Details" else "Match Details")
                    }
                    locationTarget.warningDistanceMiles?.let { distance ->
                        Row(
                            modifier = Modifier.padding(start = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = "Field differs from event location",
                                tint = MaterialTheme.colorScheme.error
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
                }
            },
        )
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
private fun MatchSegmentTable(
    segments: List<MatchSegmentMVP>,
    segmentLabel: String,
    team1Id: String?,
    team2Id: String?,
    team1Scores: List<Int>,
    team2Scores: List<Int>,
    onSegmentSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (segments.isEmpty()) return

    val scrollState = rememberScrollState()
    val dividerColor = MaterialTheme.colorScheme.outlineVariant

    Column(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(scrollState),
    ) {
        MatchSegmentTableRow(
            label = segmentLabel,
            values = segments.map { segment -> segment.sequence.toString() },
            highlightedColumns = segments.map { segment -> segment.isStarted },
            dividerColor = dividerColor,
            valueFontWeight = FontWeight.SemiBold,
            onSegmentSelected = onSegmentSelected,
        )
        HorizontalDivider(color = dividerColor)
        MatchSegmentTableRow(
            label = "Home",
            values = segments.mapIndexed { index, segment ->
                segmentScore(
                    segment = segment,
                    teamId = team1Id,
                    fallbackScores = team1Scores,
                    index = index,
                ).toString()
            },
            highlightedColumns = segments.map { segment -> segment.isStarted },
            dividerColor = dividerColor,
            onSegmentSelected = onSegmentSelected,
        )
        HorizontalDivider(color = dividerColor)
        MatchSegmentTableRow(
            label = "Away",
            values = segments.mapIndexed { index, segment ->
                segmentScore(
                    segment = segment,
                    teamId = team2Id,
                    fallbackScores = team2Scores,
                    index = index,
                ).toString()
            },
            highlightedColumns = segments.map { segment -> segment.isStarted },
            dividerColor = dividerColor,
            onSegmentSelected = onSegmentSelected,
        )
    }
}

@Composable
private fun MatchSegmentTableRow(
    label: String,
    values: List<String>,
    highlightedColumns: List<Boolean>,
    dividerColor: androidx.compose.ui.graphics.Color,
    valueFontWeight: FontWeight = FontWeight.Normal,
    onSegmentSelected: (Int) -> Unit,
) {
    Row(modifier = Modifier.height(IntrinsicSize.Min)) {
        MatchSegmentCell(
            text = label,
            modifier = Modifier.width(88.dp),
            textAlign = TextAlign.Start,
            fontWeight = FontWeight.SemiBold,
        )
        values.forEachIndexed { index, value ->
            VerticalDivider(
                modifier = Modifier.fillMaxHeight(),
                color = dividerColor,
            )
            MatchSegmentCell(
                text = value,
                modifier = Modifier
                    .width(72.dp)
                    .clickable { onSegmentSelected(index) },
                highlighted = highlightedColumns.getOrElse(index) { false },
                textAlign = TextAlign.Center,
                fontWeight = valueFontWeight,
            )
        }
    }
}

@Composable
private fun MatchSegmentCell(
    text: String,
    modifier: Modifier,
    highlighted: Boolean = false,
    textAlign: TextAlign = TextAlign.Start,
    fontWeight: FontWeight = FontWeight.Normal,
) {
    val backgroundColor = if (highlighted) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
    } else {
        androidx.compose.ui.graphics.Color.Transparent
    }
    val textColor = if (highlighted) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    Box(
        modifier = modifier
            .background(backgroundColor)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        contentAlignment = if (textAlign == TextAlign.Start) Alignment.CenterStart else Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = textColor,
            fontWeight = fontWeight,
            textAlign = textAlign,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

private val MatchSegmentMVP.isStarted: Boolean
    get() = status.equals("IN_PROGRESS", ignoreCase = true) ||
        status.equals("STARTED", ignoreCase = true)

private fun segmentScore(
    segment: MatchSegmentMVP?,
    teamId: String?,
    fallbackScores: List<Int>,
    index: Int,
): Int = teamId
    ?.let { resolvedTeamId -> segment?.scores?.get(resolvedTeamId) }
    ?: fallbackScores.getOrElse(index) { 0 }

@Composable
fun ScoreCard(
    title: String,
    score: String,
    decrease: () -> Unit,
    increase: () -> Unit,
    enabled: Boolean,
    decreaseEnabled: Boolean = enabled,
    increaseEnabled: Boolean = enabled,
    showControls: Boolean,
    showAdjustControls: Boolean = true,
    addIncidentLabel: String? = null,
    onAddIncident: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
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

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showAdjustControls) {
            Box(
                modifier = Modifier
                .wrapContentSize()
                .clickable(
                    enabled = decreaseEnabled,
                    onClick = decrease,
                )
            ) {
                Icon(
                    imageVector = MVPIcons.Remove24Px,
                    contentDescription = "Decrease score",
                    modifier = Modifier
                        .size(48.dp),
                    tint = MaterialTheme.colorScheme.onSurface.copy(
                        alpha = if (decreaseEnabled) 1f else 0.38f,
                    ),
                )
            }
        } else {
            Box(modifier = Modifier.size(48.dp))
        }

        Column(
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
            if (addIncidentLabel != null && onAddIncident != null) {
                Button(
                    onClick = onAddIncident,
                    enabled = enabled,
                ) {
                    Text(addIncidentLabel)
                }
            }
        }

        if (showAdjustControls) {
            Box(
                modifier = Modifier
                .wrapContentSize()
                .clickable(enabled = increaseEnabled, onClick = increase)
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Increase score",
                    modifier = Modifier
                        .size(48.dp),
                    tint = MaterialTheme.colorScheme.onSurface.copy(
                        alpha = if (increaseEnabled) 1f else 0.38f,
                    ),
                )
            }
        } else {
            Box(modifier = Modifier.size(48.dp))
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

@Composable
internal fun MatchIncidentEntryDialog(
    incidentOptions: List<String>,
    selectedIncidentType: String,
    onIncidentTypeChange: (String) -> Unit,
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
                        value = matchLogTypeLabel(selectedIncidentType),
                        label = "Incident type",
                    ) { closeMenu ->
                        incidentOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(matchLogTypeLabel(option)) },
                                onClick = {
                                    onIncidentTypeChange(option)
                                    closeMenu()
                                },
                            )
                        }
                    }
                } else if (incidentOptions.size == 1) {
                    Text(
                        text = matchLogTypeLabel(selectedIncidentType),
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
                Text(if (selectedTypeIsScoring) "Save ${matchLogTypeLabel(selectedIncidentType)}" else "Save Incident")
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

internal fun buildIncidentSummary(
    incident: com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP,
    team1: TeamWithRelations?,
    team2: TeamWithRelations?,
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
        val minuteLabel = incident.minute?.let { minute -> "$minute'" }
        return listOfNotNull(teamLabel, scoringParticipantLabel, minuteLabel)
            .joinToString(" | ")
            .ifBlank { matchLogTypeLabel(incident.incidentType) }
    }
    val participantLabel = when (incident.eventTeamId) {
        team1?.team?.id -> resolveIncidentParticipantLabel(incident.participantUserId, incident.eventRegistrationId, team1)
        team2?.team?.id -> resolveIncidentParticipantLabel(incident.participantUserId, incident.eventRegistrationId, team2)
        else -> null
    }
    val minuteLabel = incident.minute?.let { minute -> "$minute'" }
    val note = incident.note?.takeIf(String::isNotBlank)
    val pointDelta = incident.linkedPointDelta?.let { delta ->
        "point change ${if (delta > 0) "+" else ""}$delta"
    }
    val extras = listOfNotNull(teamLabel, participantLabel, minuteLabel, pointDelta, note)
    return if (extras.isEmpty()) {
        matchLogTypeLabel(incident.incidentType)
    } else {
        "${matchLogTypeLabel(incident.incidentType)}: ${extras.joinToString(" | ")}"
    }
}

private fun com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP.isPendingIncidentDelete(): Boolean =
    uploadStatus == "DELETE_PENDING" || uploadStatus == "DELETE_FAILED"
