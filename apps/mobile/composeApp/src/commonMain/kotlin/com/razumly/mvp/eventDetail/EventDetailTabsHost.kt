package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.eventDetail.composables.ParticipantsSection
import com.razumly.mvp.eventDetail.composables.ParticipantsView
import com.razumly.mvp.eventDetail.composables.ScheduleItem
import com.razumly.mvp.eventDetail.composables.ScheduleView
import com.razumly.mvp.eventDetail.composables.TournamentBracketView
import kotlin.time.Clock

internal data class EventDetailTabsHostState(
    val availableTabs: List<DetailTab>,
    val selectedTab: DetailTab,
    val selectedDivisionSelectorState: SelectedDivisionSelectorState?,
    val tabContentTopOffset: Dp,
    val showFab: Boolean,
    val isDetailDockExpanded: Boolean,
    val selectedEvent: EventWithFullRelations,
    val tournamentPoolPlayEnabled: Boolean,
    val selectedSchedulePoolDivisionId: String?,
    val selectedScheduleDivisionId: String?,
    val schedulePoolDivisionOptions: List<BracketDivisionOption>,
    val isWeeklyParentEvent: Boolean,
    val weeklyScheduleItems: List<ScheduleItem>,
    val weeklyScheduleOptionsById: Map<String, WeeklySessionOption>,
    val selectedWeeklyOccurrence: SelectedWeeklyOccurrenceState?,
    val selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary?,
    val eventFields: List<FieldWithMatches>,
    val eventMatchesLoading: Boolean,
    val editableMatches: List<MatchWithRelations>,
    val canEditMatches: Boolean,
    val scheduleTrackedUserIds: Set<String>,
    val isEventOfficial: Boolean,
    val selectedStandingsDataDivisionId: String?,
    val selectedStandingsDivisionId: String?,
    val leagueDivisionStandings: LeagueDivisionStandings?,
    val leagueStandings: List<TeamStanding>,
    val showStandingsDrawColumn: Boolean,
    val leagueStandingsConfirming: Boolean,
    val leagueStandingsPointsEditing: Boolean = false,
    val leagueStandingsDraftPoints: Map<String, Double> = emptyMap(),
    val leagueStandingsPointsSaving: Boolean = false,
    val canManageLeagueStandings: Boolean,
    val eventTeamsAndParticipantsLoading: Boolean,
    val selectedParticipantsSection: ParticipantsSection,
    val participantSections: List<ParticipantsSection>,
    val isManagingParticipants: Boolean,
    val canManageParticipantsFromDock: Boolean,
    val showEventCheckInBadges: Boolean,
    val selectedParticipantsDivisionId: String?,
    val selectedDivisionId: String?,
    val registrationDivisionOptions: List<EventDetailDivisionOption>,
    val participantDivisionWarnings: List<EventParticipantDivisionWarning>,
    val showLosersBracketSelector: Boolean,
    val losersBracket: Boolean,
    val canManageMatchEditingFromDock: Boolean,
    val showScheduleMatchManagement: Boolean,
    val canConfirmLeagueResultsFromDock: Boolean,
    val leagueDivisionStandingsLoading: Boolean,
)

internal data class EventDetailTabsHostActions(
    val onTabSelected: (DetailTab) -> Unit,
    val onShowFabChanged: (Boolean) -> Unit,
    val onDivisionSelected: (DetailTab, String) -> Unit,
    val onPoolSelected: (DetailTab, String) -> Unit,
    val onWeeklySessionSelected: (WeeklySessionOption) -> Unit,
    val onMatchSelected: (MatchWithRelations) -> Unit,
    val onEditBracketMatch: (MatchWithRelations) -> Unit,
    val onEditScheduleMatch: (MatchWithRelations) -> Unit,
    val onSetLockForEditableMatches: (List<String>, Boolean) -> Unit,
    val onNavigateToChat: (UserData) -> Unit,
    val onMoveTeamParticipantDivision: (TeamWithPlayers, String) -> Unit,
    val onDetailDockExpandedChanged: (Boolean) -> Unit,
    val onToggleLosersBracket: () -> Unit,
    val onStartEditingMatches: () -> Unit,
    val onCancelEditingMatches: () -> Unit,
    val onCommitMatchChanges: () -> Unit,
    val onAddBracketMatch: () -> Unit,
    val onAddScheduleMatch: () -> Unit,
    val onRequestStandingsConfirmation: () -> Unit,
    val onStartEditingStandingsPoints: () -> Unit = {},
    val onAdjustStandingsPoints: (teamId: String, delta: Double) -> Unit = { _, _ -> },
    val onCancelEditingStandingsPoints: () -> Unit = {},
    val onSaveStandingsPoints: () -> Unit = {},
    val onParticipantsSectionSelected: (ParticipantsSection) -> Unit,
    val onManagingParticipantsChanged: (Boolean) -> Unit,
    val onInviteTeam: () -> Unit,
    val onInvitePlayer: () -> Unit,
    val onClearSelectedWeeklyOccurrence: () -> Unit,
    val onShowDetails: () -> Unit,
)

