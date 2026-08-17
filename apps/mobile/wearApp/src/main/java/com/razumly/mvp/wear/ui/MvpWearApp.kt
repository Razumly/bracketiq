package com.razumly.mvp.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.password
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.MaterialTheme
import com.razumly.mvp.wear.MvpWearActions
import com.razumly.mvp.wear.MvpWearUiState
import com.razumly.mvp.wear.WearIncidentField
import com.razumly.mvp.wear.WearIncidentMode
import com.razumly.mvp.wear.WearRoute
import com.razumly.mvp.wear.data.WearIncidentTypeDefinitionDto
import com.razumly.mvp.wear.data.WearMatch
import com.razumly.mvp.wear.data.WearMatchIncidentDto
import com.razumly.mvp.wear.data.WearMatchSegmentDto
import com.razumly.mvp.wear.data.WearPlayer
import com.razumly.mvp.wear.data.WearTeam
import com.razumly.mvp.wear.data.activeSegment
import com.razumly.mvp.wear.data.canStartSegmentFromDetail
import com.razumly.mvp.wear.data.displayScoreFor
import com.razumly.mvp.wear.data.isScoring
import com.razumly.mvp.wear.data.nextPlayableSegment
import com.razumly.mvp.wear.data.orderedSegments
import com.razumly.mvp.wear.data.readableCodeLabel
import com.razumly.mvp.wear.data.resolvedId
import com.razumly.mvp.wear.data.requiresPlayer
import com.razumly.mvp.wear.data.segmentUnitLabel
import com.razumly.mvp.wear.data.shouldOfferFinishAndStart
import com.razumly.mvp.wear.data.startSegmentActionLabel
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val Background = Color(0xFF050607)
private val Surface = Color(0xFF11171D)
private val SurfaceAlt = Color(0xFF1C252E)
private val Accent = Color(0xFF49E694)
private val Warning = Color(0xFFFFD166)
private val Danger = Color(0xFFFF6B6B)
private val OnSurface = Color(0xFFF7FAFC)
private val Muted = Color(0xFFA3AFB8)
private val HomeBlue = Color(0xFF073E8C)
private val AwayRed = Color(0xFF9B1624)

@Composable
fun MvpWearApp(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    MaterialTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Background),
        ) {
            when (state.route) {
                WearRoute.LOGIN -> LoginScreen(state, actions)
                WearRoute.MATCHES -> MatchListScreen(state, actions)
                WearRoute.MATCH_DETAIL -> MatchDetailScreen(state, actions)
                WearRoute.TIMER -> TimerScreen(state, actions)
                WearRoute.TEAM_PICK -> TeamScorePickerScreen(state, actions)
                WearRoute.ACTION_MENU -> ActionMenuScreen(state, actions)
                WearRoute.INCIDENT_LIST -> IncidentListScreen(state, actions)
                WearRoute.INCIDENT_EDITOR -> IncidentEditorScreen(state, actions)
                WearRoute.INCIDENT_DELETE_CONFIRM -> IncidentDeleteConfirmationScreen(state, actions)
                WearRoute.INCIDENT_TYPES -> IncidentTypeScreen(state, actions)
                WearRoute.INCIDENT_TEAMS -> IncidentTeamScreen(state, actions)
                WearRoute.PLAYERS -> PlayerScreen(state, actions)
                WearRoute.TIME_PICK -> TimePickScreen(state, actions)
            }
            if (state.isLoading) {
                LoadingScrim()
            }
        }
    }
}

@Composable
private fun LoginScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val focusManager = LocalFocusManager.current
    val passwordFocusRequester = remember { FocusRequester() }
    ScrollableWatchScreen {
        MiniHeader(title = "BracketIQ", subtitle = "Officials")
        WearTextField(
            value = state.email,
            label = "Email",
            onValueChange = actions.onEmailChange,
            keyboardType = KeyboardType.Email,
            imeAction = ImeAction.Next,
            keyboardActions = KeyboardActions(onNext = { passwordFocusRequester.requestFocus() }),
        )
        WearTextField(
            value = state.password,
            label = "Password",
            onValueChange = actions.onPasswordChange,
            modifier = Modifier.focusRequester(passwordFocusRequester),
            visualTransformation = PasswordVisualTransformation(),
            keyboardType = KeyboardType.Password,
            imeAction = ImeAction.Done,
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    actions.onSignIn()
                },
            ),
        )
        PrimaryChip(
            label = if (state.isLoading) "Signing in" else "Sign in",
            enabled = !state.isLoading,
            onClick = {
                focusManager.clearFocus()
                actions.onSignIn()
            },
        )
        StatusText(message = state.error, danger = true)
    }
}

