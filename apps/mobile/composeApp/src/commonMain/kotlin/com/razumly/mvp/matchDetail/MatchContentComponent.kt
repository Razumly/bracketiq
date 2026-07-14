@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.instancekeeper.InstanceKeeper
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.isActive
import com.razumly.mvp.core.data.dataTypes.isCaptainOrManager
import com.razumly.mvp.core.data.dataTypes.isUserAssignedToOfficialSlot
import com.razumly.mvp.core.data.dataTypes.isUserCheckedInForOfficialSlot
import com.razumly.mvp.core.data.dataTypes.normalizedRole
import com.razumly.mvp.core.data.dataTypes.normalizedOfficialAssignments
import com.razumly.mvp.core.data.dataTypes.updateOfficialAssignmentCheckIn
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.core.network.dto.MatchRosterDto
import com.razumly.mvp.core.network.dto.MatchRostersResponseDto
import com.razumly.mvp.core.network.dto.TeamCheckInDto
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchActionOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.core.network.dto.MatchSegmentOperationDto
import com.razumly.mvp.eventDetail.resolveEventMatchRules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private const val LOCAL_MATCH_INCIDENT_PREFIX = "client:match-incident:"
private const val MATCH_INCIDENT_UPLOAD_PENDING = "PENDING"
private const val MATCH_INCIDENT_UPLOAD_FAILED = "FAILED"
private const val MATCH_INCIDENT_DELETE_PENDING = "DELETE_PENDING"
private const val MATCH_INCIDENT_DELETE_FAILED = "DELETE_FAILED"
private val INCIDENT_RETRY_DELAYS_MS = longArrayOf(3_000L, 15_000L, 30_000L)
private const val INCIDENT_CONFIRM_NO_PROGRESS_TIMEOUT_MS = 10_000L
private const val DIRECT_SCORE_DEBOUNCE_MS = 500L
private const val MATCH_CHECK_IN_RETRY_DELAY_MS = 3_000L
private const val MATCH_DETAIL_CLEANUP_KEY = "Cleanup_MatchDetail"
private const val MATCH_DETAIL_REALTIME_PAUSE_PREFIX = "match-detail-open:"
private const val OFFICIAL_MATCH_OPEN_MINUTES_BEFORE = 60

private fun incidentRetryDelayMs(attempt: Int): Long =
    INCIDENT_RETRY_DELAYS_MS[attempt.coerceIn(0, INCIDENT_RETRY_DELAYS_MS.lastIndex)]

internal fun isOfficialMatchWindowOpen(match: MatchMVP, now: Instant = Clock.System.now()): Boolean {
    val start = match.start ?: return true
    return now >= start - OFFICIAL_MATCH_OPEN_MINUTES_BEFORE.minutes
}

internal fun isTeamCheckInWindowOpen(match: MatchMVP, event: Event, now: Instant = Clock.System.now()): Boolean {
    val start = match.start ?: return true
    val openMinutes = event.teamCheckInOpenMinutesBefore.coerceAtLeast(0)
    return now >= start - openMinutes.minutes
}

interface MatchContentComponent {
    val matchWithTeams: StateFlow<MatchWithTeams>
    val event: StateFlow<Event?>
    val matchRules: StateFlow<ResolvedMatchRulesMVP>
    val officialUsers: StateFlow<Map<String, UserData>>
    val matchFinished: StateFlow<Boolean>
    val officialCheckedIn: StateFlow<Boolean>
    val officialCheckInSaving: StateFlow<Boolean>
    val matchStartSaving: StateFlow<Boolean>
    val matchTimeSaving: StateFlow<Boolean>
    val matchActionSaving: StateFlow<Boolean>
    val segmentConfirmSaving: StateFlow<Boolean>
    val currentSet: StateFlow<Int>
    val isOfficial: StateFlow<Boolean>
    val canManageMatchActions: StateFlow<Boolean>
    val assignedTeamOfficialPendingCheckIn: StateFlow<Boolean>
    val showOfficialCheckInDialog: StateFlow<Boolean>
    val matchTeamCheckIns: StateFlow<Map<String, TeamCheckInDto>>
    val showTeamCheckInDialog: StateFlow<Boolean>
    val teamCheckInSaving: StateFlow<Boolean>
    val currentUserManagedMatchTeamId: StateFlow<String?>
    val matchRosters: StateFlow<MatchRostersResponseDto?>
    val matchRosterLoading: StateFlow<Boolean>
    val matchRosterSaving: StateFlow<Boolean>
    val showMatchRosterDialog: StateFlow<Boolean>
    val errorState: StateFlow<String?>

    fun dismissOfficialDialog()
    fun dismissTeamCheckInDialog()
    fun confirmTeamCheckIn()
    fun openMatchRoster()
    fun dismissMatchRoster()
    fun refreshMatchRosters()
    fun removeMatchRosterPlayer(eventTeamId: String, userId: String)
    fun restoreMatchRosterPlayer(eventTeamId: String, userId: String)
    fun addTemporaryMatchRosterPlayer(
        eventTeamId: String,
        firstName: String?,
        lastName: String?,
        email: String?,
        entryId: String? = null,
    )
    fun checkOfficialStatus()
    fun confirmOfficialCheckIn()
    fun markMatchDelayed()
    fun forfeitTeam(eventTeamId: String)
    fun cancelMatch()
    fun suspendMatch()
    fun resumeMatch()
    fun startMatch()
    fun resetMatchTimer()
    fun updateActualTimes(actualStart: Instant?, actualEnd: Instant?)
    fun selectSegment(index: Int)
    fun updateScore(isTeam1: Boolean, increment: Boolean)
    fun recordPointIncident(
        isTeam1: Boolean,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
        clockInput: String? = null,
        note: String?,
    )
    fun recordMatchIncident(
        eventTeamId: String?,
        incidentType: String,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
        clockInput: String? = null,
        note: String?,
    )
    fun removeMatchIncident(incidentId: String)
    fun completeCurrentSet()
}


@Serializable
data class MatchWithTeams(
    val match: MatchMVP,
    val field: Field?,
    val winnerNextMatch: MatchMVP?,
    val loserNextMatch: MatchMVP?,
    val previousLeftMatch: MatchMVP?,
    val previousRightMatch: MatchMVP?,
    val team1: TeamWithRelations?,
    val team2: TeamWithRelations?,
    val teamOfficial: TeamWithRelations?
)

fun MatchWithRelations.toMatchWithTeams(
    team1: TeamWithRelations?, team2: TeamWithRelations?, teamOfficial: TeamWithRelations?
) = MatchWithTeams(
    match = this.match,
    field = this.field,
    winnerNextMatch = this.winnerNextMatch,
    loserNextMatch = this.loserNextMatch,
    previousLeftMatch = this.previousLeftMatch,
    previousRightMatch = this.previousRightMatch,
    team1 = team1,
    team2 = team2,
    teamOfficial = teamOfficial
)

private fun TeamWithRelations.isCurrentUserTeam(userId: String): Boolean {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return false

    return team.isCaptainOrManager(normalizedUserId) ||
        team.playerIds.any { playerId -> playerId.trim() == normalizedUserId } ||
        team.coachIds.any { coachId -> coachId.trim() == normalizedUserId } ||
        team.headCoachId?.trim() == normalizedUserId ||
        players.any { player -> player.id.trim() == normalizedUserId }
}

