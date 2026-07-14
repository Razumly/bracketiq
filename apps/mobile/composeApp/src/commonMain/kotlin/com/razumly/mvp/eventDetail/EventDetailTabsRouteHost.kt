package com.razumly.mvp.eventDetail

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.LeagueDivisionStandings
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.presentation.EventDetailInitialTab
import com.razumly.mvp.core.presentation.guides.EventGuideIds
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.LocalGuideController
import com.razumly.mvp.core.presentation.guides.eventBracketTabGuide
import com.razumly.mvp.core.presentation.guides.eventParticipantsTabGuide
import com.razumly.mvp.core.presentation.guides.eventScheduleTabGuide
import com.razumly.mvp.core.presentation.guides.eventStandingsTabGuide
import com.razumly.mvp.eventDetail.composables.ParticipantsSection
import com.razumly.mvp.eventDetail.composables.ScheduleItem

internal data class EventDetailTabsRouteState(
    val initialTab: EventDetailInitialTab,
    val showDetails: Boolean,
    val isEditing: Boolean,
    val showMap: Boolean,
    val guideEventId: String,
    val canStartGuide: Boolean,
    val hasBracketView: Boolean,
    val hasScheduleView: Boolean,
    val hasStandingsView: Boolean,
    val selectedEvent: EventWithFullRelations,
    val tournamentPoolPlayEnabled: Boolean,
    val tournamentBracketDivisionOptions: List<BracketDivisionOption>,
    val joinDivisionOptions: List<BracketDivisionOption>,
    val leagueDivisionOptions: List<BracketDivisionOption>,
    val playoffDivisionOptions: List<BracketDivisionOption>,
    val selectedJoinDivisionId: String?,
    val registrationDivisionOptions: List<EventDetailDivisionOption>,
    val registrationJoinDivisionOptions: List<BracketDivisionOption>,
    val selectedDivisionId: String?,
    val selectedScheduleDivisionId: String?,
    val selectedSchedulePoolDivisionId: String?,
    val schedulePoolDivisionOptions: List<BracketDivisionOption>,
    val selectedStandingsDivisionId: String?,
    val selectedStandingsPoolDivisionId: String?,
    val selectedStandingsDataDivisionId: String?,
    val standingsTabDivisionOptions: List<BracketDivisionOption>,
    val standingsPoolDivisionOptions: List<BracketDivisionOption>,
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
    val leagueDivisionStandings: LeagueDivisionStandings?,
    val leagueStandings: List<TeamStanding>,
    val showStandingsDrawColumn: Boolean,
    val leagueStandingsConfirming: Boolean,
    val canManageLeagueStandings: Boolean,
    val eventTeamsAndParticipantsLoading: Boolean,
    val canManageParticipantsFromDock: Boolean,
    val showEventCheckInBadges: Boolean,
    val participantDivisionWarnings: List<EventParticipantDivisionWarning>,
    val losersBracket: Boolean,
    val canManageMatchEditingFromDock: Boolean,
    val showScheduleMatchManagement: Boolean,
    val canConfirmLeagueResultsFromDock: Boolean,
    val leagueDivisionStandingsLoading: Boolean,
)

internal data class EventDetailTabsRouteActions(
    val onSelectDivision: (String) -> Unit,
    val onSchedulePoolSelected: (String?) -> Unit,
    val onStandingsPoolSelected: (String?) -> Unit,
    val onWeeklySessionSelected: (WeeklySessionOption) -> Unit,
    val onMatchSelected: (MatchWithRelations) -> Unit,
    val onEditBracketMatch: (MatchWithRelations) -> Unit,
    val onEditScheduleMatch: (MatchWithRelations) -> Unit,
    val onSetLockForEditableMatches: (List<String>, Boolean) -> Unit,
    val onNavigateToChat: (UserData) -> Unit,
    val onMoveTeamParticipantDivision: (TeamWithPlayers, String) -> Unit,
    val onToggleLosersBracket: () -> Unit,
    val onStartEditingMatches: () -> Unit,
    val onCancelEditingMatches: () -> Unit,
    val onCommitMatchChanges: () -> Unit,
    val onAddBracketMatch: () -> Unit,
    val onAddScheduleMatch: () -> Unit,
    val onRequestStandingsConfirmation: () -> Unit,
    val onManagingParticipantsChanged: (Boolean) -> Unit,
    val onInviteTeam: () -> Unit,
    val onInvitePlayer: () -> Unit,
    val onClearSelectedWeeklyOccurrence: () -> Unit,
    val onShowDetails: () -> Unit,
)