@Composable
private fun MatchListScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    ScrollableWatchScreen {
        MiniHeader(title = "Upcoming", subtitle = state.currentUserLabel ?: "Officials")
        if (state.matches.isEmpty()) {
            EmptyText("No matches")
        } else {
            state.matches.forEach { match ->
                MatchRow(match = match, onClick = { actions.onMatchSelected(match.id) })
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SecondaryChip(
                label = "Refresh",
                modifier = Modifier.weight(1f),
                onClick = actions.onRefresh,
            )
            SecondaryChip(
                label = "Logout",
                modifier = Modifier.weight(1f),
                onClick = actions.onLogout,
            )
        }
        StatusText(message = state.error, danger = true)
        StatusText(message = state.message, danger = false)
    }
}

@Composable
private fun MatchDetailScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    Box(modifier = Modifier.fillMaxSize()) {
        CenteredWatchScreen {
            Spacer(modifier = Modifier.height(18.dp))
            BasicText(
                text = "Match ${match.number.takeIf { it > 0 } ?: "-"}",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(
                    color = Accent,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                ),
            )
            BasicText(
                text = match.teamLabel(),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(
                    color = OnSurface,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                ),
            )
            BasicText(
                text = match.timeAndFieldLabel(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center),
            )
            val active = match.raw.activeSegment() != null
            when {
                !match.officialCheckedIn -> {
                    PrimaryChip(label = "Check in", enabled = !state.isLoading, onClick = actions.onCheckIn)
                }
                active -> {
                    PrimaryChip(label = "Timer", enabled = !state.isLoading, onClick = actions.onOpenTimer)
                }
                match.isFinished() -> {
                    SecondaryChip(label = "Finished", enabled = false, onClick = {})
                }
                match.shouldOfferFinishAndStart() -> {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        PrimaryChip(
                            label = match.startSegmentActionLabel(),
                            enabled = !state.isLoading,
                            onClick = actions.onStartTimer,
                        )
                        SecondaryChip(
                            label = "Finish Match",
                            enabled = !state.isLoading,
                            onClick = actions.onEndMatch,
                        )
                    }
                }
                match.canStartSegmentFromDetail() -> {
                    PrimaryChip(
                        label = match.startSegmentActionLabel(),
                        enabled = !state.isLoading,
                        onClick = actions.onStartTimer,
                    )
                }
                else -> {
                    PrimaryChip(
                        label = "Finish Match",
                        enabled = !state.isLoading,
                        color = Danger,
                        onClick = actions.onEndMatch,
                    )
                }
            }
            StatusText(message = state.error, danger = true)
        }
        BackCircleButton(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 34.dp, top = 30.dp),
            size = 24.dp,
            onClick = actions.onBack,
        )
    }
}

@Composable
private fun TimerScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    val elapsedSeconds = rememberElapsedSeconds(match)
    val clockDisplay = match.clockDisplay(elapsedSeconds)
    val clockFontSize = if (clockDisplay.label.length > 6) 44.sp else 52.sp
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .clickable(enabled = !state.isLoading, onClick = actions.onTimerTapped),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = clockDisplay.label,
            maxLines = 1,
            style = TextStyle(
                color = if (clockDisplay.isAddedTime) Accent else OnSurface,
                fontSize = clockFontSize,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
    }
}