private fun TeamWithRelations.isCurrentUserManagerOrCoach(userId: String): Boolean {
    val normalizedUserId = userId.trim()
    if (normalizedUserId.isBlank()) return false
    return team.managerId?.trim() == normalizedUserId ||
        team.headCoachId?.trim() == normalizedUserId ||
        team.coachIds.any { coachId -> coachId.trim() == normalizedUserId } ||
        team.staffAssignments.any { assignment ->
            assignment.userId.trim() == normalizedUserId &&
                assignment.isActive() &&
                assignment.normalizedRole() in setOf("MANAGER", "HEAD_COACH", "ASSISTANT_COACH")
        }
}

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultMatchContentComponent(
    componentContext: ComponentContext,
    selectedMatchId: String,
    selectedEventId: String,
    eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
) : MatchContentComponent, ComponentContext by componentContext {

    private val selectedMatch = MatchWithRelations(
        match = MatchMVP(
            matchId = 0,
            eventId = selectedEventId.trim(),
            id = selectedMatchId.trim(),
        ),
        field = null,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        winnerNextMatch = null,
        loserNextMatch = null,
        previousLeftMatch = null,
        previousRightMatch = null,
    )
    private val selectedEvent = selectedEventId.trim()
        .takeIf(String::isNotBlank)
        ?.let { eventId -> Event(id = eventId) }

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    override val event =
        eventRepository.getEventWithRelationsFlow(selectedMatch.match.eventId)
            .distinctUntilChanged()
            .map { eventResult ->
                eventResult.map { it.event }.getOrElse {
                    if (it !is NoSuchElementException) {
                        _errorState.value = it.userMessage()
                    }
                    selectedEvent
                }
            }.stateIn(scope, SharingStarted.Eagerly, selectedEvent)

    private val _optimisticMatch = MutableStateFlow<MatchWithTeams?>(null)
    private val selectedMatchForRealtime = selectedMatch.match
    private val realtimePauseReason = "$MATCH_DETAIL_REALTIME_PAUSE_PREFIX${selectedMatch.match.id}"
    private val localMatchSaveMutex = Mutex()
    private val incidentQueueMutex = Mutex()
    private var localMatchSaveVersion = 0L
    private var directScoreSyncJob: Job? = null
    private var directScoreEditVersion = 0L
    private var directScoreInvalidatedThroughVersion = 0L
    private var pendingDirectScoreSync: PendingDirectScoreSync? = null
    private var incidentQueueRetryJob: Job? = null
    private var incidentRetryAttempt = 0
    private var incidentQueueStartupDrainMatchId: String? = null

    override val matchWithTeams = _optimisticMatch.flatMapLatest { optimisticMatch ->
        if (optimisticMatch != null) {
            flowOf(optimisticMatch)
        } else {
            matchRepository.getMatchFlow(selectedMatch.match.id).distinctUntilChanged()
                .flatMapLatest { dbResult ->
                    val baseMatch = dbResult.getOrElse {
                        if (it !is NoSuchElementException) {
                            _errorState.value = it.userMessage()
                        }
                        selectedMatch
                    }

                    val team1Flow = baseMatch.match.team1Id?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    val team2Flow = baseMatch.match.team2Id?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    val teamOfficialFlow = baseMatch.match.teamOfficialId?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    combine(team1Flow, team2Flow, teamOfficialFlow) { team1Result, team2Result, teamOfficialResult ->
                        val normalizedMatch = updateMatchStructureForCurrentContext(baseMatch.match)
                        baseMatch.toMatchWithTeams(
                            team1 = team1Result.getOrNull(),
                            team2 = team2Result.getOrNull(),
                            teamOfficial = teamOfficialResult.getOrNull()
                        ).copy(match = normalizedMatch)
                    }
                }
        }
    }.stateIn(
        scope,
        SharingStarted.Eagerly,
        selectedMatch.toMatchWithTeams(null, null, null)
            .copy(match = updateMatchStructureForCurrentContext(selectedMatch.match)),
    )

    override val matchRules = combine(matchWithTeams, event) { currentMatch, currentEvent ->
        resolveActiveRules(currentMatch.match, currentEvent)
    }.stateIn(
        scope,
        SharingStarted.Eagerly,
        resolveActiveRules(selectedMatch.match, selectedEvent),
    )

    private val _matchFinished = MutableStateFlow(false)
    override val matchFinished = _matchFinished.asStateFlow()

    private val _officialCheckedIn = MutableStateFlow(selectedMatch.match.officialCheckedIn ?: false)
    override val officialCheckedIn: StateFlow<Boolean> = _officialCheckedIn.asStateFlow()

    private val _officialCheckInSaving = MutableStateFlow(false)
    override val officialCheckInSaving: StateFlow<Boolean> = _officialCheckInSaving.asStateFlow()

    private val _matchStartSaving = MutableStateFlow(false)
    override val matchStartSaving: StateFlow<Boolean> = _matchStartSaving.asStateFlow()

    private val _matchTimeSaving = MutableStateFlow(false)
    override val matchTimeSaving: StateFlow<Boolean> = _matchTimeSaving.asStateFlow()

    private val _matchActionSaving = MutableStateFlow(false)
    override val matchActionSaving: StateFlow<Boolean> = _matchActionSaving.asStateFlow()

    private val _segmentConfirmSaving = MutableStateFlow(false)
    override val segmentConfirmSaving: StateFlow<Boolean> = _segmentConfirmSaving.asStateFlow()

    private val _currentSet = MutableStateFlow(0)
    override val currentSet = _currentSet.asStateFlow()

    private val _isOfficial = MutableStateFlow(false)
    override val isOfficial = _isOfficial.asStateFlow()

    private val _canManageMatchActions = MutableStateFlow(false)
    override val canManageMatchActions = _canManageMatchActions.asStateFlow()

    private val _assignedTeamOfficialPendingCheckIn = MutableStateFlow(false)
    override val assignedTeamOfficialPendingCheckIn = _assignedTeamOfficialPendingCheckIn.asStateFlow()

    private val _showOfficialCheckInDialog = MutableStateFlow(false)
    override val showOfficialCheckInDialog = _showOfficialCheckInDialog.asStateFlow()
    private val shownOfficialCheckInPromptKeys = mutableSetOf<String>()
    private val confirmedOfficialCheckInPromptKeys = mutableSetOf<String>()

    private val _matchTeamCheckIns = MutableStateFlow<Map<String, TeamCheckInDto>>(emptyMap())
    override val matchTeamCheckIns = _matchTeamCheckIns.asStateFlow()

    private val _showTeamCheckInDialog = MutableStateFlow(false)
    override val showTeamCheckInDialog = _showTeamCheckInDialog.asStateFlow()

    private val _teamCheckInSaving = MutableStateFlow(false)
    override val teamCheckInSaving = _teamCheckInSaving.asStateFlow()

    private val _currentUserManagedMatchTeamId = MutableStateFlow<String?>(null)
    override val currentUserManagedMatchTeamId = _currentUserManagedMatchTeamId.asStateFlow()

    private val _matchRosters = MutableStateFlow<MatchRostersResponseDto?>(null)
    override val matchRosters = _matchRosters.asStateFlow()

    private val _matchRosterLoading = MutableStateFlow(false)
    override val matchRosterLoading = _matchRosterLoading.asStateFlow()

    private val _matchRosterSaving = MutableStateFlow(false)
    override val matchRosterSaving = _matchRosterSaving.asStateFlow()

    private val _showMatchRosterDialog = MutableStateFlow(false)
    override val showMatchRosterDialog = _showMatchRosterDialog.asStateFlow()

    private val shownTeamCheckInPromptKeys = mutableSetOf<String>()
    private val confirmedTeamCheckInPromptKeys = mutableSetOf<String>()
    private var lastLoadedMatchCheckInKey: String? = null
    private var scheduledMatchCheckInRetryKey: String? = null

    private val currentUserState = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())
    private val currentUser: UserData
        get() = currentUserState.value

    override val officialUsers = combine(matchWithTeams, event, currentUserState) { currentMatch, currentEvent, currentUser ->
        OfficialUserLookup(
            userIds = officialUserIdsForMatch(currentMatch.match),
            eventId = currentEvent?.id ?: currentMatch.match.eventId,
            currentUser = currentUser,
        )
    }
        .distinctUntilChanged()
        .flatMapLatest { lookup ->
            if (lookup.userIds.isEmpty()) {
                flowOf(emptyMap())
            } else {
                userRepository.getUsersFlow(
                    userIds = lookup.userIds,
                    visibilityContext = UserVisibilityContext(eventId = lookup.eventId),
                ).map { result ->
                    val resolvedUsers = result.getOrElse {
                        _errorState.value = it.userMessage()
                        emptyList()
                    }.associateBy(UserData::id)
                    val currentUserId = lookup.currentUser.id.trim()
                    if (currentUserId.isNotBlank() && currentUserId in lookup.userIds && currentUserId !in resolvedUsers) {
                        resolvedUsers + (currentUserId to lookup.currentUser)
                    } else {
                        resolvedUsers
                    }
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyMap())

    private val _currentUserTeams = currentUserState
        .map { user -> user.id.trim() }
        .distinctUntilChanged()
        .flatMapLatest { currentUserId ->
            if (currentUserId.isBlank()) {
                flowOf(Result.success(emptyList()))
            } else {
                teamRepository.getTeamsWithPlayersFlow(currentUserId)
            }
        }.map { teamResults ->
            teamResults.getOrElse {
                _errorState.value = it.userMessage()
                emptyList()
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private var maxSets = 1

    private var setsNeeded = 1

    init {
        instanceKeeper.put(MATCH_DETAIL_CLEANUP_KEY, Cleanup(matchRepository, realtimePauseReason))
        scope.launch {
            _isOfficial.collect { ownsMatchEditing ->
                if (ownsMatchEditing) {
                    matchRepository.setIgnoreMatch(selectedMatchForRealtime)
                    matchRepository.setRealtimePaused(realtimePauseReason, true)
                } else {
                    matchRepository.setIgnoreMatch(null)
                    matchRepository.setRealtimePaused(realtimePauseReason, false)
                }
            }
        }
        scope.launch {
            event.collect {
                val normalizedMatch = updateMatchStructureForCurrentContext(matchWithTeams.value.match)
                _matchFinished.value = isMatchOver(normalizedMatch)
                if (!_matchFinished.value) {
                    _currentSet.value = resolveCurrentSegmentIndex(normalizedMatch)
                }
                checkOfficialStatus()
                updateMatchActionAccess()
                updateCurrentUserManagedMatchTeam()
                refreshMatchCheckInsIfAllowed()
                evaluateTeamCheckInPrompt()
            }
        }
        scope.launch {
            matchWithTeams.collect {
                val normalizedMatch = updateMatchStructureForCurrentContext(it.match)
                _matchFinished.value = isMatchOver(normalizedMatch)
                if (!_matchFinished.value) {
                    _currentSet.value = resolveCurrentSegmentIndex(normalizedMatch)
                }
                checkOfficialStatus()
                updateMatchActionAccess()
                updateCurrentUserManagedMatchTeam()
                refreshMatchCheckInsIfAllowed()
                evaluateTeamCheckInPrompt()
            }
        }
        scope.launch {
            _currentUserTeams.collect {
                checkOfficialStatus()
                updateMatchActionAccess()
                updateCurrentUserManagedMatchTeam()
                evaluateTeamCheckInPrompt()
            }
        }
    }

    override fun dismissOfficialDialog() {
        _showOfficialCheckInDialog.value = false
    }

    override fun dismissTeamCheckInDialog() {
        _showTeamCheckInDialog.value = false
        if (canOpenMatchRoster()) {
            openMatchRoster()
        }
    }

    override fun confirmTeamCheckIn() {
        if (_teamCheckInSaving.value) return
        val currentEvent = event.value ?: return
        val currentMatch = matchWithTeams.value.match
        val eventTeamId = _currentUserManagedMatchTeamId.value ?: resolveCurrentUserManagedMatchTeamId()
        if (!isMatchTeamCheckInEnabled(currentEvent) || eventTeamId.isNullOrBlank()) {
            _showTeamCheckInDialog.value = false
            return
        }
        if (!isTeamCheckInWindowOpen(currentMatch, currentEvent)) {
            _showTeamCheckInDialog.value = false
            _errorState.value = "Team check-in is not open yet."
            return
        }
        _teamCheckInSaving.value = true
        scope.launch {
            try {
                matchRepository.checkInMatchTeam(
                    eventId = currentEvent.id,
                    matchId = currentMatch.id,
                    eventTeamId = eventTeamId,
                ).onSuccess { checkIn ->
                    confirmedTeamCheckInPromptKeys += teamCheckInPromptKey(currentMatch.id, eventTeamId)
                    _matchTeamCheckIns.value = _matchTeamCheckIns.value + (eventTeamId to checkIn)
                    _showTeamCheckInDialog.value = false
                    if (canOpenMatchRoster()) {
                        openMatchRoster()
                    }
                }.onFailure { error ->
                    _errorState.value = "Failed to check in team: ${error.userMessage()}"
                }
            } finally {
                _teamCheckInSaving.value = false
            }
        }
    }

    override fun openMatchRoster() {
        if (!canOpenMatchRoster()) return
        _showMatchRosterDialog.value = true
        refreshMatchRosters()
    }

    override fun dismissMatchRoster() {
        _showMatchRosterDialog.value = false
    }

    override fun refreshMatchRosters() {
        val currentEvent = event.value ?: return
        val currentMatch = matchWithTeams.value.match
        if (!canOpenMatchRoster()) return
        if (_matchRosterLoading.value) return
        _matchRosterLoading.value = true
        scope.launch {
            try {
                matchRepository.getMatchRosters(
                    eventId = currentEvent.id,
                    matchId = currentMatch.id,
                ).onSuccess { rosters ->
                    _matchRosters.value = rosters
                }.onFailure { error ->
                    _errorState.value = "Failed to load match roster: ${error.userMessage()}"
                }
            } finally {
                _matchRosterLoading.value = false
            }
        }
    }

    override fun removeMatchRosterPlayer(eventTeamId: String, userId: String) {
        updateRoster {
            matchRepository.removeMatchRosterPlayer(
                eventId = event.value?.id.orEmpty(),
                matchId = matchWithTeams.value.match.id,
                eventTeamId = eventTeamId,
                userId = userId,
            )
        }
    }

    override fun restoreMatchRosterPlayer(eventTeamId: String, userId: String) {
        updateRoster {
            matchRepository.restoreMatchRosterPlayer(
                eventId = event.value?.id.orEmpty(),
                matchId = matchWithTeams.value.match.id,
                eventTeamId = eventTeamId,
                userId = userId,
            )
        }
    }

    override fun addTemporaryMatchRosterPlayer(
        eventTeamId: String,
        firstName: String?,
        lastName: String?,
        email: String?,
        entryId: String?,
    ) {
        updateRoster {
            matchRepository.addTemporaryMatchRosterPlayer(
                eventId = event.value?.id.orEmpty(),
                matchId = matchWithTeams.value.match.id,
                eventTeamId = eventTeamId,
                firstName = firstName,
                lastName = lastName,
                email = email,
                entryId = entryId,
            )
        }
    }

    private fun updateRoster(updateCall: suspend () -> Result<MatchRosterDto>) {
        if (_matchRosterSaving.value) return
        _matchRosterSaving.value = true
        scope.launch {
            try {
                updateCall().onSuccess { roster ->
                    mergeRoster(roster)
                }.onFailure { error ->
                    _errorState.value = "Failed to update match roster: ${error.userMessage()}"
                }
            } finally {
                _matchRosterSaving.value = false
            }
        }
    }

    private fun mergeRoster(roster: MatchRosterDto) {
        val existing = _matchRosters.value
        _matchRosters.value = if (existing == null) {
            MatchRostersResponseDto(rosters = listOf(roster))
        } else {
            existing.copy(
                rosters = existing.rosters
                    .filterNot { it.eventTeamId == roster.eventTeamId } + roster,
            )
        }
    }

    override fun checkOfficialStatus() {
        val currentMatch = matchWithTeams.value.match
        val teamOfficialId = normalizeOptionalId(currentMatch.teamOfficialId)
        val teamIds = currentUserTeamIds().toSet()
        val isAssignedTeamOfficial = teamOfficialId != null && (
            teamIds.contains(teamOfficialId) ||
                matchWithTeams.value.teamOfficial?.isCurrentUserTeam(currentUser.id) == true
            )
        val isAssignedUserOfficial = currentMatch.isUserAssignedToOfficialSlot(currentUser.id)
        val officialWindowOpen = isOfficialMatchWindowOpen(currentMatch)
        val canCheckIn = canCheckIntoMatch(currentMatch) && officialWindowOpen
        val rawCheckedIn = when {
            isAssignedUserOfficial -> currentMatch.isUserCheckedInForOfficialSlot(currentUser.id)
            else -> currentMatch.officialCheckedIn == true
        }
        val assignedPromptKey = if (isAssignedTeamOfficial || isAssignedUserOfficial) {
            officialCheckInPromptKey(
                match = currentMatch,
                teamOfficialId = teamOfficialId,
                isAssignedTeamOfficial = isAssignedTeamOfficial,
                isAssignedUserOfficial = isAssignedUserOfficial,
                canSwapIntoOfficial = false,
            )
        } else {
            null
        }
        val checkedIn = rawCheckedIn || (assignedPromptKey != null && assignedPromptKey in confirmedOfficialCheckInPromptKeys)
        val canSwapIntoOfficial = !checkedIn && canCurrentUserSwapIntoOfficial(currentMatch)
        val isOfficial = isAssignedTeamOfficial || isAssignedUserOfficial
        val shouldShowPrompt = canCheckIn && !checkedIn && (isOfficial || canSwapIntoOfficial)

        _isOfficial.value = isOfficial
        _officialCheckedIn.value = checkedIn
        _assignedTeamOfficialPendingCheckIn.value = canCheckIn && !checkedIn && isAssignedTeamOfficial
        resumePersistedIncidentQueueIfNeeded()
        if (!shouldShowPrompt) {
            _showOfficialCheckInDialog.value = false
            return
        }

        val promptKey = officialCheckInPromptKey(
            match = currentMatch,
            teamOfficialId = teamOfficialId,
            isAssignedTeamOfficial = isAssignedTeamOfficial,
            isAssignedUserOfficial = isAssignedUserOfficial,
            canSwapIntoOfficial = canSwapIntoOfficial,
        )
        val isNewPrompt = shownOfficialCheckInPromptKeys.add(promptKey)
        if (_showOfficialCheckInDialog.value || isNewPrompt) {
            _showOfficialCheckInDialog.value = true
        }
    }

    private fun officialCheckInPromptKey(
        match: MatchMVP,
        teamOfficialId: String?,
        isAssignedTeamOfficial: Boolean,
        isAssignedUserOfficial: Boolean,
        canSwapIntoOfficial: Boolean,
    ): String {
        val currentUserId = currentUser.id.trim()
        val roleKey = when {
            isAssignedUserOfficial -> "assigned-user"
            isAssignedTeamOfficial -> "assigned-team"
            canSwapIntoOfficial -> "swap-team"
            else -> "unknown"
        }
        val currentUserEventTeamId = when {
            isAssignedTeamOfficial -> teamOfficialId
            canSwapIntoOfficial -> resolveCurrentUserEventTeamId(match)
            else -> null
        }
        val assignmentKey = if (isAssignedUserOfficial) {
            match.normalizedOfficialAssignments()
                .filter { assignment -> assignment.userId == currentUserId }
                .joinToString("|") { assignment ->
                    "${assignment.positionId}:${assignment.slotIndex}:${assignment.holderType}:${assignment.eventOfficialId.orEmpty()}"
                }
                .ifBlank { "legacy:${match.officialId?.trim().orEmpty()}" }
        } else {
            ""
        }

        return listOf(
            match.id,
            currentUserId,
            roleKey,
            teamOfficialId.orEmpty(),
            currentUserEventTeamId.orEmpty(),
            assignmentKey,
        ).joinToString("::")
    }

    private fun markOfficialCheckInConfirmed(match: MatchMVP) {
        val teamOfficialId = normalizeOptionalId(match.teamOfficialId)
        val isAssignedTeamOfficial = teamOfficialId != null && (
            currentUserTeamIds().contains(teamOfficialId) ||
                matchWithTeams.value.teamOfficial?.isCurrentUserTeam(currentUser.id) == true
            )
        val isAssignedUserOfficial = match.isUserAssignedToOfficialSlot(currentUser.id)
        if (!isAssignedTeamOfficial && !isAssignedUserOfficial) {
            return
        }
        confirmedOfficialCheckInPromptKeys += officialCheckInPromptKey(
            match = match,
            teamOfficialId = teamOfficialId,
            isAssignedTeamOfficial = isAssignedTeamOfficial,
            isAssignedUserOfficial = isAssignedUserOfficial,
            canSwapIntoOfficial = false,
        )
    }

    override fun confirmOfficialCheckIn() {
        if (_officialCheckInSaving.value) return
        _officialCheckInSaving.value = true
        scope.launch {
            try {
                val currentMatch = matchWithTeams.value.match
                val teamIds = currentUserTeamIds().toSet()
                val currentTeamOfficialId = normalizeOptionalId(currentMatch.teamOfficialId)
                val isAssignedTeamOfficial =
                    currentTeamOfficialId != null && (
                        teamIds.contains(currentTeamOfficialId) ||
                            matchWithTeams.value.teamOfficial?.isCurrentUserTeam(currentUser.id) == true
                    )
                val isAssignedUserOfficial = currentMatch.isUserAssignedToOfficialSlot(currentUser.id)
                val canSwap = canCurrentUserSwapIntoOfficial(currentMatch)
                if (!canCheckIntoMatch(currentMatch)) {
                    dismissOfficialDialog()
                    _errorState.value = "Officials can only check in after both teams are assigned."
                    return@launch
                }
                if (!isOfficialMatchWindowOpen(currentMatch)) {
                    dismissOfficialDialog()
                    _errorState.value = "Official check-in opens one hour before the scheduled match start."
                    return@launch
                }
                val checkedIn = when {
                    isAssignedUserOfficial -> currentMatch.isUserCheckedInForOfficialSlot(currentUser.id)
                    else -> currentMatch.officialCheckedIn == true
                }

                if (checkedIn) {
                    dismissOfficialDialog()
                    _officialCheckedIn.value = true
                    _assignedTeamOfficialPendingCheckIn.value = false
                    return@launch
                }

                if (!isAssignedTeamOfficial && !isAssignedUserOfficial && !canSwap) {
                    dismissOfficialDialog()
                    _errorState.value = "Only teams in this event can officiate this match."
                    return@launch
                }

                if (isAssignedTeamOfficial || isAssignedUserOfficial) {
                    val updatedMatch = matchWithTeams.value.copy(
                        match = if (isAssignedUserOfficial) {
                            currentMatch.updateOfficialAssignmentCheckIn(
                                userId = currentUser.id,
                                checkedIn = true,
                            )
                        } else {
                            currentMatch.copy(officialCheckedIn = true)
                        },
                    )
                    matchRepository.updateMatch(updatedMatch.match).onSuccess {
                        markOfficialCheckInConfirmed(currentMatch)
                        dismissOfficialDialog()
                        _officialCheckedIn.value = true
                        _assignedTeamOfficialPendingCheckIn.value = false
                        _isOfficial.value = true
                    }.onFailure {
                        _errorState.value = it.userMessage()
                    }
                    return@launch
                }

                val currentUserEventTeamId = resolveCurrentUserEventTeamId(currentMatch)
                if (currentUserEventTeamId == null) {
                    _errorState.value = "Only teams in this event can officiate this match."
                    return@launch
                }

                val updatedMatch = matchWithTeams.value.copy(
                    match = currentMatch.copy(
                        teamOfficialId = currentUserEventTeamId,
                        officialCheckedIn = false,
                    ),
                )
                matchRepository.updateMatch(updatedMatch.match).onSuccess {
                    _isOfficial.value = true
                    _officialCheckedIn.value = false
                    _assignedTeamOfficialPendingCheckIn.value = true
                    _showOfficialCheckInDialog.value = true
                }.onFailure {
                    _errorState.value = it.userMessage()
                }
            } finally {
                _officialCheckInSaving.value = false
            }
        }
    }

    override fun markMatchDelayed() {
        if (_matchTimeSaving.value) return
        if (!isOfficial.value || officialCheckedIn.value != true || _matchFinished.value ||
            !isOfficialMatchWindowOpen(matchWithTeams.value.match)
        ) {
            return
        }

        _matchTimeSaving.value = true
        scope.launch {
            try {
                val currentMatchWithTeams = matchWithTeams.value
                val currentMatch = currentMatchWithTeams.match
                if (currentMatch.status.equals("DELAYED", ignoreCase = true)) {
                    return@launch
                }
                val updatedMatch = currentMatch.copy(status = "DELAYED")
                matchRepository.updateMatchOperations(
                    match = updatedMatch,
                    lifecycle = MatchLifecycleOperationDto(status = "DELAYED"),
                ).onSuccess { remoteMatch ->
                    val syncedMatch = remoteMatch.copy(status = updatedMatch.status)
                    _optimisticMatch.value = currentMatchWithTeams.copy(match = syncedMatch)
                    persistMatchLocally(syncedMatch, clearOptimisticOnSuccess = true)
                }.onFailure { error ->
                    _errorState.value = "Failed to mark match delayed: ${error.userMessage()}"
                }
            } finally {
                _matchTimeSaving.value = false
            }
        }
    }

    override fun forfeitTeam(eventTeamId: String) {
        applyMatchAction("FORFEIT", forfeitingEventTeamId = eventTeamId)
    }

    override fun cancelMatch() {
        applyMatchAction("CANCEL")
    }

    override fun suspendMatch() {
        applyMatchAction("SUSPEND")
    }

    override fun resumeMatch() {
        applyMatchAction("RESUME")
    }

    private fun applyMatchAction(
        action: String,
        forfeitingEventTeamId: String? = null,
    ) {
        if (_matchActionSaving.value) return
        if (!canApplyMatchAction()) {
            return
        }
        val currentMatchWithTeams = matchWithTeams.value
        val currentMatch = currentMatchWithTeams.match
        val teamIds = listOfNotNull(
            normalizeOptionalId(currentMatch.team1Id),
            normalizeOptionalId(currentMatch.team2Id),
        )
        val normalizedForfeitingTeamId = normalizeOptionalId(forfeitingEventTeamId)
        val winnerEventTeamId = when (action) {
            "FORFEIT" -> teamIds.firstOrNull { teamId -> teamId != normalizedForfeitingTeamId }
            else -> null
        }
        if (action == "FORFEIT" && winnerEventTeamId == null) {
            _errorState.value = "Choose a team to forfeit."
            return
        }

        _matchActionSaving.value = true
        scope.launch {
            try {
                val now = Clock.System.now().toString()
                val updatedMatch = when (action) {
                    "FORFEIT" -> currentMatch.copy(
                        status = "COMPLETE",
                        resultStatus = "FINAL",
                        resultType = "FORFEIT",
                        winnerEventTeamId = winnerEventTeamId,
                        actualEnd = currentMatch.actualEnd?.takeIf(String::isNotBlank) ?: now,
                        locked = true,
                    )
                    "CANCEL" -> currentMatch.copy(
                        status = "CANCELLED",
                        resultStatus = "NO_CONTEST",
                        resultType = "NO_CONTEST",
                        winnerEventTeamId = null,
                        actualEnd = currentMatch.actualEnd?.takeIf(String::isNotBlank) ?: now,
                        statusReason = "Cancelled",
                        locked = true,
                    )
                    "SUSPEND" -> currentMatch.copy(
                        status = "SUSPENDED",
                        statusReason = "Suspended",
                    )
                    "RESUME" -> currentMatch.copy(
                        status = if (currentMatch.actualStart.isNullOrBlank()) "READY" else "IN_PROGRESS",
                        statusReason = null,
                    )
                    else -> currentMatch
                }
                _optimisticMatch.value = currentMatchWithTeams.copy(match = updatedMatch)
                matchRepository.updateMatchOperations(
                    match = updatedMatch,
                    matchAction = MatchActionOperationDto(
                        action = action,
                        forfeitingEventTeamId = normalizedForfeitingTeamId,
                        winnerEventTeamId = winnerEventTeamId,
                    ),
                ).onSuccess { remoteMatch ->
                    val syncedMatch = remoteMatch.copy(
                        status = remoteMatch.status ?: updatedMatch.status,
                        resultStatus = remoteMatch.resultStatus ?: updatedMatch.resultStatus,
                        resultType = remoteMatch.resultType ?: updatedMatch.resultType,
                        winnerEventTeamId = remoteMatch.winnerEventTeamId ?: updatedMatch.winnerEventTeamId,
                        actualEnd = remoteMatch.actualEnd ?: updatedMatch.actualEnd,
                        statusReason = remoteMatch.statusReason ?: updatedMatch.statusReason,
                        locked = remoteMatch.locked || updatedMatch.locked,
                    )
                    _optimisticMatch.value = currentMatchWithTeams.copy(match = syncedMatch)
                    persistMatchLocally(syncedMatch, clearOptimisticOnSuccess = true)
                }.onFailure { error ->
                    _optimisticMatch.value = null
                    _errorState.value = "Failed to update match: ${error.userMessage()}"
                }
            } finally {
                _matchActionSaving.value = false
            }
        }
    }

    override fun startMatch() {
        if (_matchStartSaving.value) return
        val currentMatchWithTeams = matchWithTeams.value
        val currentMatch = updateMatchStructureForCurrentContext(currentMatchWithTeams.match)
        if (!isOfficial.value || officialCheckedIn.value != true || _matchFinished.value ||
            !isOfficialMatchWindowOpen(currentMatch)
        ) {
            return
        }
        val segmentIndex = currentSet.value.coerceIn(0, (currentMatch.segments.size - 1).coerceAtLeast(0))
        val activeSegment = currentMatch.segments.getOrNull(segmentIndex) ?: return
        if (!activeSegment.startedAt.isNullOrBlank() || activeSegment.status == "COMPLETE") {
            return
        }

        _matchStartSaving.value = true
        scope.launch {
            try {
                val startTime = Clock.System.now()
                val startedAt = startTime.toString()
                val updatedSegments = currentMatch.segments.toMutableList().apply {
                    this[segmentIndex] = activeSegment.copy(
                        status = "IN_PROGRESS",
                        startedAt = startedAt,
                        endedAt = null,
                    )
                }
                val updatedMatch = currentMatch.copy(
                    status = "IN_PROGRESS",
                    actualStart = currentMatch.actualStart?.takeIf(String::isNotBlank) ?: startedAt,
                    actualEnd = if (currentMatch.actualStart.isNullOrBlank()) null else currentMatch.actualEnd,
                    segments = updatedSegments,
                )
                matchRepository.updateMatchOperations(
                    match = updatedMatch,
                    lifecycle = if (currentMatch.actualStart.isNullOrBlank()) {
                        MatchLifecycleOperationDto(
                            status = "IN_PROGRESS",
                            actualStart = startedAt,
                            clearActualEnd = true,
                        )
                    } else {
                        null
                    },
                    segmentOperations = listOf(
                        MatchSegmentOperationDto(
                            id = updatedSegments[segmentIndex].id,
                            sequence = updatedSegments[segmentIndex].sequence,
                            status = updatedSegments[segmentIndex].status,
                            scores = updatedSegments[segmentIndex].scores,
                            winnerEventTeamId = updatedSegments[segmentIndex].winnerEventTeamId,
                            startedAt = startedAt,
                            clearEndedAt = true,
                        ),
                    ),
                ).onSuccess { remoteMatch ->
                    val syncedMatch = remoteMatch.copy(
                        status = updatedMatch.status,
                        actualStart = updatedMatch.actualStart,
                        actualEnd = updatedMatch.actualEnd,
                        segments = updatedSegments,
                    )
                    _optimisticMatch.value = currentMatchWithTeams.copy(match = syncedMatch)
                    persistMatchLocally(syncedMatch, clearOptimisticOnSuccess = true)
                }.onFailure { error ->
                    _errorState.value = "Failed to start timer: ${error.userMessage()}"
                }
            } finally {
                _matchStartSaving.value = false
            }
        }
    }

    override fun resetMatchTimer() {
        if (_matchStartSaving.value) return
        val currentMatchWithTeams = matchWithTeams.value
        val currentMatch = updateMatchStructureForCurrentContext(currentMatchWithTeams.match)
        if (!isOfficial.value || officialCheckedIn.value != true || _matchFinished.value ||
            !isOfficialMatchWindowOpen(currentMatch)
        ) {
            return
        }
        val segmentIndex = currentSet.value.coerceIn(0, (currentMatch.segments.size - 1).coerceAtLeast(0))
        val activeSegment = currentMatch.segments.getOrNull(segmentIndex) ?: return
        if (activeSegment.status == "COMPLETE") {
            return
        }
        val nextStatus = if (activeSegment.scores.values.any { score -> score > 0 }) "IN_PROGRESS" else "NOT_STARTED"
        val resetFirstSegment = activeSegment.sequence == 1 &&
            currentMatch.segments.none { segment -> segment.sequence < activeSegment.sequence && segment.status == "COMPLETE" }

        _matchStartSaving.value = true
        scope.launch {
            try {
                val updatedSegments = currentMatch.segments.toMutableList().apply {
                    this[segmentIndex] = activeSegment.copy(
                        status = nextStatus,
                        startedAt = null,
                        endedAt = null,
                    )
                }
                val updatedMatch = currentMatch.copy(
                    status = if (resetFirstSegment) "SCHEDULED" else currentMatch.status,
                    actualStart = if (resetFirstSegment) null else currentMatch.actualStart,
                    actualEnd = if (resetFirstSegment) null else currentMatch.actualEnd,
                    segments = updatedSegments,
                )
                matchRepository.updateMatchOperations(
                    match = updatedMatch,
                    lifecycle = if (resetFirstSegment) {
                        MatchLifecycleOperationDto(
                            status = "SCHEDULED",
                            clearActualStart = true,
                            clearActualEnd = true,
                        )
                    } else {
                        null
                    },
                    segmentOperations = listOf(
                        MatchSegmentOperationDto(
                            id = updatedSegments[segmentIndex].id,
                            sequence = updatedSegments[segmentIndex].sequence,
                            status = updatedSegments[segmentIndex].status,
                            scores = updatedSegments[segmentIndex].scores,
                            winnerEventTeamId = updatedSegments[segmentIndex].winnerEventTeamId,
                            clearStartedAt = true,
                            clearEndedAt = true,
                        ),
                    ),
                ).onSuccess { remoteMatch ->
                    val syncedMatch = remoteMatch.copy(
                        status = updatedMatch.status,
                        actualStart = updatedMatch.actualStart,
                        actualEnd = updatedMatch.actualEnd,
                        segments = updatedSegments,
                    )
                    _optimisticMatch.value = currentMatchWithTeams.copy(match = syncedMatch)
                    persistMatchLocally(syncedMatch, clearOptimisticOnSuccess = true)
                }.onFailure { error ->
                    _errorState.value = "Failed to reset timer: ${error.userMessage()}"
                }
            } finally {
                _matchStartSaving.value = false
            }
        }
    }

    override fun updateActualTimes(actualStart: Instant?, actualEnd: Instant?) {
        if (_matchTimeSaving.value) return
        if (!isOfficial.value || officialCheckedIn.value != true ||
            !isOfficialMatchWindowOpen(matchWithTeams.value.match)
        ) {
            return
        }
        if (actualStart != null && actualEnd != null && actualEnd <= actualStart) {
            _errorState.value = "Actual end time must be after the actual start time."
            return
        }

        _matchTimeSaving.value = true
        scope.launch {
            try {
                val currentMatch = matchWithTeams.value.match
                val updatedMatch = currentMatch.copy(
                    actualStart = actualStart?.toString(),
                    actualEnd = actualEnd?.toString(),
                )
                matchRepository.updateMatchOperations(
                    match = updatedMatch,
                    lifecycle = MatchLifecycleOperationDto(
                        actualStart = actualStart?.toString(),
                        actualEnd = actualEnd?.toString(),
                        clearActualStart = actualStart == null,
                        clearActualEnd = actualEnd == null,
                    ),
                ).onSuccess {
                    _optimisticMatch.value = null
                }.onFailure { error ->
                    _errorState.value = "Failed to update actual times: ${error.userMessage()}"
                }
            } finally {
                _matchTimeSaving.value = false
            }
        }
    }

    override fun selectSegment(index: Int) {
        val normalizedMatch = updateMatchStructureForCurrentContext(matchWithTeams.value.match)
        val maxIndex = (normalizedMatch.segments.size - 1).coerceAtLeast(0)
        _currentSet.value = index.coerceIn(0, maxIndex)
    }

    private fun currentUserTeamIds(): List<String> {
        val repositoryTeamIds = _currentUserTeams.value
            .map { team -> team.team.id.trim() }
            .filter(String::isNotBlank)
        val profileTeamIds = currentUser.teamIds
            .map { teamId -> teamId.trim() }
            .filter(String::isNotBlank)
        return (repositoryTeamIds + profileTeamIds).distinct()
    }

    private fun updateCurrentUserManagedMatchTeam() {
        _currentUserManagedMatchTeamId.value = resolveCurrentUserManagedMatchTeamId()
    }

    private fun resolveCurrentUserManagedMatchTeamId(): String? {
        val currentMatch = matchWithTeams.value
        val currentUserId = currentUser.id.trim()
        if (currentUserId.isBlank()) return null
        return listOf(currentMatch.team1, currentMatch.team2)
            .firstOrNull { team ->
                team != null &&
                    team.team.id in setOfNotNull(
                        normalizeOptionalId(currentMatch.match.team1Id),
                        normalizeOptionalId(currentMatch.match.team2Id),
                    ) &&
                    team.isCurrentUserManagerOrCoach(currentUserId)
            }
            ?.team
            ?.id
    }

    private fun isMatchTeamCheckInEnabled(event: Event): Boolean =
        event.teamSignup && event.teamCheckInMode.name == "MATCH"

    private fun canOpenMatchRoster(): Boolean {
        val currentEvent = event.value ?: return false
        val currentMatch = matchWithTeams.value.match
        return currentEvent.teamSignup &&
            currentEvent.allowMatchRosterEdits &&
            (_matchFinished.value || isTeamCheckInWindowOpen(currentMatch, currentEvent)) &&
            !resolveCurrentUserManagedMatchTeamId().isNullOrBlank()
    }

    private fun teamCheckInPromptKey(matchId: String, eventTeamId: String): String =
        "${matchId.trim()}:${eventTeamId.trim()}"

    private fun teamHasCheckedIntoMatch(matchId: String, eventTeamId: String): Boolean {
        val promptKey = teamCheckInPromptKey(matchId, eventTeamId)
        if (promptKey in confirmedTeamCheckInPromptKeys) return true
        val checkIn = _matchTeamCheckIns.value[eventTeamId] ?: return false
        return checkIn.status?.trim()?.uppercase().orEmpty() in setOf("", "CHECKED_IN")
    }

    private fun isTeamCheckInWindowOpen(match: MatchMVP, event: Event): Boolean {
        return isTeamCheckInWindowOpen(match, event, Clock.System.now())
    }

    private fun refreshMatchCheckInsIfAllowed() {
        val currentEvent = event.value ?: return
        val currentMatch = matchWithTeams.value.match
        if (!isMatchTeamCheckInEnabled(currentEvent)) {
            lastLoadedMatchCheckInKey = null
            scheduledMatchCheckInRetryKey = null
            _matchTeamCheckIns.value = emptyMap()
            return
        }
        if (!isOfficial.value) {
            return
        }
        val loadKey = "${currentEvent.id}:${currentMatch.id}"
        if (lastLoadedMatchCheckInKey == loadKey) {
            return
        }
        lastLoadedMatchCheckInKey = loadKey
        scope.launch {
            matchRepository.getMatchTeamCheckIns(
                eventId = currentEvent.id,
                matchId = currentMatch.id,
            ).onSuccess { response ->
                _matchTeamCheckIns.value = response.checkIns
                    .mapNotNull { checkIn ->
                        val eventTeamId = checkIn.eventTeamId?.trim()?.takeIf(String::isNotBlank)
                        eventTeamId?.let { it to checkIn }
                    }
                    .toMap()
                if (scheduledMatchCheckInRetryKey == loadKey) {
                    scheduledMatchCheckInRetryKey = null
                }
            }.onFailure {
                // A read can fail transiently even though the official remains authorized. Keep the
                // in-flight key until the bounded retry begins so concurrent collectors do not send
                // duplicate reads; later event/match refreshes can retry after that attempt too.
                scheduleMatchCheckInRetry(loadKey)
            }
        }
    }

    private fun scheduleMatchCheckInRetry(loadKey: String) {
        if (scheduledMatchCheckInRetryKey == loadKey) return
        scheduledMatchCheckInRetryKey = loadKey
        scope.launch {
            delay(MATCH_CHECK_IN_RETRY_DELAY_MS)
            val currentEvent = event.value ?: return@launch
            val currentMatch = matchWithTeams.value.match
            val currentLoadKey = "${currentEvent.id}:${currentMatch.id}"
            if (scheduledMatchCheckInRetryKey != loadKey || currentLoadKey != loadKey) return@launch
            lastLoadedMatchCheckInKey = null
            refreshMatchCheckInsIfAllowed()
        }
    }

    private fun evaluateTeamCheckInPrompt() {
        val currentEvent = event.value ?: return
        val currentMatch = matchWithTeams.value.match
        if (
            !isMatchTeamCheckInEnabled(currentEvent) ||
            _matchFinished.value ||
            !isTeamCheckInWindowOpen(currentMatch, currentEvent)
        ) {
            _showTeamCheckInDialog.value = false
            return
        }
        val eventTeamId = _currentUserManagedMatchTeamId.value ?: resolveCurrentUserManagedMatchTeamId()
        if (eventTeamId.isNullOrBlank() || teamHasCheckedIntoMatch(currentMatch.id, eventTeamId)) {
            _showTeamCheckInDialog.value = false
            return
        }
        val promptKey = teamCheckInPromptKey(currentMatch.id, eventTeamId)
        if (shownTeamCheckInPromptKeys.add(promptKey)) {
            _showTeamCheckInDialog.value = true
        }
    }

    private fun resolveCurrentUserParticipatingTeamId(match: MatchMVP): String? {
        val participantTeamIds = setOfNotNull(
            normalizeOptionalId(match.team1Id),
            normalizeOptionalId(match.team2Id),
        )
        if (participantTeamIds.isEmpty()) {
            return null
        }
        return currentUserTeamIds().firstOrNull { teamId -> participantTeamIds.contains(teamId) }
    }

    private fun resolveCurrentUserEventTeamId(match: MatchMVP): String? {
        val userTeamIds = currentUserTeamIds()
        val eventTeamIds = event.value
            ?.teamIds
            ?.mapNotNull(::normalizeOptionalId)
            ?.toSet()
            .orEmpty()

        if (eventTeamIds.isNotEmpty()) {
            return userTeamIds.firstOrNull { teamId -> eventTeamIds.contains(teamId) }
        }

        // Fallback for stale event snapshots where teamIds may not yet be populated.
        return resolveCurrentUserParticipatingTeamId(match)
    }

    private fun canCurrentUserSwapIntoOfficial(match: MatchMVP): Boolean {
        if (!canCheckIntoMatch(match)) {
            return false
        }
        if (!isOfficialMatchWindowOpen(match)) {
            return false
        }
        if (event.value?.doTeamsOfficiate != true) {
            return false
        }
        if (event.value?.teamOfficialsMaySwap != true) {
            return false
        }
        if (match.officialCheckedIn == true) {
            return false
        }
        val eventTeamId = resolveCurrentUserEventTeamId(match) ?: return false
        return eventTeamId != normalizeOptionalId(match.teamOfficialId)
    }

    private fun canCheckIntoMatch(match: MatchMVP): Boolean {
        return normalizeOptionalId(match.team1Id) != null &&
            normalizeOptionalId(match.team2Id) != null
    }

    private fun updateMatchActionAccess() {
        val currentUserId = currentUser.id.trim()
        val currentEvent = event.value
        _canManageMatchActions.value = currentUserId.isNotBlank() && currentEvent != null && (
            currentEvent.hostId.trim() == currentUserId ||
                currentEvent.assistantHostIds.any { userId -> userId.trim() == currentUserId }
            )
    }

    private fun canApplyMatchAction(): Boolean {
        if (_matchFinished.value) return false
        if (_canManageMatchActions.value) return true
        return isOfficial.value && officialCheckedIn.value == true &&
            isOfficialMatchWindowOpen(matchWithTeams.value.match)
    }

    private fun normalizeOptionalId(rawId: String?): String? {
        val normalized = rawId?.trim()
        return normalized?.takeIf(String::isNotBlank)
    }

    private fun currentScoringMatch(): MatchMVP =
        updateMatchStructureForCurrentContext(_optimisticMatch.value?.match ?: matchWithTeams.value.match)

    private fun applyConfirmedMatchState(match: MatchMVP) {
        _optimisticMatch.value = matchWithTeams.value.copy(match = match)
        _matchFinished.value = isMatchOver(match)
        if (_matchFinished.value) {
            return
        }
        _currentSet.value = resolveCurrentSegmentIndex(match)
    }

    override fun updateScore(isTeam1: Boolean, increment: Boolean) {
        if (!isOfficial.value || officialCheckedIn.value != true || matchFinished.value) {
            return
        }
        val currentMatch = matchWithTeams.value
        val scoringMatch = updateMatchStructureForCurrentContext(currentMatch.match)
        if (scoringMatch.actualStart.isNullOrBlank()) {
            return
        }
        val activeRules = resolveActiveRules(scoringMatch, event.value)
        if (increment && shouldRequireScoringIncident(activeRules, event.value)) {
            _errorState.value = "Scoring details are required for this match."
            return
        }
        val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
        val activeSegment = scoringMatch.segments.getOrNull(setIndex) ?: return
        if (activeSegment.status == "COMPLETE") {
            return
        }
        if (increment && !canIncrementCurrentSegment(scoringMatch, activeRules, event.value, setIndex)) {
            return
        }
        val eventTeamId = if (isTeam1) scoringMatch.team1Id else scoringMatch.team2Id
        if (eventTeamId.isNullOrBlank()) {
            return
        }

        val delta = if (increment) 1 else -1
        val updatedScoringMatch = scoringMatch.updateSegmentScore(
            segmentIndex = setIndex,
            eventTeamId = eventTeamId,
            delta = delta,
            segmentCount = maxSets,
        )
        val optimisticMatch = currentMatch.copy(match = updatedScoringMatch)

        _optimisticMatch.value = optimisticMatch

        checkSetCompletion(updatedScoringMatch)
        val pendingScoreSync = PendingDirectScoreSync(
            match = updatedScoringMatch,
            segmentId = activeSegment.id,
            sequence = activeSegment.sequence,
            eventTeamId = eventTeamId,
            editVersion = ++directScoreEditVersion,
            points = updatedScoringMatch.segments.getOrNull(setIndex)?.scores?.get(eventTeamId) ?: 0,
        )
        scope.launch {
            if (!persistMatchLocally(updatedScoringMatch, clearOptimisticOnSuccess = false)) {
                return@launch
            }
            scheduleDirectScoreSync(pendingScoreSync)
        }
    }

    override fun recordPointIncident(
        isTeam1: Boolean,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
        clockInput: String?,
        note: String?,
    ) {
        val currentMatch = matchWithTeams.value.match
        val rules = resolveActiveRules(currentMatch, event.value)
        val eventTeamId = if (isTeam1) currentMatch.team1Id else currentMatch.team2Id
        recordMatchIncident(
            eventTeamId = eventTeamId,
            incidentType = rules.autoCreatePointIncidentType?.takeIf(String::isNotBlank) ?: "POINT",
            eventRegistrationId = eventRegistrationId,
            participantUserId = participantUserId,
            minute = minute,
            clockInput = clockInput,
            note = note,
        )
    }

    override fun recordMatchIncident(
        eventTeamId: String?,
        incidentType: String,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
        clockInput: String?,
        note: String?,
    ) {
        if (!isOfficial.value || officialCheckedIn.value != true || matchFinished.value) {
            return
        }

        val currentMatch = matchWithTeams.value
        val scoringMatch = updateMatchStructureForCurrentContext(currentMatch.match)
        val segmentIndex = currentSet.value.coerceIn(0, maxSets - 1)
        val activeSegment = scoringMatch.segments.getOrNull(segmentIndex) ?: return
        if (activeSegment.status == "COMPLETE") {
            return
        }
        val normalizedIncidentType = incidentType.trim().takeIf(String::isNotBlank) ?: "NOTE"
        val activeRules = resolveActiveRules(scoringMatch, event.value)
        val scoringIncident = isScoringIncidentType(normalizedIncidentType)
        if (scoringIncident && scoringMatch.actualStart.isNullOrBlank()) {
            return
        }
        val normalizedEventTeamId = eventTeamId?.trim()?.takeIf(String::isNotBlank)
        if (scoringIncident && normalizedEventTeamId == null) {
            return
        }
        if (
            scoringIncident &&
            !canIncrementCurrentSegment(
                match = scoringMatch,
                rules = activeRules,
                currentEvent = event.value,
                setIndex = segmentIndex,
            )
        ) {
            return
        }

        val updatedScoringMatch = if (scoringIncident) {
            scoringMatch.updateSegmentScore(
                segmentIndex = segmentIndex,
                eventTeamId = normalizedEventTeamId!!,
                delta = 1,
                segmentCount = maxSets,
            )
        } else {
            scoringMatch
        }
        val updatedSegment = updatedScoringMatch.segments.getOrNull(segmentIndex) ?: activeSegment
        val liveClockDetails = clockDetailsForSegment(activeSegment, activeRules)
        val parsedClockDetails = parseIncidentClockInput(
            value = clockInput,
            allowAddedTimeNotation = activeRules.timekeeping.addedTimeEnabled,
        )
        val clockDetails = parsedClockDetails?.let { parsed ->
            if (parsed.clock != null && parsed.clock == liveClockDetails.clock) {
                parsed.copy(clockSeconds = liveClockDetails.clockSeconds)
            } else {
                parsed
            }
        } ?: liveClockDetails
        val localIncident = buildPendingIncident(
            match = updatedScoringMatch,
            segment = updatedSegment,
            eventTeamId = normalizedEventTeamId,
            eventRegistrationId = eventRegistrationId,
            participantUserId = participantUserId,
            officialUserId = currentUser.id.takeIf(String::isNotBlank),
            incidentType = normalizedIncidentType,
            linkedPointDelta = if (scoringIncident) 1 else null,
            minute = minute ?: clockDetails.minute,
            clock = clockDetails.clock,
            clockSeconds = clockDetails.clockSeconds,
            note = note,
        )
        val updatedScoringMatchWithIncident = updatedScoringMatch.copy(
            incidents = (updatedScoringMatch.incidents + localIncident)
                .sortedWith(compareBy<MatchIncidentMVP> { it.sequence }.thenBy { it.id }),
        )
        _optimisticMatch.value = currentMatch.copy(match = updatedScoringMatchWithIncident)
        checkSetCompletion(updatedScoringMatchWithIncident)

        scope.launch {
            matchRepository.addMatchIncident(
                match = scoringMatch,
                operation = localIncident.toCreateIncidentOperation(),
            ).onSuccess {
                _optimisticMatch.value = null
            }.onFailure { error ->
                _optimisticMatch.value = null
                _errorState.value = "Failed to save incident locally: ${error.userMessage()}"
            }
        }
    }

    override fun removeMatchIncident(incidentId: String) {
        val normalizedIncidentId = incidentId.trim().takeIf(String::isNotBlank) ?: return
        if (!isOfficial.value || officialCheckedIn.value != true) {
            return
        }

        val currentMatch = matchWithTeams.value
        val scoringMatch = updateMatchStructureForCurrentContext(currentMatch.match)
        val incident = scoringMatch.incidents.firstOrNull { row -> row.id == normalizedIncidentId } ?: return
        val updatedMatch = if (incident.isPendingCreateUpload()) {
            scoringMatch
                .removeIncidentScore(incident)
                .copy(incidents = scoringMatch.incidents.filterNot { row -> row.id == normalizedIncidentId })
        } else {
            scoringMatch
                .removeIncidentScore(incident)
                .copy(incidents = scoringMatch.incidents.map { row ->
                    if (row.id == normalizedIncidentId) {
                        row.copy(uploadStatus = MATCH_INCIDENT_DELETE_PENDING)
                    } else {
                        row
                    }
                })
        }
        _optimisticMatch.value = currentMatch.copy(match = updatedMatch)

        scope.launch {
            if (incident.isPendingCreateUpload()) {
                persistMatchLocally(updatedMatch, clearOptimisticOnSuccess = true)
            } else {
                matchRepository.updateMatchOperations(
                    match = scoringMatch,
                    incidentOperations = listOf(incident.toDeleteIncidentOperation()),
                ).onSuccess {
                    _optimisticMatch.value = null
                }.onFailure { error ->
                    _optimisticMatch.value = null
                    _errorState.value = "Failed to save incident locally: ${error.userMessage()}"
                }
            }
        }
    }


    override fun completeCurrentSet() {
        if (_segmentConfirmSaving.value) return
        if (matchFinished.value || !isOfficial.value || officialCheckedIn.value != true) {
            return
        }
        _segmentConfirmSaving.value = true

        scope.launch {
            try {
                cancelPendingDirectScoreSync(invalidateQueuedSyncs = true)
                val queueDrained = drainIncidentQueueForConfirmation()
                if (!queueDrained) {
                    _errorState.value = "Incident updates are still waiting to sync. Please retry once the queue starts moving."
                    return@launch
                }

                val scoringMatch = currentScoringMatch()
                val rules = resolveActiveRules(scoringMatch, event.value)
                val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
                setConfirmationValidationError(
                    match = scoringMatch,
                    rules = rules,
                    setIndex = setIndex,
                )?.let { error ->
                    _errorState.value = error
                    return@launch
                }
                val team1Score = scoringMatch.team1Points.getOrElse(setIndex) { 0 }
                val team2Score = scoringMatch.team2Points.getOrElse(setIndex) { 0 }

                val currentSegment = scoringMatch.segments.getOrNull(setIndex) ?: return@launch
                val winnerEventTeamId = when {
                    team1Score > team2Score -> scoringMatch.team1Id
                    team2Score > team1Score -> scoringMatch.team2Id
                    else -> null
                }
                val updatedSegments = scoringMatch.segments.toMutableList().apply {
                    this[setIndex] = currentSegment.copy(
                        status = "COMPLETE",
                        winnerEventTeamId = winnerEventTeamId,
                    )
                }
                val updatedScoringMatch = scoringMatch.copy(segments = updatedSegments)
                    .syncLegacyScoresFromSegments(maxSets)

                val persistedMatch = if (isMatchOver(updatedScoringMatch)) {
                    val endTime = Clock.System.now()
                    syncMatchImmediatelyBlocking(
                        match = updatedScoringMatch,
                        finalize = true,
                        time = endTime,
                        saveLocallyBeforeRemote = false,
                    )
                } else {
                    syncMatchImmediatelyBlocking(
                        match = updatedScoringMatch,
                        saveLocallyBeforeRemote = false,
                    )
                }
                if (persistedMatch == null) return@launch
                applyConfirmedMatchState(persistedMatch)
                if (!isMatchOver(updatedScoringMatch)) {
                    persistMatchLocally(persistedMatch, clearOptimisticOnSuccess = true)
                }
            } finally {
                _segmentConfirmSaving.value = false
            }
        }
    }


    private fun scheduleDirectScoreSync(
        pendingSync: PendingDirectScoreSync,
    ) {
        if (pendingSync.editVersion <= directScoreInvalidatedThroughVersion) {
            return
        }
        pendingDirectScoreSync = pendingSync
        directScoreSyncJob?.cancel()
        directScoreSyncJob = scope.launch {
            delay(DIRECT_SCORE_DEBOUNCE_MS)
            directScoreSyncJob = null
            syncPendingDirectScore(pendingSync.editVersion)
        }
    }

    private fun cancelPendingDirectScoreSync(invalidateQueuedSyncs: Boolean = false) {
        if (invalidateQueuedSyncs) {
            directScoreInvalidatedThroughVersion = maxOf(
                directScoreInvalidatedThroughVersion,
                directScoreEditVersion,
            )
        }
        directScoreSyncJob?.cancel()
        directScoreSyncJob = null
        pendingDirectScoreSync = null
    }

    private suspend fun syncPendingDirectScore(
        editVersion: Long,
    ) {
        if (editVersion <= directScoreInvalidatedThroughVersion) {
            return
        }
        val pendingSync = pendingDirectScoreSync?.takeIf { pending -> pending.editVersion == editVersion }
            ?: return
        pendingDirectScoreSync = null

        matchRepository.setMatchScore(
            match = pendingSync.match,
            segmentId = pendingSync.segmentId,
            sequence = pendingSync.sequence,
            eventTeamId = pendingSync.eventTeamId,
            points = pendingSync.points,
        ).onSuccess {
            clearOptimisticAfterDirectScoreSync(editVersion)
        }.onFailure { error ->
            _errorState.value = "Failed to sync score: ${error.userMessage()}"
            clearOptimisticAfterDirectScoreSync(editVersion)
        }
    }

    private fun clearOptimisticAfterDirectScoreSync(editVersion: Long) {
        if (pendingDirectScoreSync == null && directScoreEditVersion == editVersion) {
            _optimisticMatch.value = null
        }
    }

    private fun syncMatchImmediately(
        match: MatchMVP,
        finalize: Boolean = false,
        time: Instant? = null,
        saveLocallyBeforeRemote: Boolean = true,
    ) {
        scope.launch {
            syncMatchImmediatelyBlocking(
                match = match,
                finalize = finalize,
                time = time,
                saveLocallyBeforeRemote = saveLocallyBeforeRemote,
            )
        }
    }

    private suspend fun syncMatchImmediatelyBlocking(
        match: MatchMVP,
        finalize: Boolean = false,
        time: Instant? = null,
        saveLocallyBeforeRemote: Boolean = true,
    ): MatchMVP? {
            cancelPendingDirectScoreSync()
            if (saveLocallyBeforeRemote) {
                if (!persistMatchLocally(match, clearOptimisticOnSuccess = true)) {
                    return null
                }
            }

            return if (finalize) {
                matchRepository.updateMatchOperations(
                    match = match,
                    segmentOperations = match.toSegmentOperations(),
                    incidentOperations = null,
                    finalize = finalize,
                    time = time,
                ).onSuccess {
                    _optimisticMatch.value = null
                }.onFailure { error ->
                    if (!saveLocallyBeforeRemote) {
                        _optimisticMatch.value = null
                    }
                    _errorState.value = if (finalize) {
                        "Failed to finish match: ${error.userMessage()}"
                    } else {
                        "Failed to sync match: ${error.userMessage()}"
                    }
                }.getOrNull()
            } else {
                matchRepository.updateMatch(match).onSuccess {
                    // Clear optimistic state since database is now up to date
                    _optimisticMatch.value = null
                }.onFailure { error ->
                    _errorState.value = "Failed to sync match: ${error.userMessage()}"
                    if (!saveLocallyBeforeRemote) {
                        _optimisticMatch.value = null
                    }
                }.fold(
                    onSuccess = { match },
                    onFailure = { null },
                )
            }
    }

    private suspend fun processIncidentQueueUntilBlocked(
        initialMatch: MatchMVP? = null,
        rescheduleOnFailure: Boolean = true,
    ) {
        incidentQueueMutex.withLock {
            var queuedMatch = initialMatch
            while (true) {
                val currentMatch = updateMatchStructureForCurrentContext(queuedMatch ?: matchWithTeams.value.match)
                val action = pendingIncidentActionsFor(currentMatch).firstOrNull()
                    ?: run {
                        incidentRetryAttempt = 0
                        return@withLock
                    }
                val updatedMatch = executeIncidentAction(currentMatch, action)
                queuedMatch = updatedMatch
                if (updatedMatch == null) {
                    if (rescheduleOnFailure) {
                        scheduleIncidentQueueRetry()
                    }
                    return@withLock
                }
            }
        }
    }

    private fun resumePersistedIncidentQueueIfNeeded() {
        if (!_isOfficial.value || _officialCheckedIn.value != true) return
        val currentMatch = matchWithTeams.value.match
        val matchId = currentMatch.id.trim()
        if (matchId.isBlank() || incidentQueueStartupDrainMatchId == matchId) return
        incidentQueueStartupDrainMatchId = matchId
        scope.launch {
            // A reopened screen gets one immediate recovery attempt.  Do not create an
            // unbounded background retry chain here: failures remain persisted and the
            // normal queue triggers resume them on the next user action or screen open.
            processIncidentQueueUntilBlocked(
                initialMatch = currentMatch,
                rescheduleOnFailure = false,
            )
        }
    }

    private suspend fun drainIncidentQueueForConfirmation(): Boolean {
        incidentQueueRetryJob?.cancel()
        incidentQueueRetryJob = null
        return incidentQueueMutex.withLock {
            var elapsedWithoutReduction = 0L
            var queuedMatch: MatchMVP? = null
            while (true) {
                val currentMatch = updateMatchStructureForCurrentContext(queuedMatch ?: matchWithTeams.value.match)
                val beforeCount = pendingIncidentActionsFor(currentMatch).size
                if (beforeCount == 0) {
                    incidentRetryAttempt = 0
                    return@withLock true
                }

                val action = pendingIncidentActionsFor(currentMatch).first()
                val updatedMatch = executeIncidentAction(currentMatch, action)
                queuedMatch = updatedMatch
                val afterCount = pendingIncidentActionsFor(
                    updateMatchStructureForCurrentContext(updatedMatch ?: matchWithTeams.value.match)
                ).size
                if (updatedMatch != null || afterCount < beforeCount) {
                    elapsedWithoutReduction = 0L
                    continue
                }

                val waitMillis = minOf(
                    incidentRetryDelayMs(incidentRetryAttempt),
                    INCIDENT_CONFIRM_NO_PROGRESS_TIMEOUT_MS - elapsedWithoutReduction,
                )
                if (waitMillis <= 0L) {
                    return@withLock false
                }
                incidentRetryAttempt += 1
                delay(waitMillis)
                elapsedWithoutReduction += waitMillis
            }
            @Suppress("UNREACHABLE_CODE")
            false
        }
    }

    private fun scheduleIncidentQueueRetry() {
        if (incidentQueueRetryJob?.isActive == true) return
        val retryDelayMs = incidentRetryDelayMs(incidentRetryAttempt)
        incidentRetryAttempt += 1
        incidentQueueRetryJob = scope.launch {
            delay(retryDelayMs)
            incidentQueueRetryJob = null
            processIncidentQueueUntilBlocked()
        }
    }

    private suspend fun executeIncidentAction(
        match: MatchMVP,
        action: PendingIncidentAction,
    ): MatchMVP? {
        val result = when (action.operation.action) {
            "CREATE" -> matchRepository.addMatchIncident(match = match, operation = action.operation)
            else -> matchRepository.updateMatchOperations(
                match = match,
                incidentOperations = listOf(action.operation),
            )
        }

        return result.fold(
            onSuccess = { locallyQueuedMatch ->
                incidentRetryAttempt = 0
                _optimisticMatch.value = null
                locallyQueuedMatch
            },
            onFailure = { error ->
                _optimisticMatch.value = null
                _errorState.value = "Failed to save incident locally: ${error.userMessage()}"
                null
            },
        )
    }

    private suspend fun persistMatchLocally(
        match: MatchMVP,
        clearOptimisticOnSuccess: Boolean,
    ): Boolean {
        val saveVersion = ++localMatchSaveVersion
        return localMatchSaveMutex.withLock {
            matchRepository.saveMatchLocally(match)
                .onSuccess {
                    if (clearOptimisticOnSuccess && saveVersion == localMatchSaveVersion) {
                        _optimisticMatch.value = null
                    }
                }
                .onFailure { error ->
                    if (saveVersion == localMatchSaveVersion) {
                        _errorState.value = "Failed to save match locally: ${error.userMessage()}"
                    }
                }
                .isSuccess
        }
    }

    private fun isMatchOver(match: MatchMVP): Boolean {
        val lifecycleStatus = match.status?.trim()?.uppercase().orEmpty()
        val resultType = match.resultType?.trim()?.uppercase().orEmpty()
        if (
            lifecycleStatus in setOf("COMPLETE", "CANCELLED") ||
            resultType in setOf("FORFEIT", "NO_CONTEST") ||
            !match.actualEnd.isNullOrBlank()
        ) {
            return true
        }
        val rules = resolveActiveRules(match, event.value)
        val segmentWinnerIds = match.segments
            .filter { segment -> segment.status == "COMPLETE" || !segment.winnerEventTeamId.isNullOrBlank() }
            .mapNotNull { segment -> segment.winnerEventTeamId }
        if (rules.scoringModel == "SETS" && segmentWinnerIds.isNotEmpty()) {
            val team1Wins = segmentWinnerIds.count { winnerId -> winnerId == match.team1Id }
            val team2Wins = segmentWinnerIds.count { winnerId -> winnerId == match.team2Id }
            return team1Wins >= setsNeeded || team2Wins >= setsNeeded
        }

        return when (rules.scoringModel) {
            "SETS" -> {
                val relevantResults = match.setResults.take(maxSets.coerceAtLeast(1))
                val team1Wins = relevantResults.count { it == 1 }
                val team2Wins = relevantResults.count { it == 2 }
                team1Wins >= setsNeeded || team2Wins >= setsNeeded
            }

            "POINTS_ONLY" -> match.segments
                .firstOrNull()
                ?.status == "COMPLETE"

            else -> match.segments
                .take(maxSets.coerceAtLeast(1))
                .all { segment -> segment.status == "COMPLETE" }
        }
    }

    private fun checkSetCompletion(match: MatchMVP): Boolean {
        val rules = resolveActiveRules(match, event.value)
        if (rules.scoringModel != "SETS") return false

        val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
        if (matchFinished.value) return false
        return canConfirmCurrentSegment(match, rules, event.value, setIndex)
    }

    private fun setConfirmationValidationError(
        match: MatchMVP,
        rules: ResolvedMatchRulesMVP,
        setIndex: Int,
    ): String? {
        val team1Score = match.team1Points.getOrElse(setIndex) { 0 }
        val team2Score = match.team2Points.getOrElse(setIndex) { 0 }
        return when (rules.scoringModel) {
            "SETS" -> when {
                team1Score == team2Score -> "Set score cannot be tied."
                !canConfirmCurrentSegment(match, rules, event.value, setIndex) -> {
                    resolvePointsToVictory(match, event.value, setIndex)
                        ?.let { pointsToVictory -> "Reach $pointsToVictory points to confirm this set." }
                        ?: "This set is not ready to confirm yet."
                }

                else -> null
            }

            "POINTS_ONLY" -> when {
                !rules.supportsDraw && team1Score == team2Score -> "Match score cannot be tied."
                else -> null
            }

            else -> null
        }
    }

    private fun updateMatchStructureForCurrentContext(match: MatchMVP): MatchMVP {
        maxSets = resolveExpectedSetCount(match)
        val rules = resolveActiveRules(match, event.value)
        setsNeeded = if (rules.scoringModel == "SETS") {
            ((maxSets + 1) / 2).coerceAtLeast(1)
        } else {
            1
        }
        return normalizeMatchForSetCount(match, maxSets).ensureSegments()
    }

    private fun resolveExpectedSetCount(match: MatchMVP): Int {
        val rules = resolveActiveRules(match, event.value)
        val matchScoreSetCount = listOf(
            match.segments.size,
            match.setResults.size,
            match.team1Points.size,
            match.team2Points.size,
        ).maxOrNull() ?: 0

        return when (rules.scoringModel) {
            "POINTS_ONLY" -> 1
            else -> matchScoreSetCount.takeIf { it > 0 } ?: rules.segmentCount.coerceAtLeast(1)
        }
    }

    private fun isBracketMatch(match: MatchMVP): Boolean {
        return match.losersBracket ||
            !match.previousLeftId.isNullOrBlank() ||
            !match.previousRightId.isNullOrBlank() ||
            !match.winnerNextMatchId.isNullOrBlank() ||
            !match.loserNextMatchId.isNullOrBlank()
    }

    private fun normalizeMatchForSetCount(match: MatchMVP, setCount: Int): MatchMVP {
        val normalizedTeam1 = normalizeScoreList(match.team1Points, setCount)
        val normalizedTeam2 = normalizeScoreList(match.team2Points, setCount)
        val normalizedResults = normalizeResultList(match.setResults, setCount)

        val normalizedSegments = normalizeSegments(match, setCount, normalizedTeam1, normalizedTeam2, normalizedResults)

        if (
            normalizedTeam1 == match.team1Points &&
            normalizedTeam2 == match.team2Points &&
            normalizedResults == match.setResults &&
            normalizedSegments == match.segments
        ) {
            return match
        }

        return match.copy(
            team1Points = normalizedTeam1,
            team2Points = normalizedTeam2,
            setResults = normalizedResults,
            segments = normalizedSegments,
        )
    }

    private fun normalizeSegments(
        match: MatchMVP,
        setCount: Int,
        team1Points: List<Int>,
        team2Points: List<Int>,
        setResults: List<Int>,
    ): List<MatchSegmentMVP> {
        if (match.segments.isNotEmpty()) {
            return match.segments
                .sortedBy { segment -> segment.sequence }
                .take(setCount)
                .let { existing ->
                    if (existing.size >= setCount) {
                        existing
                    } else {
                        existing + buildLegacySegments(match, setCount, team1Points, team2Points, setResults)
                            .drop(existing.size)
                    }
                }
        }
        return buildLegacySegments(match, setCount, team1Points, team2Points, setResults)
    }

    private fun buildLegacySegments(
        match: MatchMVP,
        setCount: Int,
        team1Points: List<Int>,
        team2Points: List<Int>,
        setResults: List<Int>,
    ): List<MatchSegmentMVP> = List(setCount) { index ->
        val sequence = index + 1
        val scores = buildMap {
            match.team1Id?.takeIf { it.isNotBlank() }?.let { teamId -> put(teamId, team1Points.getOrElse(index) { 0 }) }
            match.team2Id?.takeIf { it.isNotBlank() }?.let { teamId -> put(teamId, team2Points.getOrElse(index) { 0 }) }
        }
        val winner = when (setResults.getOrElse(index) { 0 }) {
            1 -> match.team1Id
            2 -> match.team2Id
            else -> null
        }
        MatchSegmentMVP(
            id = "${match.id}_segment_$sequence",
            eventId = match.eventId,
            matchId = match.id,
            sequence = sequence,
            status = if (!winner.isNullOrBlank()) "COMPLETE" else if (scores.values.any { it > 0 }) "IN_PROGRESS" else "NOT_STARTED",
            scores = scores,
            winnerEventTeamId = winner,
        )
    }

    private fun MatchMVP.ensureSegments(): MatchMVP =
        if (segments.isNotEmpty()) this else syncSegmentsFromLegacyScores()

    private fun MatchMVP.syncSegmentsFromLegacyScores(): MatchMVP =
        copy(segments = buildLegacySegments(this, maxSets, team1Points, team2Points, setResults))

    private fun MatchMVP.syncLegacyScoresFromSegments(segmentCount: Int): MatchMVP {
        val normalizedTeam1 = normalizeScoreList(team1Points, segmentCount)
        val normalizedTeam2 = normalizeScoreList(team2Points, segmentCount)
        val normalizedResults = normalizeResultList(setResults, segmentCount)
        val normalizedSegments = normalizeSegments(
            match = this,
            setCount = segmentCount,
            team1Points = normalizedTeam1,
            team2Points = normalizedTeam2,
            setResults = normalizedResults,
        )
        val nextTeam1Points = normalizedSegments.map { segment ->
            team1Id?.let { teamId -> segment.scores[teamId] } ?: 0
        }
        val nextTeam2Points = normalizedSegments.map { segment ->
            team2Id?.let { teamId -> segment.scores[teamId] } ?: 0
        }
        val nextResults = normalizedSegments.map { segment ->
            when (segment.winnerEventTeamId) {
                team1Id -> 1
                team2Id -> 2
                else -> 0
            }
        }
        return copy(
            team1Points = nextTeam1Points,
            team2Points = nextTeam2Points,
            setResults = nextResults,
            segments = normalizedSegments,
        )
    }

    private fun MatchMVP.updateSegmentScore(
        segmentIndex: Int,
        eventTeamId: String,
        delta: Int,
        segmentCount: Int,
    ): MatchMVP {
        val normalizedMatch = syncLegacyScoresFromSegments(segmentCount)
        val currentSegment = normalizedMatch.segments.getOrNull(segmentIndex) ?: return normalizedMatch
        if (currentSegment.status == "COMPLETE") {
            return normalizedMatch
        }
        val currentScore = currentSegment.scores[eventTeamId] ?: 0
        val nextScore = (currentScore + delta).coerceAtLeast(0)
        val nextScores = currentSegment.scores.toMutableMap().apply {
            this[eventTeamId] = nextScore
        }
        val updatedSegment = currentSegment.copy(
            status = when {
                nextScores.values.any { score -> score > 0 } -> "IN_PROGRESS"
                else -> "NOT_STARTED"
            },
            scores = nextScores,
            winnerEventTeamId = null,
        )
        val updatedSegments = normalizedMatch.segments.toMutableList().apply {
            this[segmentIndex] = updatedSegment
        }
        return normalizedMatch.copy(segments = updatedSegments).syncLegacyScoresFromSegments(segmentCount)
    }

    private fun MatchMVP.toSegmentOperations(): List<MatchSegmentOperationDto> =
        segments.map { segment ->
            MatchSegmentOperationDto(
                id = segment.id,
                sequence = segment.sequence,
                status = segment.status,
                scores = segment.scores,
                winnerEventTeamId = segment.winnerEventTeamId,
                startedAt = segment.startedAt,
                endedAt = segment.endedAt,
                resultType = segment.resultType,
                statusReason = segment.statusReason,
            )
        }

    private data class IncidentClockDetails(
        val minute: Int?,
        val clock: String?,
        val clockSeconds: Int?,
    )

    private fun durationSecondsForSegmentSequence(
        rules: ResolvedMatchRulesMVP,
        sequence: Int,
    ): Int? {
        val durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence.getOrNull(sequence - 1)
            ?: rules.timekeeping.segmentDurationMinutes
        return durationMinutes?.takeIf { it > 0 }?.times(60)
    }

    private fun regulationOffsetSecondsForSegment(
        segment: MatchSegmentMVP,
        rules: ResolvedMatchRulesMVP,
    ): Int {
        if (!rules.timekeeping.addedTimeEnabled) return 0
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

    private fun parseIncidentClockInput(
        value: String?,
        allowAddedTimeNotation: Boolean,
    ): IncidentClockDetails? {
        val trimmed = value?.trim()?.takeIf(String::isNotBlank) ?: return null
        val addedTimeMatch = Regex("""^(\d+)\s*\+\s*(\d+)$""").matchEntire(trimmed)
        if (addedTimeMatch != null && allowAddedTimeNotation) {
            val regulationMinute = addedTimeMatch.groupValues[1].toIntOrNull()
            val addedMinute = addedTimeMatch.groupValues[2].toIntOrNull()
            if (regulationMinute != null && regulationMinute >= 0 && addedMinute != null && addedMinute > 0) {
                val minute = regulationMinute + addedMinute
                return IncidentClockDetails(
                    minute = minute,
                    clock = "$regulationMinute+$addedMinute",
                    clockSeconds = minute * 60,
                )
            }
            return null
        }
        if (addedTimeMatch != null) return null
        val minute = trimmed.toIntOrNull()?.takeIf { it >= 0 } ?: return null
        return IncidentClockDetails(
            minute = minute,
            clock = null,
            clockSeconds = minute * 60,
        )
    }

    private fun clockDetailsForSegment(
        segment: MatchSegmentMVP,
        rules: ResolvedMatchRulesMVP,
    ): IncidentClockDetails {
        val startedAt = parseInstantOrNull(segment.startedAt) ?: return IncidentClockDetails(null, null, null)
        val endedAt = parseInstantOrNull(segment.endedAt) ?: Clock.System.now()
        val rawSeconds = ((endedAt.toEpochMilliseconds() - startedAt.toEpochMilliseconds()) / 1000L)
            .coerceAtLeast(0L)
            .toInt()
        val durationSeconds = durationSecondsForSegmentSequence(rules, segment.sequence)
        val segmentClockSeconds = if (rules.timekeeping.stopAtRegulationEnd && durationSeconds != null) {
            rawSeconds.coerceAtMost(durationSeconds)
        } else {
            rawSeconds
        }
        val regulationOffsetSeconds = regulationOffsetSecondsForSegment(segment, rules)
        val clockSeconds = if (rules.timekeeping.addedTimeEnabled) {
            regulationOffsetSeconds + segmentClockSeconds
        } else {
            segmentClockSeconds
        }
        return IncidentClockDetails(
            minute = (clockSeconds + 59) / 60,
            clock = if (rules.timekeeping.addedTimeEnabled && durationSeconds != null && rawSeconds > durationSeconds) {
                formatAddedTimeIncidentClock(regulationOffsetSeconds + durationSeconds, rawSeconds - durationSeconds)
            } else if (rules.timekeeping.addedTimeEnabled) {
                formatClockSecondsAsMinutes(clockSeconds)
            } else {
                formatClockSeconds(clockSeconds)
            },
            clockSeconds = clockSeconds,
        )
    }

    private fun parseInstantOrNull(value: String?): Instant? =
        value?.trim()?.takeIf(String::isNotBlank)?.let { raw ->
            runCatching { Instant.parse(raw) }.getOrNull()
        }

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

    private fun buildPendingIncident(
        match: MatchMVP,
        segment: MatchSegmentMVP,
        eventTeamId: String?,
        eventRegistrationId: String?,
        participantUserId: String?,
        officialUserId: String?,
        incidentType: String,
        linkedPointDelta: Int?,
        minute: Int?,
        clock: String?,
        clockSeconds: Int?,
        note: String?,
    ): MatchIncidentMVP {
        val now = Clock.System.now().toEpochMilliseconds()
        val nextSequence = (match.incidents.maxOfOrNull { incident -> incident.sequence } ?: 0) + 1
        return MatchIncidentMVP(
            id = "$LOCAL_MATCH_INCIDENT_PREFIX${match.id}:${segment.id}:$now",
            eventId = match.eventId,
            matchId = match.id,
            segmentId = segment.id,
            eventTeamId = eventTeamId,
            eventRegistrationId = eventRegistrationId?.trim()?.takeIf(String::isNotBlank),
            participantUserId = participantUserId?.trim()?.takeIf(String::isNotBlank),
            officialUserId = officialUserId,
            incidentType = incidentType,
            sequence = nextSequence,
            minute = minute,
            clock = clock,
            clockSeconds = clockSeconds,
            linkedPointDelta = linkedPointDelta,
            note = note?.trim()?.takeIf(String::isNotBlank),
            uploadStatus = MATCH_INCIDENT_UPLOAD_PENDING,
        )
    }

    private fun MatchIncidentMVP.isPendingCreateUpload(): Boolean =
        uploadStatus == MATCH_INCIDENT_UPLOAD_PENDING ||
            uploadStatus == MATCH_INCIDENT_UPLOAD_FAILED

    private fun MatchIncidentMVP.isPendingDeleteUpload(): Boolean =
        uploadStatus == MATCH_INCIDENT_DELETE_PENDING ||
            uploadStatus == MATCH_INCIDENT_DELETE_FAILED

    private fun MatchIncidentMVP.toCreateIncidentOperation(): MatchIncidentOperationDto =
        MatchIncidentOperationDto(
            action = "CREATE",
            id = id,
            segmentId = segmentId,
            eventTeamId = eventTeamId,
            eventRegistrationId = eventRegistrationId,
            participantUserId = participantUserId,
            officialUserId = officialUserId,
            incidentType = incidentType,
            sequence = sequence,
            linkedPointDelta = linkedPointDelta,
            minute = minute,
            clock = clock,
            clockSeconds = clockSeconds,
            note = note,
        )

    private fun MatchIncidentMVP.toDeleteIncidentOperation(): MatchIncidentOperationDto =
        MatchIncidentOperationDto(
            action = "DELETE",
            id = id,
            segmentId = segmentId,
            eventTeamId = eventTeamId,
            incidentType = incidentType,
            linkedPointDelta = linkedPointDelta,
        )

    private fun pendingIncidentActionsFor(match: MatchMVP): List<PendingIncidentAction> =
        match.incidents
            .filter { incident -> incident.isPendingCreateUpload() || incident.isPendingDeleteUpload() }
            .mapNotNull { incident ->
                when {
                    incident.isPendingCreateUpload() -> PendingIncidentAction(
                        incident = incident,
                        operation = incident.toCreateIncidentOperation(),
                    )
                    incident.isPendingDeleteUpload() -> PendingIncidentAction(
                        incident = incident,
                        operation = incident.toDeleteIncidentOperation(),
                    )
                    else -> null
                }
            }

    private fun MatchMVP.removeIncidentScore(incident: MatchIncidentMVP): MatchMVP {
        val linkedDelta = incident.linkedPointDelta ?: return this
        if (linkedDelta == 0) {
            return this
        }
        val eventTeamId = incident.eventTeamId?.trim()?.takeIf(String::isNotBlank) ?: return this
        val segmentIndex = segments.indexOfFirst { segment ->
            segment.id == incident.segmentId || segment.legacyId == incident.segmentId
        }
        if (segmentIndex < 0) {
            return this
        }
        return updateSegmentScore(
            segmentIndex = segmentIndex,
            eventTeamId = eventTeamId,
            delta = -linkedDelta,
            segmentCount = maxSets,
        )
    }

    private fun normalizeScoreList(values: List<Int>, setCount: Int): List<Int> {
        val normalized = values.take(setCount).toMutableList()
        while (normalized.size < setCount) {
            normalized.add(0)
        }
        return normalized
    }

    private fun normalizeResultList(values: List<Int>, setCount: Int): List<Int> {
        val normalized = values
            .take(setCount)
            .map { value -> if (value == 1 || value == 2) value else 0 }
            .toMutableList()
        while (normalized.size < setCount) {
            normalized.add(0)
        }
        return normalized
    }

    private fun resolveCurrentSetIndex(setResults: List<Int>): Int {
        val firstIncomplete = setResults.indexOfFirst { result -> result == 0 }
        return when {
            firstIncomplete >= 0 -> firstIncomplete
            setResults.isEmpty() -> 0
            else -> setResults.lastIndex.coerceAtLeast(0)
        }
    }

    private fun resolveCurrentSegmentIndex(match: MatchMVP): Int {
        val firstIncomplete = match.segments.indexOfFirst { segment -> segment.status != "COMPLETE" }
        return when {
            firstIncomplete >= 0 -> firstIncomplete
            match.segments.isNotEmpty() -> match.segments.lastIndex
            else -> resolveCurrentSetIndex(match.setResults)
        }
    }
}

private fun isBracketMatch(match: MatchMVP): Boolean {
    return match.losersBracket ||
        !match.previousLeftId.isNullOrBlank() ||
        !match.previousRightId.isNullOrBlank() ||
        !match.winnerNextMatchId.isNullOrBlank() ||
        !match.loserNextMatchId.isNullOrBlank()
}

internal fun canIncrementCurrentSegment(
    match: MatchMVP,
    rules: ResolvedMatchRulesMVP,
    currentEvent: Event?,
    setIndex: Int,
): Boolean {
    if (rules.scoringModel != "SETS") return true
    val pointsToVictory = resolvePointsToVictory(match, currentEvent, setIndex) ?: return true
    val team1Score = match.team1Points.getOrElse(setIndex) { 0 }
    val team2Score = match.team2Points.getOrElse(setIndex) { 0 }
    return !isValidFinalSetScore(team1Score, team2Score, pointsToVictory)
}

internal fun canConfirmCurrentSegment(
    match: MatchMVP,
    rules: ResolvedMatchRulesMVP,
    currentEvent: Event?,
    setIndex: Int,
): Boolean {
    val team1Score = match.team1Points.getOrElse(setIndex) { 0 }
    val team2Score = match.team2Points.getOrElse(setIndex) { 0 }
    return when (rules.scoringModel) {
        "SETS" -> {
            if (team1Score == team2Score) {
                false
            } else {
                resolvePointsToVictory(match, currentEvent, setIndex)?.let { pointsToVictory ->
                    isValidFinalSetScore(team1Score, team2Score, pointsToVictory)
                } ?: true
            }
        }

        "POINTS_ONLY" -> rules.supportsDraw || team1Score != team2Score
        else -> true
    }
}

private fun isValidFinalSetScore(team1Score: Int, team2Score: Int, target: Int): Boolean {
    val leaderScore = maxOf(team1Score.coerceAtLeast(0), team2Score.coerceAtLeast(0))
    val trailingScore = minOf(team1Score.coerceAtLeast(0), team2Score.coerceAtLeast(0))
    val requiredWinningScore = maxOf(target, trailingScore + 2)
    return leaderScore == requiredWinningScore
}

internal fun resolvePointsToVictory(match: MatchMVP, currentEvent: Event?, setIndex: Int): Int? {
    if (currentEvent == null || resolveActiveRules(match, currentEvent).scoringModel != "SETS") return null

    val matchPointTarget = match.matchRulesSnapshot?.setPointTargets?.getOrNull(setIndex)
        ?: match.resolvedMatchRules?.setPointTargets?.getOrNull(setIndex)
    if (matchPointTarget != null && matchPointTarget > 0) {
        return matchPointTarget
    }

    val points = when {
        currentEvent.eventType == EventType.LEAGUE && !isBracketMatch(match) ->
            currentEvent.pointsToVictory.getOrNull(setIndex)
        match.losersBracket ->
            currentEvent.loserBracketPointsToVictory.getOrNull(setIndex)
        else ->
            currentEvent.winnerBracketPointsToVictory.getOrNull(setIndex)
    }
    return points?.takeIf { it > 0 }
}

internal fun resolveActiveRules(match: MatchMVP, currentEvent: Event?): ResolvedMatchRulesMVP {
    val eventRules = currentEvent?.let { current ->
        runCatching { resolveEventMatchRules(current, sport = null) }.getOrNull()
    }
    val source = match.matchRulesSnapshot
        ?: match.resolvedMatchRules
        ?: eventRules
    val fallbackModel = if (currentEvent?.usesSets == true) "SETS" else "POINTS_ONLY"
    val scoringModel = source?.scoringModel
        ?.trim()
        ?.uppercase()
        ?.takeIf { it in setOf("SETS", "PERIODS", "INNINGS", "POINTS_ONLY") }
        ?: fallbackModel
    val fallbackSegmentCount = listOf(
        match.segments.size,
        match.setResults.size,
        match.team1Points.size,
        match.team2Points.size,
        1,
    ).maxOrNull() ?: 1
    val explicitSegmentCount = when {
        match.matchRulesSnapshot != null -> source?.segmentCount?.takeIf { it > 0 }
        scoringModel == "SETS" -> null
        else -> source?.segmentCount?.takeIf { it > 0 }
    }
    val contextualSegmentCount = contextualSegmentCountForMatch(
        match = match,
        currentEvent = currentEvent,
        fallbackSegmentCount = fallbackSegmentCount,
        scoringModel = scoringModel,
    )
    val segmentCount = when {
        explicitSegmentCount != null -> explicitSegmentCount
        scoringModel == "SETS" -> {
            listOfNotNull(
                contextualSegmentCount,
                source?.segmentCount?.takeIf { it > 0 },
                fallbackSegmentCount,
            ).maxOrNull()?.coerceAtLeast(1) ?: 1
        }
        scoringModel == "POINTS_ONLY" -> 1
        else -> listOfNotNull(
            source?.segmentCount?.takeIf { it > 0 },
            fallbackSegmentCount,
        ).maxOrNull()?.coerceAtLeast(1) ?: 1
    }

    val supportsShootout = source?.supportsShootout ?: false

    return ResolvedMatchRulesMVP(
        scoringModel = scoringModel,
        segmentCount = segmentCount,
        segmentLabel = source?.segmentLabel?.takeIf(String::isNotBlank) ?: when (scoringModel) {
            "SETS" -> "Set"
            "INNINGS" -> "Inning"
            "POINTS_ONLY" -> "Total"
            else -> "Period"
        },
        setPointTargets = source?.setPointTargets ?: emptyList(),
        supportsDraw = source?.supportsDraw == true && !supportsShootout,
        supportsOvertime = source?.supportsOvertime ?: false,
        supportsShootout = supportsShootout,
        canUseOvertime = source?.canUseOvertime ?: source?.supportsOvertime ?: false,
        canUseShootout = source?.canUseShootout ?: source?.supportsShootout ?: false,
        officialRoles = source?.officialRoles ?: emptyList(),
        supportedIncidentTypes = source?.supportedIncidentTypes
            ?.takeIf { it.isNotEmpty() }
            ?: listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN"),
        incidentTypeDefinitions = source?.incidentTypeDefinitions ?: emptyList(),
        autoCreatePointIncidentType = source?.autoCreatePointIncidentType ?: "POINT",
        pointIncidentRequiresParticipant = currentEvent?.autoCreatePointMatchIncidents
            ?: source?.pointIncidentRequiresParticipant
            ?: false,
        timekeeping = source?.timekeeping ?: ResolvedMatchRulesMVP().timekeeping,
    )
}

private fun contextualSegmentCountForMatch(
    match: MatchMVP,
    currentEvent: Event?,
    fallbackSegmentCount: Int,
    scoringModel: String,
): Int? {
    if (scoringModel != "SETS" || currentEvent == null) {
        return null
    }
    return when {
        match.losersBracket -> currentEvent.loserSetCount.coerceAtLeast(1)
        currentEvent.eventType == EventType.LEAGUE && !isBracketMatch(match) ->
            (currentEvent.setsPerMatch ?: fallbackSegmentCount).coerceAtLeast(1)
        else -> currentEvent.winnerSetCount.coerceAtLeast(1)
    }
}

internal fun shouldRequireScoringIncident(
    rules: ResolvedMatchRulesMVP,
    event: Event?,
): Boolean {
    return event?.autoCreatePointMatchIncidents ?: rules.pointIncidentRequiresParticipant
}

internal fun isScoringIncidentType(type: String?): Boolean = when (type?.trim()?.uppercase()) {
    "POINT", "GOAL", "RUN", "SCORE" -> true
    else -> false
}

private data class OfficialUserLookup(
    val userIds: List<String>,
    val eventId: String,
    val currentUser: UserData,
)

private data class PendingIncidentAction(
    val incident: MatchIncidentMVP,
    val operation: MatchIncidentOperationDto,
)

private data class PendingDirectScoreSync(
    val match: MatchMVP,
    val segmentId: String?,
    val sequence: Int,
    val eventTeamId: String,
    val editVersion: Long,
    val points: Int,
)

private class Cleanup(
    private val matchRepository: IMatchRepository,
    private val realtimePauseReason: String,
) : InstanceKeeper.Instance {
    override fun onDestroy() {
        matchRepository.setIgnoreMatch(null)
        matchRepository.setRealtimePaused(realtimePauseReason, false)
    }
}

private fun officialUserIdsForMatch(match: MatchMVP): List<String> =
    (
        match.normalizedOfficialAssignments().map { assignment -> assignment.userId } +
            listOfNotNull(match.officialId)
        )
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