@Composable
internal fun EventDetailTabsRouteHost(
    state: EventDetailTabsRouteState,
    actions: EventDetailTabsRouteActions,
    modifier: Modifier = Modifier,
) {
    val availableTabs = remember(
        state.hasBracketView,
        state.hasScheduleView,
        state.hasStandingsView,
    ) {
        availableEventDetailTabs(
            hasBracketView = state.hasBracketView,
            hasScheduleView = state.hasScheduleView,
            hasStandingsView = state.hasStandingsView,
        )
    }
    val requestedInitialTab = remember(state.initialTab, availableTabs) {
        resolveInitialEventDetailTab(
            initialTab = state.initialTab,
            availableTabs = availableTabs,
        )
    }
    var selectedTab by rememberSaveable { mutableStateOf(requestedInitialTab) }
    val bracketTabDivisionOptions = remember(
        state.tournamentPoolPlayEnabled,
        state.tournamentBracketDivisionOptions,
        state.selectedEvent.event.eventType,
        state.selectedEvent.event.splitLeaguePlayoffDivisions,
        state.joinDivisionOptions,
        state.leagueDivisionOptions,
        state.playoffDivisionOptions,
    ) {
        state.selectedEvent.event.detailBracketDivisionOptions(
            tournamentPoolPlayEnabled = state.tournamentPoolPlayEnabled,
            tournamentBracketDivisionOptions = state.tournamentBracketDivisionOptions,
            joinDivisionOptions = state.joinDivisionOptions,
            leagueDivisionOptions = state.leagueDivisionOptions,
            playoffDivisionOptions = state.playoffDivisionOptions,
        )
    }
    val preferredBracketDivisionId = remember(
        state.tournamentPoolPlayEnabled,
        state.selectedEvent.event.divisionDetails,
        state.selectedEvent.event.eventType,
        state.selectedEvent.event.splitLeaguePlayoffDivisions,
        state.playoffDivisionOptions,
        state.selectedJoinDivisionId,
    ) {
        state.selectedEvent.event.preferredBracketStageDivisionId(
            tournamentPoolPlayEnabled = state.tournamentPoolPlayEnabled,
            playoffDivisionOptions = state.playoffDivisionOptions,
            selectedDivisionId = state.selectedJoinDivisionId,
        )
    }
    val selectedBracketDivisionId = remember(
        preferredBracketDivisionId,
        bracketTabDivisionOptions,
    ) {
        bracketTabDivisionOptions.resolveSelectedDivisionId(preferredBracketDivisionId)
    }
    val showLosersBracketSelector = remember(
        state.selectedEvent.event.doubleElimination,
        state.selectedEvent.event.divisionDetails,
        state.selectedEvent.matches,
        selectedBracketDivisionId,
    ) {
        state.selectedEvent.event.hasLosersBracketSelector(
            selectedDivisionId = selectedBracketDivisionId,
            matches = state.selectedEvent.matches,
        )
    }
    val participantSections = remember(state.selectedEvent.event.teamSignup) {
        eventDetailParticipantSections(state.selectedEvent.event.teamSignup)
    }
    var selectedParticipantsSection by rememberSaveable {
        mutableStateOf(participantSections.first())
    }
    val selectedParticipantsDivisionId = remember(
        state.selectedDivisionId,
        state.registrationDivisionOptions,
        state.selectedJoinDivisionId,
    ) {
        state.registrationDivisionOptions.resolveSelectedEventDivisionId(state.selectedDivisionId)
            ?: state.selectedJoinDivisionId
    }
    val participantsTabDivisionOptions = remember(
        state.registrationJoinDivisionOptions,
        state.joinDivisionOptions,
    ) {
        state.registrationJoinDivisionOptions
            .ifEmpty { state.joinDivisionOptions }
            .distinctById()
    }
    var showFab by remember { mutableStateOf(false) }
    var isDetailDockExpanded by rememberSaveable { mutableStateOf(false) }
    var isManagingParticipants by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(availableTabs) {
        selectedTab = resolveAvailableEventDetailTab(
            selectedTab = selectedTab,
            availableTabs = availableTabs,
        )
    }
    LaunchedEffect(state.initialTab, availableTabs) {
        selectedTab = resolveRequestedEventDetailTab(
            initialTab = state.initialTab,
            selectedTab = selectedTab,
            availableTabs = availableTabs,
        )
    }
    LaunchedEffect(selectedTab) {
        isDetailDockExpanded = false
    }
    LaunchedEffect(showFab) {
        if (!showFab) {
            isDetailDockExpanded = false
        }
    }
    LaunchedEffect(
        selectedTab,
        state.selectedStandingsDivisionId,
        state.selectedStandingsDataDivisionId,
        selectedBracketDivisionId,
        state.selectedDivisionId,
    ) {
        val targetDivisionId = selectedEventDetailTabTargetDivisionId(
            selectedTab = selectedTab,
            selectedStandingsDataDivisionId = state.selectedStandingsDataDivisionId,
            selectedBracketDivisionId = selectedBracketDivisionId,
        )
        if (!targetDivisionId.isNullOrBlank() &&
            state.selectedDivisionId?.normalizeDivisionIdentifier() !=
            targetDivisionId.normalizeDivisionIdentifier()
        ) {
            actions.onSelectDivision(targetDivisionId)
        }
    }
    LaunchedEffect(participantSections) {
        selectedParticipantsSection = resolveAvailableParticipantSection(
            selectedSection = selectedParticipantsSection,
            availableSections = participantSections,
        )
    }

    val selectedDivisionSelectorState = remember(
        selectedTab,
        state.selectedDivisionId,
        selectedParticipantsDivisionId,
        participantsTabDivisionOptions,
        state.selectedScheduleDivisionId,
        state.selectedSchedulePoolDivisionId,
        state.schedulePoolDivisionOptions,
        state.selectedStandingsDivisionId,
        state.selectedStandingsPoolDivisionId,
        state.selectedStandingsDataDivisionId,
        state.standingsTabDivisionOptions,
        state.standingsPoolDivisionOptions,
        state.tournamentPoolPlayEnabled,
        state.tournamentBracketDivisionOptions,
        selectedBracketDivisionId,
        bracketTabDivisionOptions,
        state.joinDivisionOptions,
        state.selectedEvent.event.singleDivision,
        state.selectedEvent.event.divisionDetails,
    ) {
        val selectedDivisionForTab = when (selectedTab) {
            DetailTab.BRACKET -> selectedBracketDivisionId
            DetailTab.SCHEDULE -> state.selectedScheduleDivisionId
            DetailTab.LEAGUES -> state.selectedStandingsDivisionId
            DetailTab.PARTICIPANTS -> selectedParticipantsDivisionId
                ?: state.selectedDivisionId
        }
        val divisionOptionsForTab = when (selectedTab) {
            DetailTab.BRACKET -> bracketTabDivisionOptions
            DetailTab.SCHEDULE -> if (
                state.tournamentPoolPlayEnabled &&
                state.tournamentBracketDivisionOptions.isNotEmpty()
            ) {
                state.tournamentBracketDivisionOptions
            } else {
                state.joinDivisionOptions
            }
            DetailTab.LEAGUES -> state.standingsTabDivisionOptions
            DetailTab.PARTICIPANTS -> participantsTabDivisionOptions
        }.distinctById()
        val divisionState = buildSelectedDivisionPillState(
            selectedDivisionId = selectedDivisionForTab,
            options = divisionOptionsForTab,
            divisionDetails = state.selectedEvent.event.divisionDetails,
            singleDivision = state.selectedEvent.event.singleDivision,
        )
        val poolState = when (selectedTab) {
            DetailTab.SCHEDULE -> {
                if (state.tournamentPoolPlayEnabled && state.schedulePoolDivisionOptions.isNotEmpty()) {
                    buildSelectedDivisionPillState(
                        selectedDivisionId = state.selectedSchedulePoolDivisionId
                            ?: AllPoolsDivisionOptionId,
                        options = listOf(
                            BracketDivisionOption(
                                id = AllPoolsDivisionOptionId,
                                label = "All pools",
                            ),
                        ) + state.schedulePoolDivisionOptions,
                        divisionDetails = state.selectedEvent.event.divisionDetails,
                        singleDivision = false,
                    )
                } else {
                    null
                }
            }
            DetailTab.LEAGUES -> {
                if (state.tournamentPoolPlayEnabled && state.standingsPoolDivisionOptions.isNotEmpty()) {
                    buildSelectedDivisionPillState(
                        selectedDivisionId = state.selectedStandingsDataDivisionId
                            ?: state.selectedStandingsPoolDivisionId,
                        options = state.standingsPoolDivisionOptions,
                        divisionDetails = state.selectedEvent.event.divisionDetails,
                        singleDivision = false,
                    )
                } else {
                    null
                }
            }
            DetailTab.BRACKET,
            DetailTab.PARTICIPANTS,
            -> null
        }
        if (divisionState == null && poolState == null) {
            null
        } else {
            SelectedDivisionSelectorState(
                divisionState = divisionState,
                poolState = poolState,
            )
        }
    }
    val tabContentTopOffset = if (selectedDivisionSelectorState != null) {
        DivisionPillContentTopOffset
    } else {
        0.dp
    }
    val selectedTabContentTarget = selectedEventDetailTabGuideTarget(selectedTab)
    val selectedTabGuideId = remember(selectedTab, state.guideEventId) {
        when (selectedTab) {
            DetailTab.BRACKET -> EventGuideIds.eventBracketTab(state.guideEventId)
            DetailTab.SCHEDULE -> EventGuideIds.eventScheduleTab(state.guideEventId)
            DetailTab.LEAGUES -> EventGuideIds.eventStandingsTab(state.guideEventId)
            DetailTab.PARTICIPANTS -> EventGuideIds.eventParticipantsTab(state.guideEventId)
        }
    }
    val selectedTabGuide = remember(selectedTab, selectedTabGuideId) {
        when (selectedTab) {
            DetailTab.BRACKET -> eventBracketTabGuide(selectedTabGuideId)
            DetailTab.SCHEDULE -> eventScheduleTabGuide(selectedTabGuideId)
            DetailTab.LEAGUES -> eventStandingsTabGuide(selectedTabGuideId)
            DetailTab.PARTICIPANTS -> eventParticipantsTabGuide(selectedTabGuideId)
        }
    }
    val guideController = LocalGuideController.current
    val completedGuideIds = guideController?.completedGuideIds.orEmpty()
    val hasDetailTabsTarget = guideController?.hasTarget(EventGuideTargets.DetailTabs) == true
    val hasSelectedTabContentTarget = guideController?.hasTarget(selectedTabContentTarget) == true
    val hasDivisionSelectorTarget =
        guideController?.hasTarget(EventGuideTargets.DetailDivisionSelector) == true
    val selectedTabGuideRequiredTargets = remember(selectedTab, selectedTabContentTarget) {
        eventDetailTabGuideRequiredTargetIds(
            selectedTab = selectedTab,
            selectedTabContentTarget = selectedTabContentTarget,
        )
    }
    LaunchedEffect(
        guideController,
        state.guideEventId,
        selectedTab,
        state.showDetails,
        state.isEditing,
        state.showMap,
        state.canStartGuide,
        selectedTabGuideId,
        completedGuideIds,
        hasDetailTabsTarget,
        hasSelectedTabContentTarget,
        hasDivisionSelectorTarget,
        selectedTabGuideRequiredTargets,
    ) {
        val controller = guideController ?: return@LaunchedEffect
        if (state.guideEventId.isBlank()) return@LaunchedEffect
        if (!state.showDetails || state.isEditing || state.showMap || !state.canStartGuide) {
            return@LaunchedEffect
        }
        controller.maybeStartGuide(
            guide = selectedTabGuide,
            requiredTargetIds = selectedTabGuideRequiredTargets,
        )
    }

    EventDetailTabsHost(
        state = EventDetailTabsHostState(
            availableTabs = availableTabs,
            selectedTab = selectedTab,
            selectedDivisionSelectorState = selectedDivisionSelectorState,
            tabContentTopOffset = tabContentTopOffset,
            showFab = showFab,
            isDetailDockExpanded = isDetailDockExpanded,
            selectedEvent = state.selectedEvent,
            tournamentPoolPlayEnabled = state.tournamentPoolPlayEnabled,
            selectedSchedulePoolDivisionId = state.selectedSchedulePoolDivisionId,
            selectedScheduleDivisionId = state.selectedScheduleDivisionId,
            schedulePoolDivisionOptions = state.schedulePoolDivisionOptions,
            isWeeklyParentEvent = state.isWeeklyParentEvent,
            weeklyScheduleItems = state.weeklyScheduleItems,
            weeklyScheduleOptionsById = state.weeklyScheduleOptionsById,
            selectedWeeklyOccurrence = state.selectedWeeklyOccurrence,
            selectedWeeklyOccurrenceSummary = state.selectedWeeklyOccurrenceSummary,
            eventFields = state.eventFields,
            eventMatchesLoading = state.eventMatchesLoading,
            editableMatches = state.editableMatches,
            canEditMatches = state.canEditMatches,
            scheduleTrackedUserIds = state.scheduleTrackedUserIds,
            isEventOfficial = state.isEventOfficial,
            selectedStandingsDataDivisionId = state.selectedStandingsDataDivisionId,
            selectedStandingsDivisionId = state.selectedStandingsDivisionId,
            leagueDivisionStandings = state.leagueDivisionStandings,
            leagueStandings = state.leagueStandings,
            showStandingsDrawColumn = state.showStandingsDrawColumn,
            leagueStandingsConfirming = state.leagueStandingsConfirming,
            canManageLeagueStandings = state.canManageLeagueStandings,
            eventTeamsAndParticipantsLoading = state.eventTeamsAndParticipantsLoading,
            selectedParticipantsSection = selectedParticipantsSection,
            participantSections = participantSections,
            isManagingParticipants = isManagingParticipants,
            canManageParticipantsFromDock = state.canManageParticipantsFromDock,
            showEventCheckInBadges = state.showEventCheckInBadges,
            selectedParticipantsDivisionId = selectedParticipantsDivisionId,
            selectedDivisionId = state.selectedDivisionId,
            registrationDivisionOptions = state.registrationDivisionOptions,
            participantDivisionWarnings = state.participantDivisionWarnings,
            showLosersBracketSelector = showLosersBracketSelector,
            losersBracket = state.losersBracket,
            canManageMatchEditingFromDock = state.canManageMatchEditingFromDock,
            showScheduleMatchManagement = state.showScheduleMatchManagement,
            canConfirmLeagueResultsFromDock = state.canConfirmLeagueResultsFromDock,
            leagueDivisionStandingsLoading = state.leagueDivisionStandingsLoading,
        ),
        actions = EventDetailTabsHostActions(
            onTabSelected = { selectedTab = it },
            onShowFabChanged = { showFab = it },
            onDivisionSelected = { tab, divisionId ->
                when (tab) {
                    DetailTab.BRACKET,
                    DetailTab.PARTICIPANTS,
                    -> actions.onSelectDivision(divisionId)

                    DetailTab.SCHEDULE -> {
                        actions.onSchedulePoolSelected(null)
                        actions.onSelectDivision(divisionId)
                    }

                    DetailTab.LEAGUES -> {
                        actions.onStandingsPoolSelected(null)
                        actions.onSelectDivision(divisionId)
                    }
                }
            },
            onPoolSelected = { tab, poolDivisionId ->
                when (tab) {
                    DetailTab.SCHEDULE -> {
                        actions.onSchedulePoolSelected(
                            poolDivisionId.takeUnless { selectedId ->
                                selectedId == AllPoolsDivisionOptionId
                            },
                        )
                    }

                    DetailTab.LEAGUES -> {
                        actions.onStandingsPoolSelected(poolDivisionId)
                        actions.onSelectDivision(poolDivisionId)
                    }

                    DetailTab.BRACKET,
                    DetailTab.PARTICIPANTS,
                    -> Unit
                }
            },
            onWeeklySessionSelected = actions.onWeeklySessionSelected,
            onMatchSelected = actions.onMatchSelected,
            onEditBracketMatch = actions.onEditBracketMatch,
            onEditScheduleMatch = actions.onEditScheduleMatch,
            onSetLockForEditableMatches = actions.onSetLockForEditableMatches,
            onNavigateToChat = actions.onNavigateToChat,
            onMoveTeamParticipantDivision = actions.onMoveTeamParticipantDivision,
            onDetailDockExpandedChanged = { isDetailDockExpanded = it },
            onToggleLosersBracket = actions.onToggleLosersBracket,
            onStartEditingMatches = actions.onStartEditingMatches,
            onCancelEditingMatches = actions.onCancelEditingMatches,
            onCommitMatchChanges = actions.onCommitMatchChanges,
            onAddBracketMatch = actions.onAddBracketMatch,
            onAddScheduleMatch = actions.onAddScheduleMatch,
            onRequestStandingsConfirmation = actions.onRequestStandingsConfirmation,
            onParticipantsSectionSelected = { selectedParticipantsSection = it },
            onManagingParticipantsChanged = { isManaging ->
                isManagingParticipants = isManaging
                actions.onManagingParticipantsChanged(isManaging)
            },
            onInviteTeam = actions.onInviteTeam,
            onInvitePlayer = actions.onInvitePlayer,
            onClearSelectedWeeklyOccurrence = actions.onClearSelectedWeeklyOccurrence,
            onShowDetails = actions.onShowDetails,
        ),
        modifier = modifier,
    )
}