@Composable
private fun TeamScorePickerScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    LaunchedEffect(match.id, state.isDemo) {
        if (!state.isDemo) {
            delay(5_000)
            actions.onOpenTimer()
        }
    }
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val shortestSide = minOf(maxWidth.value, maxHeight.value)
        val compact = shortestSide < 180f
        val nameOffset = (shortestSide * if (compact) 0.34f else 0.39f).dp
        val scoreOffset = (shortestSide * if (compact) 0.18f else 0.23f).dp
        val rowPadding = (shortestSide * if (compact) 0.26f else 0.23f).dp
        val badgeSize = (shortestSide * if (compact) 0.12f else 0.135f).dp
        val badgeTextSize = (shortestSide * if (compact) 0.065f else 0.073f).sp
        val teamTextSize = (shortestSide * if (compact) 0.073f else 0.078f).sp
        val scoreTextSize = (shortestSide * if (compact) 0.18f else 0.198f).sp
        val actionHeight = (shortestSide * 0.14f).dp
        val actionIconSize = (shortestSide * 0.104f).dp
        val actionTextSize = (shortestSide * 0.068f).sp
        val actionPlusSize = (shortestSide * 0.078f).sp
        Column(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .background(HomeBlue)
                    .clickable(
                        enabled = !state.isLoading && match.team1 != null,
                        onClick = { match.team1?.id?.let(actions.onTeamSelected) },
                    ),
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .background(AwayRed)
                    .clickable(
                        enabled = !state.isLoading && match.team2 != null,
                        onClick = { match.team2?.id?.let(actions.onTeamSelected) },
                    ),
            )
        }
        TeamNameRow(
            team = match.team1,
            fallbackName = "Home",
            horizontalPadding = rowPadding,
            badgeSize = badgeSize,
            badgeTextSize = badgeTextSize,
            fontSize = teamTextSize,
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = -nameOffset),
        )
        ScoreValue(
            score = match.displayScoreFor(match.team1?.id),
            fontSize = scoreTextSize,
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = -scoreOffset),
        )
        ScoreValue(
            score = match.displayScoreFor(match.team2?.id),
            fontSize = scoreTextSize,
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = scoreOffset),
        )
        TeamNameRow(
            team = match.team2,
            fallbackName = "Away",
            horizontalPadding = rowPadding,
            badgeSize = badgeSize,
            badgeTextSize = badgeTextSize,
            fontSize = teamTextSize,
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = nameOffset),
        )
        CenterActionPill(
            modifier = Modifier.align(Alignment.Center),
            height = actionHeight,
            iconSize = actionIconSize,
            plusFontSize = actionPlusSize,
            textFontSize = actionTextSize,
            enabled = !state.isLoading,
            onClick = actions.onShowActionMenu,
        )
    }
}

@Composable
private fun ActionMenuScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    FixedFooterScreen(
        title = "Action",
        onBack = actions.onBack,
        footer = {},
    ) {
        ActionOptionChip(
            label = "Incidents",
            enabled = !state.isLoading,
            onClick = actions.onShowIncidentList,
        )
        ActionOptionChip(
            label = "Reset Time",
            enabled = !state.isLoading,
            onClick = actions.onResetTimer,
        )
        ActionOptionChip(
            label = match.endSegmentActionLabel(),
            color = Danger,
            enabled = !state.isLoading,
            onClick = actions.onEndSegment,
        )
        StatusText(message = state.error, danger = true)
        StatusText(message = state.message, danger = false)
    }
}

@Composable
private fun IncidentListScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    FixedFooterScreen(
        title = "Incidents",
        onBack = actions.onBack,
        footer = {},
    ) {
        val incidents = match.raw.incidents.sortedWith(compareBy<WearMatchIncidentDto> { it.sequence }.thenBy { it.minute ?: 0 })
        if (incidents.isEmpty()) {
            EmptyText("No incidents")
        } else {
            incidents.forEach { incident ->
                IncidentRow(
                    incident = incident,
                    match = match,
                    onClick = { actions.onOpenIncident(incident.resolvedId()) },
                )
            }
        }
        StatusText(message = state.error, danger = true)
    }
}

@Composable
private fun IncidentEditorScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    val modeTitle = if (state.incidentMode == WearIncidentMode.EDIT) "Edit incident" else "Add incident"
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BasicText(
            text = modeTitle,
            modifier = Modifier.padding(horizontal = 20.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(
                color = OnSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 4.dp, bottom = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            EditorFieldChip(
                label = "Type",
                value = state.selectedIncidentType?.displayLabel() ?: "Select",
                onClick = { actions.onEditIncidentField(WearIncidentField.TYPE) },
            )
            EditorFieldChip(
                label = "Team",
                value = state.selectedTeam?.label ?: "Select",
                onClick = { actions.onEditIncidentField(WearIncidentField.TEAM) },
            )
            val type = state.selectedIncidentType
            val selectedPlayer = state.selectedPlayer
            val playerValue = when {
                type?.isScoring() == true && !type.requiresPlayer(match.rules) -> "Not needed"
                selectedPlayer != null -> selectedPlayer.label
                else -> "Select"
            }
            EditorFieldChip(
                label = "Player",
                value = playerValue,
                onClick = { actions.onEditIncidentField(WearIncidentField.PLAYER) },
            )
            EditorFieldChip(
                label = "Time",
                value = state.incidentClockDisplay().plainLabel,
                onClick = { actions.onEditIncidentField(WearIncidentField.TIME) },
            )
            if (state.incidentMode == WearIncidentMode.EDIT) {
                PrimaryChip(
                    label = "Delete incident",
                    color = Danger,
                    enabled = !state.isLoading,
                    onClick = actions.onRequestDeleteIncident,
                )
            }
            StatusText(message = state.error, danger = true)
            StatusText(message = state.message, danger = false)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            BottomActionButton(
                label = "Cancel",
                modifier = Modifier.weight(1f),
                color = Danger,
                enabled = !state.isLoading,
                contentAlignment = Alignment.CenterEnd,
                onClick = actions.onCancelIncident,
            )
            BottomActionButton(
                label = if (state.isLoading) "Finished" else "Finish",
                modifier = Modifier.weight(1f),
                color = Accent,
                enabled = !state.isLoading,
                contentAlignment = Alignment.CenterStart,
                onClick = actions.onFinishIncident,
            )
        }
    }
}