@Composable
internal fun EventDetailTabsHost(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
    modifier: Modifier = Modifier,
) {
    EventDetailTabStrip(
        availableTabs = state.availableTabs,
        selectedTab = state.selectedTab,
        onTabSelected = actions.onTabSelected,
        modifier = Modifier
            .fillMaxWidth()
            .guideTarget(EventGuideTargets.DetailTabs)
            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
    )
    Box(modifier.fillMaxSize()) {
        when (state.selectedTab) {
            DetailTab.BRACKET -> EventDetailBracketTab(
                state = state,
                actions = actions,
            )

            DetailTab.SCHEDULE -> EventDetailScheduleTab(
                state = state,
                actions = actions,
            )

            DetailTab.LEAGUES -> EventDetailStandingsTabHost(
                state = state,
                actions = actions,
            )

            DetailTab.PARTICIPANTS -> EventDetailParticipantsTab(
                state = state,
                actions = actions,
            )
        }

        EventDetailDivisionSelectorOverlay(
            state = state,
            actions = actions,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        EventDetailTabFloatingDock(
            state = state,
            actions = actions,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun EventDetailBracketTab(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .guideTarget(EventGuideTargets.BracketContent),
    ) {
        TournamentBracketView(
            showFab = actions.onShowFabChanged,
            topContentPadding = state.tabContentTopOffset,
            canManageBracket = state.canManageMatchEditingFromDock,
            onMatchClick = { match ->
                if (!state.canEditMatches) {
                    actions.onMatchSelected(match)
                }
            },
            isEditingMatches = state.canEditMatches,
            editableMatches = state.editableMatches,
            onEditMatch = { match ->
                if (state.canEditMatches) {
                    actions.onEditBracketMatch(match)
                } else {
                    actions.onMatchSelected(match)
                }
            },
            showEventOfficialNames = state.canEditMatches || state.isEventOfficial,
            limitOfficialsToCurrentUser = state.isEventOfficial && !state.canEditMatches,
        )
    }
}

@Composable
private fun EventDetailScheduleTab(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .guideTarget(EventGuideTargets.ScheduleContent),
    ) {
        when {
            state.isWeeklyParentEvent -> WeeklyEventSchedule(
                state = state,
                actions = actions,
            )

            state.eventMatchesLoading -> {
                actions.onShowFabChanged(false)
                DetailTabLoadingState("Loading schedule matches...")
            }

            else -> MatchSchedule(
                state = state,
                actions = actions,
            )
        }
    }
}

@Composable
private fun WeeklyEventSchedule(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
) {
    ScheduleView(
        items = state.weeklyScheduleItems,
        fields = state.eventFields,
        showFab = actions.onShowFabChanged,
        topContentPadding = state.tabContentTopOffset,
        timeZone = state.selectedEvent.event.resolvedTimeZone(),
        onMatchClick = {},
        onEventClick = { selectedOccurrenceEvent ->
            state.weeklyScheduleOptionsById[selectedOccurrenceEvent.id]?.let(actions.onWeeklySessionSelected)
        },
        eventCardContent = { scheduleEvent, _, _, onClick ->
            val session = state.weeklyScheduleOptionsById[scheduleEvent.id]
            if (session != null) {
                val activeOccurrence = state.selectedWeeklyOccurrence
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
                            state.selectedWeeklyOccurrenceSummary?.let { summary ->
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
}

@Composable
private fun MatchSchedule(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
) {
    val allScheduleMatches = if (state.canEditMatches) {
        state.editableMatches
    } else {
        state.selectedEvent.matches
    }
    val scheduleMatches = filterScheduleMatchesForDivision(
        matches = allScheduleMatches,
        tournamentPoolPlayEnabled = state.tournamentPoolPlayEnabled,
        selectedSchedulePoolDivisionId = state.selectedSchedulePoolDivisionId,
        selectedScheduleDivisionId = state.selectedScheduleDivisionId,
        schedulePoolDivisionOptions = state.schedulePoolDivisionOptions,
        singleDivision = state.selectedEvent.event.singleDivision,
        selectedDivisionId = state.selectedDivisionId,
    )
    val scheduledMatches = scheduleMatches.filter { match -> match.match.start != null }
    ScheduleView(
        items = scheduledMatches.map { match -> ScheduleItem.MatchEntry(match) },
        fields = state.eventFields,
        showFab = actions.onShowFabChanged,
        topContentPadding = state.tabContentTopOffset,
        timeZone = state.selectedEvent.event.resolvedTimeZone(),
        trackedUserIds = state.scheduleTrackedUserIds,
        showEventOfficialNames = state.canEditMatches || state.isEventOfficial,
        limitOfficialsToCurrentUser = state.isEventOfficial && !state.canEditMatches,
        canManageMatches = state.canEditMatches,
        onToggleLockAllMatches = { locked, matchIds ->
            actions.onSetLockForEditableMatches(matchIds, locked)
        },
        onMatchClick = { match ->
            if (state.canEditMatches) {
                actions.onEditScheduleMatch(match)
            } else {
                actions.onMatchSelected(match)
            }
        },
    )
}

@Composable
private fun EventDetailStandingsTabHost(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .guideTarget(EventGuideTargets.StandingsContent),
    ) {
        val selectedLeagueDivisionStandings = state.leagueDivisionStandings?.takeIf { standings ->
            !state.selectedStandingsDataDivisionId.isNullOrBlank() &&
                standings.divisionId.normalizeDivisionIdentifier() ==
                state.selectedStandingsDataDivisionId.normalizeDivisionIdentifier()
        }
        LeagueStandingsTab(
            state = EventDetailStandingsState(
                standings = state.leagueStandings,
                standingsDivisionKey = state.selectedStandingsDataDivisionId
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?: state.selectedStandingsDivisionId
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                    ?: "all",
                showDrawColumn = state.showStandingsDrawColumn,
                topContentPadding = state.tabContentTopOffset,
                standingsConfirmedAt = selectedLeagueDivisionStandings?.standingsConfirmedAt,
                validationMessages = selectedLeagueDivisionStandings?.validationMessages.orEmpty(),
                isLoading = false,
                isConfirming = state.leagueStandingsConfirming,
                canConfirmStandings = state.canManageLeagueStandings,
                isEditingPoints = state.leagueStandingsPointsEditing,
                draftPoints = state.leagueStandingsDraftPoints,
                isSavingPoints = state.leagueStandingsPointsSaving,
            ),
            actions = EventDetailStandingsActions(
                showFab = actions.onShowFabChanged,
                adjustPoints = actions.onAdjustStandingsPoints,
            ),
        )
    }
}

@Composable
private fun EventDetailParticipantsTab(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .guideTarget(EventGuideTargets.ParticipantsContent),
    ) {
        when {
            state.eventTeamsAndParticipantsLoading -> {
                actions.onShowFabChanged(false)
                DetailTabLoadingState("Loading teams and participants...")
            }

            state.isWeeklyParentEvent && state.selectedWeeklyOccurrence == null -> {
                actions.onShowFabChanged(true)
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
            }

            else -> ParticipantsView(
                showFab = actions.onShowFabChanged,
                section = state.selectedParticipantsSection,
                onNavigateToChat = actions.onNavigateToChat,
                manageMode = state.isManagingParticipants,
                canManageParticipants = state.canManageParticipantsFromDock,
                showEventCheckInBadges = state.showEventCheckInBadges,
                topContentPadding = state.tabContentTopOffset,
                selectedDivisionId = state.selectedParticipantsDivisionId
                    ?: state.selectedDivisionId,
                divisionOptions = state.registrationDivisionOptions,
                divisionWarnings = state.participantDivisionWarnings,
                onTeamDivisionSelected = actions.onMoveTeamParticipantDivision,
            )
        }
    }
}

@Composable
private fun EventDetailDivisionSelectorOverlay(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = state.selectedDivisionSelectorState != null,
        modifier = modifier
            .padding(top = 4.dp)
            .guideTarget(EventGuideTargets.DetailDivisionSelector)
            .zIndex(2f),
        enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
        exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(),
    ) {
        state.selectedDivisionSelectorState?.let { selectorState ->
            EventDetailDivisionSelectorBar(
                divisionState = selectorState.divisionState,
                poolState = selectorState.poolState,
                onDivisionSelected = { divisionId ->
                    actions.onDivisionSelected(state.selectedTab, divisionId)
                },
                onPoolSelected = { poolDivisionId ->
                    actions.onPoolSelected(state.selectedTab, poolDivisionId)
                },
            )
        }
    }
}

@Composable
private fun EventDetailTabFloatingDock(
    state: EventDetailTabsHostState,
    actions: EventDetailTabsHostActions,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = state.showFab,
        modifier = modifier
            .padding(LocalNavBarPadding.current)
            .padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
        enter = slideInVertically() + fadeIn(),
        exit = slideOutVertically() + fadeOut(),
    ) {
        when (state.selectedTab) {
            DetailTab.BRACKET -> ExpandableFloatingDock(
                expanded = state.isDetailDockExpanded,
                onExpandClick = { actions.onDetailDockExpandedChanged(true) },
                onCollapseClick = { actions.onDetailDockExpandedChanged(false) },
            ) { dockModifier, onCloseClick ->
                BracketFloatingBar(
                    showBracketToggle = state.showLosersBracketSelector,
                    isLosersBracket = state.losersBracket,
                    onBracketToggle = actions.onToggleLosersBracket,
                    showMatchEditAction = state.canManageMatchEditingFromDock,
                    isEditingMatches = state.canEditMatches,
                    onStartMatchEdit = actions.onStartEditingMatches,
                    onCancelMatchEdit = actions.onCancelEditingMatches,
                    onCommitMatchEdit = actions.onCommitMatchChanges,
                    primaryActionLabel = if (state.canEditMatches) "Add Match" else null,
                    onPrimaryActionClick = if (state.canEditMatches) {
                        actions.onAddBracketMatch
                    } else {
                        null
                    },
                    primaryActionEnabled = state.canEditMatches,
                    primaryActionColors = if (state.canEditMatches) {
                        ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF2E7D32),
                            contentColor = Color.White,
                        )
                    } else {
                        null
                    },
                    showPrimaryActionFirst = true,
                    useVerticalLayout = true,
                    onCloseClick = onCloseClick,
                    wrapInSurface = false,
                    selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrence?.label,
                    onClearSelectedWeeklyOccurrence = if (state.isWeeklyParentEvent) {
                        actions.onClearSelectedWeeklyOccurrence
                    } else {
                        null
                    },
                    onShowDetailsClick = actions.onShowDetails,
                    modifier = dockModifier,
                )
            }

            DetailTab.SCHEDULE -> ExpandableFloatingDock(
                expanded = state.isDetailDockExpanded,
                onExpandClick = { actions.onDetailDockExpandedChanged(true) },
                onCollapseClick = { actions.onDetailDockExpandedChanged(false) },
            ) { dockModifier, onCloseClick ->
                val canAddScheduleMatch = state.showScheduleMatchManagement && state.canEditMatches
                BracketFloatingBar(
                    showMatchEditAction = state.showScheduleMatchManagement,
                    isEditingMatches = canAddScheduleMatch,
                    onStartMatchEdit = actions.onStartEditingMatches,
                    onCancelMatchEdit = actions.onCancelEditingMatches,
                    onCommitMatchEdit = actions.onCommitMatchChanges,
                    primaryActionLabel = if (canAddScheduleMatch) "Add Match" else null,
                    onPrimaryActionClick = if (canAddScheduleMatch) {
                        actions.onAddScheduleMatch
                    } else {
                        null
                    },
                    primaryActionEnabled = canAddScheduleMatch,
                    primaryActionColors = if (canAddScheduleMatch) {
                        ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF2E7D32),
                            contentColor = Color.White,
                        )
                    } else {
                        null
                    },
                    showPrimaryActionFirst = true,
                    useVerticalLayout = true,
                    onCloseClick = onCloseClick,
                    wrapInSurface = false,
                    selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrence?.label,
                    onClearSelectedWeeklyOccurrence = if (state.isWeeklyParentEvent) {
                        actions.onClearSelectedWeeklyOccurrence
                    } else {
                        null
                    },
                    onShowDetailsClick = actions.onShowDetails,
                    modifier = dockModifier,
                )
            }

            DetailTab.LEAGUES -> ExpandableFloatingDock(
                expanded = state.isDetailDockExpanded,
                onExpandClick = { actions.onDetailDockExpandedChanged(true) },
                onCollapseClick = { actions.onDetailDockExpandedChanged(false) },
            ) { dockModifier, onCloseClick ->
                BracketFloatingBar(
                    showMatchEditAction = state.canManageLeagueStandings,
                    isEditingMatches = state.leagueStandingsPointsEditing,
                    onStartMatchEdit = actions.onStartEditingStandingsPoints,
                    onCancelMatchEdit = actions.onCancelEditingStandingsPoints,
                    onCommitMatchEdit = actions.onSaveStandingsPoints,
                    showConfirmResultsAction = state.canConfirmLeagueResultsFromDock,
                    confirmResultsEnabled = state.canConfirmLeagueResultsFromDock &&
                        !state.leagueDivisionStandingsLoading &&
                        !state.leagueStandingsConfirming &&
                        !state.leagueStandingsPointsEditing &&
                        !state.leagueStandingsPointsSaving &&
                        state.leagueStandings.isNotEmpty(),
                    confirmResultsInProgress = state.leagueStandingsConfirming,
                    onConfirmResultsClick = actions.onRequestStandingsConfirmation,
                    useVerticalLayout = true,
                    onCloseClick = onCloseClick,
                    wrapInSurface = false,
                    selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrence?.label,
                    onClearSelectedWeeklyOccurrence = if (state.isWeeklyParentEvent) {
                        actions.onClearSelectedWeeklyOccurrence
                    } else {
                        null
                    },
                    onShowDetailsClick = actions.onShowDetails,
                    modifier = dockModifier,
                )
            }

            DetailTab.PARTICIPANTS -> ExpandableFloatingDock(
                expanded = state.isDetailDockExpanded,
                onExpandClick = { actions.onDetailDockExpandedChanged(true) },
                onCollapseClick = { actions.onDetailDockExpandedChanged(false) },
            ) { dockModifier, onCloseClick ->
                val showInviteAction = state.canManageParticipantsFromDock && state.isManagingParticipants
                ParticipantsFloatingBar(
                    selectedSection = state.selectedParticipantsSection,
                    availableSections = state.participantSections,
                    onSectionSelected = actions.onParticipantsSectionSelected,
                    showManageAction = state.canManageParticipantsFromDock,
                    isManagingParticipants = state.isManagingParticipants,
                    onStartManagingParticipants = {
                        actions.onManagingParticipantsChanged(true)
                    },
                    onStopManagingParticipants = {
                        actions.onManagingParticipantsChanged(false)
                    },
                    inviteActionLabel = if (showInviteAction) {
                        if (state.selectedEvent.event.teamSignup) "Invite Team" else "Invite Player"
                    } else {
                        null
                    },
                    onInviteClick = if (showInviteAction) {
                        if (state.selectedEvent.event.teamSignup) actions.onInviteTeam else actions.onInvitePlayer
                    } else {
                        null
                    },
                    useVerticalLayout = true,
                    onCloseClick = onCloseClick,
                    wrapInSurface = false,
                    selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrence?.label,
                    onClearSelectedWeeklyOccurrence = if (state.isWeeklyParentEvent) {
                        actions.onClearSelectedWeeklyOccurrence
                    } else {
                        null
                    },
                    onShowDetailsClick = actions.onShowDetails,
                    modifier = dockModifier,
                )
            }
        }
    }
}
