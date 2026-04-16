package com.razumly.mvp.matchDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.util.CircularRevealUnderlay
import com.razumly.mvp.core.presentation.util.getScreenWidth
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.eventMap.MapComponent
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.Remove24Px
import dev.icerock.moko.geo.LatLng
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.confirm_set_result_message
import mvp.composeapp.generated.resources.confirm_set_result_title
import mvp.composeapp.generated.resources.not_official_check_in_message
import mvp.composeapp.generated.resources.official_check_in_title
import mvp.composeapp.generated.resources.official_checkin_message
import mvp.composeapp.generated.resources.set_number
import org.jetbrains.compose.resources.stringResource
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

private const val WEB_LAYOUT_BREAKPOINT_DP = 600
private const val FIELD_DISTANCE_WARNING_THRESHOLD_MILES = 0.01
private const val EARTH_RADIUS_MILES = 3958.8

private fun matchLogTypeLabel(type: String): String = when (type.trim().uppercase()) {
    "POINT" -> "Scoring detail"
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

@Composable
fun MatchDetailScreen(
    component: MatchContentComponent,
    mapComponent: MapComponent,
) {
    val match by component.matchWithTeams.collectAsState()
    val event by component.event.collectAsState()
    val isOfficial by component.isOfficial.collectAsState()
    val officialCheckedIn by component.officialCheckedIn.collectAsState()
    val showOfficialCheckInDialog by component.showOfficialCheckInDialog.collectAsState()
    val showSetConfirmDialog by component.showSetConfirmDialog.collectAsState()
    val currentSet by component.currentSet.collectAsState()
    val matchFinished by component.matchFinished.collectAsState()
    val showMap by mapComponent.showMap.collectAsState()
    val currentLocation by mapComponent.currentLocation.collectAsState()
    val isWebLayout = getScreenWidth() >= WEB_LAYOUT_BREAKPOINT_DP
    val showScoreControls = !isWebLayout
    val showOfficialScoreControls = showScoreControls && isOfficial
    val navBottomPadding = LocalNavBarPadding.current.calculateBottomPadding()
    val team1 = match.team1
    val team2 = match.team2

    var mapRevealCenter by remember { mutableStateOf(Offset.Zero) }
    var showMatchDetails by remember { mutableStateOf(false) }
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

    val canIncrement = showOfficialScoreControls && !matchFinished && officialCheckedIn
    val isTimedMatch = event?.usesSets == false
    val orderedSegments = remember(match.match.segments) {
        match.match.segments.sortedBy { segment -> segment.sequence }
    }
    val activeSegment = orderedSegments.getOrNull(currentSet)
    val team1Score = activeSegment?.scores?.get(match.match.team1Id)
        ?: match.match.team1Points.getOrElse(currentSet) { 0 }
    val team2Score = activeSegment?.scores?.get(match.match.team2Id)
        ?: match.match.team2Points.getOrElse(currentSet) { 0 }
    val rules = match.match.matchRulesSnapshot ?: match.match.resolvedMatchRules
    val segmentBaseLabel = rules?.segmentLabel ?: if (event?.usesSets == true) "Set" else "Total"
    val activeSegmentLabel = if (rules?.scoringModel == "POINTS_ONLY") {
        segmentBaseLabel
    } else {
        "$segmentBaseLabel ${currentSet + 1}"
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
                Button(onClick = { component.confirmOfficialCheckIn() }) {
                    Text("Yes")
                }
            },
            dismissButton = {
                Button(onClick = { component.dismissOfficialDialog() }) {
                    Text("No")
                }
            }
        )
    }

    if (showScoreControls && showSetConfirmDialog) {
        AlertDialog(
            onDismissRequest = { },
            title = { Text(stringResource(Res.string.confirm_set_result_title)) },
            text = { Text(stringResource(Res.string.confirm_set_result_message, currentSet + 1)) },
            confirmButton = {
                Button(onClick = { component.confirmSet() }) {
                    Text("Confirm")
                }
            },
            dismissButton = {
                Button(onClick = { component.dismissSetDialog() }) {
                    Text("Cancel")
                }
            }
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.tertiaryContainer,
                        MaterialTheme.colorScheme.primaryContainer,
                    )
                )
            ),
    ) {
        CircularRevealUnderlay(
            isRevealed = showMap && !isWebLayout,
            revealCenterInWindow = mapRevealCenter,
            modifier = Modifier.fillMaxSize(),
            backgroundContent = {
                if (!isWebLayout) {
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
                Box(modifier = Modifier.fillMaxSize()) {
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
                    component.updateScore(isTeam1 = true, increment = true)
                },
                decrease = {
                    component.updateScore(isTeam1 = true, increment = false)
                },
                enabled = canIncrement,
                showControls = showOfficialScoreControls,
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
                Text(
                    text = " | ",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleLarge
                )
                Text(
                    text = activeSegmentLabel,
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleLarge
                )
            }

            if (isTimedMatch && showOfficialScoreControls) {
                Button(
                    onClick = { component.requestSetConfirmation() },
                    enabled = canIncrement && team1Score != team2Score,
                ) {
                    Text("Save Match")
                }
            }

            ScoreCard(
                title = team2Text,
                score = team2Score.toString(),
                modifier = Modifier
                    .weight(1f),
                increase = {
                    component.updateScore(isTeam1 = false, increment = true)
                },
                decrease = {
                    component.updateScore(isTeam1 = false, increment = false)
                },
                enabled = canIncrement,
                showControls = showOfficialScoreControls,
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
                        Text(
                            text = "Status: ${match.match.status ?: "SCHEDULED"}${match.match.statusReason?.let { " - $it" } ?: ""}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            text = "Rules: ${rules?.scoringModel ?: if (event?.usesSets == true) "SETS" else "POINTS_ONLY"}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            orderedSegments.forEachIndexed { index, segment ->
                                Button(
                                    onClick = { component.selectSegment(index) },
                                    enabled = index != currentSet,
                                ) {
                                    Text(
                                        if (rules?.scoringModel == "POINTS_ONLY") {
                                            segmentBaseLabel
                                        } else {
                                            "$segmentBaseLabel ${segment.sequence}"
                                        }
                                    )
                                }
                            }
                        }
                        orderedSegments.forEach { segment ->
                            val team1SegmentScore = match.match.team1Id?.let { teamId -> segment.scores[teamId] } ?: 0
                            val team2SegmentScore = match.match.team2Id?.let { teamId -> segment.scores[teamId] } ?: 0
                            Text(
                                text = "${if (rules?.scoringModel == "POINTS_ONLY") segmentBaseLabel else "$segmentBaseLabel ${segment.sequence}"}: $team1SegmentScore - $team2SegmentScore (${segment.status})",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Text(
                            text = "Officials",
                            style = MaterialTheme.typography.titleSmall,
                        )
                        if (match.match.officialIds.isEmpty()) {
                            Text("No official slots assigned.", style = MaterialTheme.typography.bodySmall)
                        } else {
                            match.match.officialIds.forEach { assignment ->
                                Text(
                                    text = "${assignment.positionId} #${assignment.slotIndex + 1}: ${assignment.userId} ${if (assignment.checkedIn == true) "(checked in)" else "(not checked in)"}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                        Text(
                            text = "Match Log",
                            style = MaterialTheme.typography.titleSmall,
                        )
                        if (match.match.incidents.isEmpty()) {
                            Text("No match details recorded.", style = MaterialTheme.typography.bodySmall)
                        } else {
                            match.match.incidents.sortedBy { incident -> incident.sequence }.forEach { incident ->
                                Text(
                                    text = "${matchLogTypeLabel(incident.incidentType)}: ${incident.note ?: incident.linkedPointDelta?.let { "point change ${if (it > 0) "+" else ""}$it" } ?: "Match note"}",
                                    style = MaterialTheme.typography.bodySmall,
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
                        Text(
                            if (isWebLayout && showMap) {
                                "Hide Field Location"
                            } else {
                                "View Field Location"
                            }
                        )
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
fun ScoreCard(
    title: String,
    score: String,
    decrease: () -> Unit,
    increase: () -> Unit,
    enabled: Boolean,
    showControls: Boolean,
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
        Box(
            modifier = Modifier
            .wrapContentSize()
            .clickable(
                enabled = enabled,
                onClick = decrease,
            )
        ) {
            Icon(
                imageVector = MVPIcons.Remove24Px,
                contentDescription = "Decrease score",
                modifier = Modifier
                    .size(48.dp),
                tint = MaterialTheme.colorScheme.onSurface
            )
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
        }

        Box(
            modifier = Modifier
            .wrapContentSize()
            .clickable(enabled = enabled, onClick = increase)
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = "Increase score",
                modifier = Modifier
                    .size(48.dp),
                tint = MaterialTheme.colorScheme.onSurface
            )
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