@Composable
private fun IncidentDeleteConfirmationScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    val incident = state.selectedIncident
    if (match == null || incident == null) {
        EmptySelection(actions.onBack)
        return
    }
    FixedFooterScreen(
        title = "Delete incident",
        onBack = actions.onBack,
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                BottomActionButton(
                    label = "Keep",
                    modifier = Modifier.weight(1f),
                    enabled = !state.isLoading,
                    contentAlignment = Alignment.CenterEnd,
                    onClick = actions.onBack,
                )
                BottomActionButton(
                    label = "Delete",
                    modifier = Modifier.weight(1f),
                    color = Danger,
                    enabled = !state.isLoading,
                    contentAlignment = Alignment.CenterStart,
                    onClick = actions.onDeleteIncident,
                )
            }
        },
    ) {
        BasicText(
            text = "Remove this ${incident.typeLabel(match)}?",
            style = TextStyle(
                color = OnSurface,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
        BasicText(
            text = "This cannot be undone after it syncs.",
            style = TextStyle(color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center),
        )
        StatusText(message = state.error, danger = true)
    }
}

@Composable
private fun IncidentTypeScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    FixedFooterScreen(
        title = "Type",
        onBack = actions.onBack,
        footer = { BottomActionButton(label = "Cancel", color = Danger, onClick = actions.onCancelIncident) },
    ) {
        match.rules.incidentTypes().forEach { type ->
            val requiresPlayer = type.requiresPlayer(match.rules)
            val suffix = when {
                type.isScoring() && !requiresPlayer -> " +${type.linkedPointDelta ?: 1}"
                requiresPlayer -> " player"
                else -> ""
            }
            if (type.isScoring()) {
                PrimaryChip(
                    label = "${type.displayLabel()}$suffix",
                    onClick = { actions.onIncidentSelected(type.code) },
                )
            } else {
                SecondaryChip(
                    label = "${type.displayLabel()}$suffix",
                    onClick = { actions.onIncidentSelected(type.code) },
                )
            }
        }
        StatusText(message = state.error, danger = true)
    }
}

@Composable
private fun IncidentTeamScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    if (match == null) {
        EmptySelection(actions.onBack)
        return
    }
    FixedFooterScreen(
        title = "Team",
        onBack = actions.onBack,
        footer = { BottomActionButton(label = "Cancel", color = Danger, onClick = actions.onCancelIncident) },
    ) {
        match.team1?.let { team ->
            TeamChip(team = team, score = match.displayScoreFor(team.id), onClick = { actions.onTeamSelected(team.id) })
        }
        match.team2?.let { team ->
            TeamChip(team = team, score = match.displayScoreFor(team.id), onClick = { actions.onTeamSelected(team.id) })
        }
        StatusText(message = state.error, danger = true)
    }
}

@Composable
private fun PlayerScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val match = state.selectedMatch
    val team = state.selectedTeam
    val type = state.selectedIncidentType
    if (match == null || team == null || type == null) {
        EmptySelection(actions.onBack)
        return
    }
    val requiresPlayer = type.requiresPlayer(match.rules)
    FixedFooterScreen(
        title = "Player",
        onBack = actions.onBack,
        footer = { BottomActionButton(label = "Cancel", color = Danger, onClick = actions.onCancelIncident) },
    ) {
        team.players.forEach { player ->
            PlayerChip(player = player, onClick = { actions.onPlayerSelected(player.participantUserId) })
        }
        if (!requiresPlayer) {
            SecondaryChip(label = "No player", onClick = { actions.onPlayerSelected(null) })
        }
        StatusText(message = state.error, danger = true)
    }
}

@Composable
private fun TimePickScreen(
    state: MvpWearUiState,
    actions: MvpWearActions,
) {
    val type = state.selectedIncidentType
    if (type == null) {
        EmptySelection(actions.onBack)
        return
    }
    FixedFooterScreen(
        title = "Time",
        onBack = actions.onBack,
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                BottomActionButton(
                    label = "Cancel",
                    modifier = Modifier.weight(1f),
                    color = Danger,
                    contentAlignment = Alignment.CenterEnd,
                    onClick = actions.onCancelIncident,
                )
                BottomActionButton(
                    label = "Done",
                    modifier = Modifier.weight(1f),
                    color = Accent,
                    contentAlignment = Alignment.CenterStart,
                    onClick = actions.onTimeDone,
                )
            }
        },
    ) {
        BasicText(
            text = type.displayLabel(),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(color = Muted, fontSize = 11.sp, textAlign = TextAlign.Center),
        )
        TimePicker(clock = state.incidentClockDisplay(), onAdjust = actions.onMinuteAdjusted)
        StatusText(message = state.error, danger = true)
    }
}

@Composable
private fun ScrollableWatchScreen(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

@Composable
private fun CenteredWatchScreen(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 26.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        content = content,
    )
}

@Composable
private fun FixedFooterScreen(
    title: String,
    onBack: () -> Unit,
    footer: @Composable ColumnScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TopBar(title = title, onBack = onBack)
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp)
                .padding(top = 8.dp, bottom = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            content = content,
        )
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(0.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            content = footer,
        )
    }
}

@Composable
private fun MiniHeader(title: String, subtitle: String? = null) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BasicText(
            text = title,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(
                color = OnSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
        if (!subtitle.isNullOrBlank()) {
            BasicText(
                text = subtitle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(color = Muted, fontSize = 9.sp, textAlign = TextAlign.Center),
            )
        }
    }
}

@Composable
private fun TopBar(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BackCircleButton(onClick = onBack)
        BasicText(
            text = title,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(color = OnSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun BackCircleButton(
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = 30.dp,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(SurfaceAlt)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = "<",
            style = TextStyle(color = OnSurface, fontSize = 16.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun ActionOptionChip(
    label: String,
    color: Color = SurfaceAlt,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    if (color == Danger) {
        PrimaryChip(label = label, color = color, enabled = enabled, onClick = onClick)
    } else {
        SecondaryChip(label = label, enabled = enabled, onClick = onClick)
    }
}

@Composable
private fun BottomActionButton(
    label: String,
    modifier: Modifier = Modifier,
    color: Color = SurfaceAlt,
    enabled: Boolean = true,
    contentAlignment: Alignment = Alignment.Center,
    onClick: () -> Unit,
) {
    val background = if (enabled) color else SurfaceAlt.copy(alpha = 0.55f)
    val contentColor = when {
        !enabled -> Muted
        color == Danger -> Color.White
        color == Accent -> Color(0xFF052513)
        else -> OnSurface
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(26.dp)
            .clip(RoundedCornerShape(0.dp))
            .background(background)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp),
        contentAlignment = contentAlignment,
    ) {
        BasicText(
            text = label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(
                color = contentColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
    }
}

@Composable
internal fun WearTextField(
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val isPasswordField = visualTransformation is PasswordVisualTransformation
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = label
                if (isPasswordField) password()
            },
        singleLine = true,
        visualTransformation = visualTransformation,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = keyboardActions,
        textStyle = TextStyle(color = OnSurface, fontSize = 13.sp),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(36.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Surface)
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isBlank()) {
                    BasicText(text = label, style = TextStyle(color = Muted, fontSize = 12.sp))
                }
                innerTextField()
            }
        },
    )
}

@Composable
private fun MatchRow(match: WearMatch, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clip(RoundedCornerShape(25.dp))
            .background(Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(SurfaceAlt),
            contentAlignment = Alignment.Center,
        ) {
            BasicText(
                text = match.number.takeIf { it > 0 }?.toString() ?: "-",
                maxLines = 1,
                style = TextStyle(color = Accent, fontSize = 13.sp, fontWeight = FontWeight.Bold),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            BasicText(
                text = match.shortTeamLabel(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(color = OnSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
            )
            BasicText(
                text = match.timeAndFieldLabel(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(color = Muted, fontSize = 10.sp),
            )
        }
    }
}

@Composable
private fun ScoreValue(
    score: Int,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
) {
    BasicText(
        text = score.toString(),
        modifier = modifier,
        maxLines = 1,
        style = TextStyle(
            color = Color.White,
            fontSize = fontSize,
            lineHeight = fontSize,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        ),
    )
}

@Composable
private fun TeamNameRow(
    team: WearTeam?,
    fallbackName: String,
    horizontalPadding: androidx.compose.ui.unit.Dp,
    badgeSize: androidx.compose.ui.unit.Dp,
    badgeTextSize: TextUnit,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        TeamBadge(label = team?.label ?: fallbackName, size = badgeSize, fontSize = badgeTextSize)
        Spacer(modifier = Modifier.width(8.dp))
        BasicText(
            text = team?.label ?: fallbackName,
            modifier = Modifier.weight(1f, fill = false),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(
                color = Color.White,
                fontSize = fontSize,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
    }
}

@Composable
private fun TeamBadge(label: String, size: androidx.compose.ui.unit.Dp, fontSize: TextUnit) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.13f)),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label.firstOrNull()?.uppercaseChar()?.toString() ?: "?",
            style = TextStyle(color = Color.White, fontSize = fontSize, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun CenterActionPill(
    modifier: Modifier,
    height: androidx.compose.ui.unit.Dp,
    iconSize: androidx.compose.ui.unit.Dp,
    plusFontSize: TextUnit,
    textFontSize: TextUnit,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth(0.72f)
            .height(height)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFFF3F5F8))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(iconSize)
                .clip(CircleShape)
                .background(HomeBlue),
            contentAlignment = Alignment.Center,
        ) {
            BasicText(
                text = "+",
                style = TextStyle(color = Color.White, fontSize = plusFontSize, fontWeight = FontWeight.Bold),
            )
        }
        Spacer(modifier = Modifier.width(6.dp))
        BasicText(
            text = "Action",
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(
                color = HomeBlue,
                fontSize = textFontSize,
                fontWeight = FontWeight.Bold,
            ),
        )
    }
}

@Composable
private fun TeamChip(team: WearTeam, score: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(38.dp)
            .clip(RoundedCornerShape(19.dp))
            .background(SurfaceAlt)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BasicText(
            text = score.toString(),
            style = TextStyle(color = Accent, fontSize = 17.sp, fontWeight = FontWeight.Bold),
        )
        BasicText(
            text = team.label,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(color = OnSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
        )
    }
}

@Composable
private fun PlayerChip(player: WearPlayer, onClick: () -> Unit) {
    SecondaryChip(
        label = listOfNotNull(player.jerseyNumber?.let { "#$it" }, player.label).joinToString(" "),
        onClick = onClick,
    )
}

@Composable
private fun IncidentRow(
    incident: WearMatchIncidentDto,
    match: WearMatch,
    onClick: () -> Unit,
) {
    val team = match.teamFor(incident.eventTeamId)
    val player = team?.players?.firstOrNull { it.participantUserId == incident.participantUserId }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BasicText(
            text = incident.clock ?: incident.minute?.let { "${it}m" } ?: "--",
            maxLines = 1,
            style = TextStyle(color = Accent, fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
        Column(modifier = Modifier.weight(1f)) {
            BasicText(
                text = incident.typeLabel(match),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(color = OnSurface, fontSize = 12.sp, fontWeight = FontWeight.Bold),
            )
            BasicText(
                text = listOfNotNull(team?.label, player?.label).joinToString(" - ").ifBlank { "No details" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = TextStyle(color = Muted, fontSize = 10.sp),
            )
        }
    }
}

@Composable
private fun EditorFieldChip(
    label: String,
    value: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BasicText(
            text = label,
            maxLines = 1,
            style = TextStyle(color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold),
        )
        BasicText(
            text = value,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(
                color = OnSurface,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.End,
            ),
        )
    }
}

@Composable
private fun PrimaryChip(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = Accent,
    fontSize: TextUnit = 12.sp,
    onClick: () -> Unit,
) {
    Chip(label = label, modifier = modifier, enabled = enabled, color = color, fontSize = fontSize, onClick = onClick)
}

@Composable
private fun SecondaryChip(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    fontSize: TextUnit = 12.sp,
    onClick: () -> Unit,
) {
    Chip(
        label = label,
        modifier = modifier,
        enabled = enabled,
        color = SurfaceAlt,
        secondary = true,
        fontSize = fontSize,
        onClick = onClick,
    )
}

@Composable
private fun Chip(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color,
    secondary: Boolean = false,
    fontSize: TextUnit = 12.sp,
    onClick: () -> Unit,
) {
    val background = if (enabled) color else SurfaceAlt.copy(alpha = 0.55f)
    val contentColor = when {
        !enabled -> Muted
        color == Danger -> Color.White
        secondary -> OnSurface
        else -> Color(0xFF052513)
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(34.dp)
            .clip(RoundedCornerShape(17.dp))
            .background(background)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(
                color = contentColor,
                fontSize = fontSize,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
    }
}

@Composable
private fun TimePicker(clock: IncidentClockDisplay, onAdjust: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundButton(label = "-", onClick = { onAdjust(-1) })
        Column(
            modifier = Modifier
                .weight(1f)
                .height(58.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(SurfaceAlt),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicText(
                    text = clock.base,
                    style = TextStyle(color = OnSurface, fontSize = 26.sp, fontWeight = FontWeight.Bold),
                )
                clock.added?.let { added ->
                    BasicText(
                        text = added,
                        style = TextStyle(color = Accent, fontSize = 26.sp, fontWeight = FontWeight.Bold),
                    )
                }
            }
            BasicText(text = "minutes", style = TextStyle(color = Muted, fontSize = 9.sp))
        }
        RoundButton(label = "+", onClick = { onAdjust(1) })
    }
}

@Composable
private fun RoundButton(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(Surface)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            style = TextStyle(color = OnSurface, fontSize = 20.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun EmptyText(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .clip(RoundedCornerShape(25.dp))
            .background(Surface),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = text,
            style = TextStyle(color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center),
        )
    }
}

@Composable
private fun StatusText(message: String?, danger: Boolean) {
    if (message.isNullOrBlank()) return
    BasicText(
        text = message,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (danger) Danger.copy(alpha = 0.18f) else Accent.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        maxLines = 3,
        overflow = TextOverflow.Ellipsis,
        style = TextStyle(
            color = if (danger) Danger else Accent,
            fontSize = 10.sp,
            textAlign = TextAlign.Center,
        ),
    )
}

@Composable
private fun LoadingPill(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceAlt)
            .padding(horizontal = 12.dp, vertical = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = "Loading",
            style = TextStyle(color = Warning, fontSize = 10.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun LoadingScrim() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background.copy(alpha = 0.78f))
            .clickable(onClick = {}),
        contentAlignment = Alignment.Center,
    ) {
        LoadingPill()
    }
}

@Composable
private fun EmptySelection(onBack: () -> Unit) {
    CenteredWatchScreen {
        EmptyText("Nothing selected")
        SecondaryChip(label = "Back", onClick = onBack)
    }
}

@Composable
private fun rememberElapsedSeconds(match: WearMatch): Long {
    val activeSegment = match.raw.activeSegment()
    var nowMillis by remember(activeSegment?.startedAt, activeSegment?.endedAt) {
        mutableStateOf(System.currentTimeMillis())
    }
    LaunchedEffect(activeSegment?.startedAt, activeSegment?.endedAt) {
        while (activeSegment?.startedAt != null && activeSegment.endedAt == null) {
            nowMillis = System.currentTimeMillis()
            delay(1_000)
        }
    }
    return activeSegment?.let { segment ->
        val started = runCatching { Instant.parse(segment.startedAt) }.getOrNull()
        val ended = runCatching { segment.endedAt?.let(Instant::parse) }.getOrNull()
        if (started != null) {
            Duration.between(started, ended ?: Instant.ofEpochMilli(nowMillis)).seconds.coerceAtLeast(0)
        } else {
            0L
        }
    } ?: 0L
}

private fun WearIncidentTypeDefinitionDto.displayLabel(): String =
    label.ifBlank { code.readableCodeLabel() }

private fun WearMatch.isFinished(): Boolean =
    status.equals("COMPLETE", ignoreCase = true) || raw.actualEnd != null

private fun WearMatch.teamLabel(): String =
    "${team1?.label ?: "TBD"} vs ${team2?.label ?: "TBD"}"

private fun WearMatch.shortTeamLabel(): String =
    "${team1?.shortName() ?: "TBD"} vs ${team2?.shortName() ?: "TBD"}"

private fun WearTeam.shortName(): String {
    val tokens = label.split(' ', '-', '/').mapNotNull { it.trim().takeIf(String::isNotBlank) }
    return when {
        label.length <= 12 -> label
        tokens.size >= 2 -> tokens.take(2).joinToString(" ") { it.take(5) }
        else -> label.take(12)
    }
}

private fun WearMatch.timeAndFieldLabel(): String {
    val start = startTimeLabel()
    return listOfNotNull(start, fieldLabel).joinToString(" - ").ifBlank { division ?: "Upcoming" }
}

private fun WearMatch.endSegmentActionLabel(): String {
    val activeSegment = raw.activeSegment()
    val regulationCount = rules.segmentCount.coerceAtLeast(1)
    val unit = if (activeSegment != null && activeSegment.sequence > regulationCount) {
        "Overtime"
    } else {
        segmentUnitLabel()
    }
    return "End $unit"
}

private fun WearMatch.startTimeLabel(): String? =
    startIso?.let(::formatStartTime)

private fun WearMatch.teamFor(teamId: String?): WearTeam? =
    listOfNotNull(team1, team2).firstOrNull { it.id == teamId }

private fun WearMatchIncidentDto.typeLabel(match: WearMatch): String =
    match.rules.incidentTypes()
        .firstOrNull { it.code == incidentType }
        ?.displayLabel()
        ?: incidentType.readableCodeLabel()

private fun formatStartTime(raw: String): String? =
    runCatching {
        DateTimeFormatter.ofPattern("EEE h:mm a")
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(raw))
    }.getOrNull()

internal fun formatMatchClockDuration(seconds: Long): String {
    val safeSeconds = seconds.coerceAtLeast(0)
    val minutes = safeSeconds / 60
    val remainder = safeSeconds % 60
    return "$minutes:${remainder.toString().padStart(2, '0')}"
}

private data class MatchClockDisplay(
    val label: String,
    val isAddedTime: Boolean,
)

private data class IncidentClockDisplay(
    val base: String,
    val added: String? = null,
) {
    val plainLabel: String
        get() = base + (added ?: "")
}

private fun MvpWearUiState.incidentClockDisplay(): IncidentClockDisplay {
    val match = selectedMatch ?: return IncidentClockDisplay(incidentMinute.minuteLabel())
    val segment = selectedIncident?.segmentId
        ?.let { segmentId -> match.raw.segments.firstOrNull { it.resolvedId() == segmentId } }
        ?: match.raw.activeSegment()
        ?: match.raw.nextPlayableSegment(match.rules)
    return match.incidentClockDisplay(segment, incidentClockSeconds, incidentMinute)
}

private fun WearMatch.clockDisplay(elapsedSeconds: Long): MatchClockDisplay {
    val activeSegment = raw.activeSegment()
    val safeSeconds = elapsedSeconds.coerceAtLeast(0).toInt()
    if (!rules.timekeeping.addedTimeEnabled || activeSegment == null) {
        return MatchClockDisplay(formatMatchClockDuration(safeSeconds.toLong()), isAddedTime = false)
    }
    val durationSeconds = durationSecondsForSequence(activeSegment.sequence)
        ?: return MatchClockDisplay(formatMatchClockDuration(safeSeconds.toLong()), isAddedTime = false)
    val offsetSeconds = regulationOffsetSeconds(activeSegment)
    return if (safeSeconds >= durationSeconds) {
        MatchClockDisplay("+${formatMatchClockDuration((safeSeconds - durationSeconds).toLong())}", isAddedTime = true)
    } else {
        MatchClockDisplay(formatMatchClockDuration((offsetSeconds + safeSeconds).toLong()), isAddedTime = false)
    }
}

private fun WearMatch.incidentClockDisplay(
    segment: WearMatchSegmentDto?,
    seconds: Int,
    fallbackMinute: Int,
): IncidentClockDisplay {
    val safeSeconds = seconds.coerceAtLeast(0)
    if (!rules.timekeeping.addedTimeEnabled || segment == null) {
        return IncidentClockDisplay(fallbackMinute.minuteLabel())
    }
    val durationSeconds = durationSecondsForSequence(segment.sequence)
        ?: return IncidentClockDisplay(fallbackMinute.minuteLabel())
    val offsetSeconds = regulationOffsetSeconds(segment)
    val regulationEndSeconds = offsetSeconds + durationSeconds
    return when {
        safeSeconds >= regulationEndSeconds -> {
            val regulationMinute = (regulationEndSeconds / 60).coerceAtLeast(0)
            val addedMinute = ((safeSeconds - regulationEndSeconds).coerceAtLeast(0) / 60) + 1
            IncidentClockDisplay(regulationMinute.toString(), "+$addedMinute")
        }
        else -> IncidentClockDisplay(fallbackMinute.minuteLabel())
    }
}

private fun Int.minuteLabel(): String =
    coerceAtLeast(1).toString().padStart(2, '0')

private fun WearMatch.durationSecondsForSequence(sequence: Int): Int? {
    val durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence.getOrNull(sequence - 1)
        ?: rules.timekeeping.segmentDurationMinutes
    return durationMinutes?.takeIf { it > 0 }?.times(60)
}

private fun WearMatch.regulationOffsetSeconds(segment: WearMatchSegmentDto): Int {
    val sequence = segment.sequence.coerceAtLeast(1)
    var offsetSeconds = 0
    for (index in 1 until sequence) {
        offsetSeconds += durationSecondsForSequence(index) ?: 0
    }
    return offsetSeconds
}
