@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.isUserAssignedToOfficialSlot
import com.razumly.mvp.core.data.dataTypes.isUserCheckedInForOfficialSlot
import com.razumly.mvp.core.data.dataTypes.normalizedOfficialAssignments
import com.razumly.mvp.core.data.dataTypes.updateOfficialAssignmentCheckIn
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserVisibilityContext
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.core.network.dto.MatchSegmentOperationDto
import com.razumly.mvp.eventDetail.resolveEventMatchRules
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

private const val LOCAL_MATCH_INCIDENT_PREFIX = "client:match-incident:"
private const val MATCH_INCIDENT_UPLOAD_PENDING = "PENDING"
private const val MATCH_INCIDENT_UPLOAD_FAILED = "FAILED"

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
    val currentSet: StateFlow<Int>
    val isOfficial: StateFlow<Boolean>
    val showOfficialCheckInDialog: StateFlow<Boolean>
    val showSetConfirmDialog: StateFlow<Boolean>
    val errorState: StateFlow<String?>

    fun dismissSetDialog()
    fun dismissOfficialDialog()
    fun checkOfficialStatus()
    fun confirmOfficialCheckIn()
    fun startMatch()
    fun updateActualTimes(actualStart: Instant?, actualEnd: Instant?)
    fun selectSegment(index: Int)
    fun updateScore(isTeam1: Boolean, increment: Boolean)
    fun recordPointIncident(
        isTeam1: Boolean,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
        note: String?,
    )
    fun recordMatchIncident(
        eventTeamId: String?,
        incidentType: String,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
        note: String?,
    )
    fun removeMatchIncident(incidentId: String)
    fun requestSetConfirmation()
    fun confirmSet()
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

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultMatchContentComponent(
    componentContext: ComponentContext,
    selectedMatch: MatchWithRelations,
    selectedEvent: Event?,
    eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
) : MatchContentComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    override val event =
        eventRepository.getEventWithRelationsFlow(selectedMatch.match.eventId)
            .distinctUntilChanged()
            .map { eventResult ->
                eventResult.map { it.event }.getOrElse {
                    _errorState.value = it.userMessage()
                    selectedEvent
                }
            }.stateIn(scope, SharingStarted.Eagerly, selectedEvent)

    private val _optimisticMatch = MutableStateFlow<MatchWithTeams?>(null)
    private val localMatchSaveMutex = Mutex()
    private val scoreSetMutex = Mutex()
    private var localMatchSaveVersion = 0L

    override val matchWithTeams = _optimisticMatch.flatMapLatest { optimisticMatch ->
        if (optimisticMatch != null) {
            flowOf(optimisticMatch)
        } else {
            matchRepository.getMatchFlow(selectedMatch.match.id).distinctUntilChanged()
                .flatMapLatest { dbResult ->
                    val baseMatch = dbResult.getOrElse {
                        _errorState.value = it.userMessage()
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

    private val pendingUpdates = mutableListOf<MatchMVP>()
    private var isProcessingUpdates = false

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

    private val _currentSet = MutableStateFlow(0)
    override val currentSet = _currentSet.asStateFlow()

    private val _isOfficial = MutableStateFlow(false)
    override val isOfficial = _isOfficial.asStateFlow()

    private val _showOfficialCheckInDialog = MutableStateFlow(false)
    override val showOfficialCheckInDialog = _showOfficialCheckInDialog.asStateFlow()

    private val _showSetConfirmDialog = MutableStateFlow(false)
    override val showSetConfirmDialog = _showSetConfirmDialog.asStateFlow()

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
        scope.launch {
            event.collect {
                val normalizedMatch = updateMatchStructureForCurrentContext(matchWithTeams.value.match)
                _matchFinished.value = isMatchOver(normalizedMatch)
                if (!_matchFinished.value) {
                    _currentSet.value = resolveCurrentSegmentIndex(normalizedMatch)
                }
                checkOfficialStatus()
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(selectedMatch.match)
            matchWithTeams.collect {
                val normalizedMatch = updateMatchStructureForCurrentContext(it.match)
                _matchFinished.value = isMatchOver(normalizedMatch)
                if (!_matchFinished.value) {
                    _currentSet.value = resolveCurrentSegmentIndex(normalizedMatch)
                }
                checkOfficialStatus()
            }
        }
        scope.launch {
            _currentUserTeams.collect {
                checkOfficialStatus()
            }
        }
    }

    override fun dismissSetDialog() {
        _showSetConfirmDialog.value = false
    }

    override fun dismissOfficialDialog() {
        _showOfficialCheckInDialog.value = false
    }

    override fun checkOfficialStatus() {
        val currentMatch = matchWithTeams.value.match
        val teamOfficialId = normalizeOptionalId(currentMatch.teamOfficialId)
        val teamIds = currentUserTeamIds().toSet()
        val isAssignedTeamOfficial = teamOfficialId != null && teamIds.contains(teamOfficialId)
        val isAssignedUserOfficial = currentMatch.isUserAssignedToOfficialSlot(currentUser.id)
        val canCheckIn = canCheckIntoMatch(currentMatch)
        val checkedIn = when {
            isAssignedUserOfficial -> currentMatch.isUserCheckedInForOfficialSlot(currentUser.id)
            else -> currentMatch.officialCheckedIn == true
        }
        val canSwapIntoOfficial = !checkedIn && canCurrentUserSwapIntoOfficial(currentMatch)

        _isOfficial.value = isAssignedTeamOfficial || isAssignedUserOfficial
        _officialCheckedIn.value = checkedIn
        _showOfficialCheckInDialog.value = canCheckIn && !checkedIn && (_isOfficial.value || canSwapIntoOfficial)
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
                    currentTeamOfficialId != null && teamIds.contains(currentTeamOfficialId)
                val isAssignedUserOfficial = currentMatch.isUserAssignedToOfficialSlot(currentUser.id)
                val canSwap = canCurrentUserSwapIntoOfficial(currentMatch)
                if (!canCheckIntoMatch(currentMatch)) {
                    dismissOfficialDialog()
                    _errorState.value = "Officials can only check in after both teams are assigned."
                    return@launch
                }
                val checkedIn = when {
                    isAssignedUserOfficial -> currentMatch.isUserCheckedInForOfficialSlot(currentUser.id)
                    else -> currentMatch.officialCheckedIn == true
                }

                if (checkedIn) {
                    dismissOfficialDialog()
                    _officialCheckedIn.value = true
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
                        dismissOfficialDialog()
                        _officialCheckedIn.value = true
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
                    _showOfficialCheckInDialog.value = true
                }.onFailure {
                    _errorState.value = it.userMessage()
                }
            } finally {
                _officialCheckInSaving.value = false
            }
        }
    }

    override fun startMatch() {
        if (_matchStartSaving.value) return
        val currentMatch = matchWithTeams.value.match
        if (!isOfficial.value || officialCheckedIn.value != true || _matchFinished.value) {
            return
        }
        if (!currentMatch.actualStart.isNullOrBlank()) {
            return
        }

        _matchStartSaving.value = true
        scope.launch {
            try {
                val startTime = Clock.System.now()
                val updatedMatch = currentMatch.copy(
                    status = "IN_PROGRESS",
                    actualStart = startTime.toString(),
                )
                matchRepository.updateMatchOperations(
                    match = updatedMatch,
                    lifecycle = MatchLifecycleOperationDto(
                        status = "IN_PROGRESS",
                        actualStart = startTime.toString(),
                        actualEnd = currentMatch.actualEnd,
                    ),
                ).onSuccess {
                    _optimisticMatch.value = null
                }.onFailure { error ->
                    _errorState.value = "Failed to start match: ${error.userMessage()}"
                }
            } finally {
                _matchStartSaving.value = false
            }
        }
    }

    override fun updateActualTimes(actualStart: Instant?, actualEnd: Instant?) {
        if (_matchTimeSaving.value) return
        if (!isOfficial.value || officialCheckedIn.value != true) {
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

    private fun normalizeOptionalId(rawId: String?): String? {
        val normalized = rawId?.trim()
        return normalized?.takeIf(String::isNotBlank)
    }

    override fun updateScore(isTeam1: Boolean, increment: Boolean) {
        if (!isOfficial.value || officialCheckedIn.value != true || matchFinished.value) {
            return
        }
        val activeRules = resolveActiveRules(matchWithTeams.value.match, event.value)
        if (increment && shouldRequireScoringIncident(activeRules, event.value)) {
            _errorState.value = "Scoring details are required for this match."
            return
        }

        val currentMatch = matchWithTeams.value
        val scoringMatch = updateMatchStructureForCurrentContext(currentMatch.match)
        val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
        val activeSegment = scoringMatch.segments.getOrNull(setIndex) ?: return
        if (activeSegment.status == "COMPLETE") {
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
        queueScoreSet(
            match = updatedScoringMatch,
            segmentId = activeSegment.id,
            sequence = activeSegment.sequence,
            eventTeamId = eventTeamId,
            points = updatedScoringMatch.segments.getOrNull(setIndex)?.scores?.get(eventTeamId) ?: 0,
        )
    }

    override fun recordPointIncident(
        isTeam1: Boolean,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
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
            note = note,
        )
    }

    override fun recordMatchIncident(
        eventTeamId: String?,
        incidentType: String,
        eventRegistrationId: String?,
        participantUserId: String?,
        minute: Int?,
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
        val scoringIncident = isScoringIncidentType(normalizedIncidentType)
        val normalizedEventTeamId = eventTeamId?.trim()?.takeIf(String::isNotBlank)
        if (scoringIncident && normalizedEventTeamId == null) {
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
        val localIncident = buildPendingIncident(
            match = updatedScoringMatch,
            segment = updatedSegment,
            eventTeamId = normalizedEventTeamId,
            eventRegistrationId = eventRegistrationId,
            participantUserId = participantUserId,
            officialUserId = currentUser.id.takeIf(String::isNotBlank),
            incidentType = normalizedIncidentType,
            linkedPointDelta = if (scoringIncident) 1 else null,
            minute = minute,
            note = note,
        )
        val updatedScoringMatchWithIncident = updatedScoringMatch.copy(
            incidents = (updatedScoringMatch.incidents + localIncident)
                .sortedWith(compareBy<MatchIncidentMVP> { it.sequence }.thenBy { it.id }),
        )
        _optimisticMatch.value = currentMatch.copy(match = updatedScoringMatchWithIncident)
        checkSetCompletion(updatedScoringMatchWithIncident)

        scope.launch {
            matchRepository.saveMatchLocally(updatedScoringMatchWithIncident)
            matchRepository.addMatchIncident(
                match = updatedScoringMatchWithIncident,
                operation = localIncident.toCreateIncidentOperation(),
            ).onSuccess {
                _optimisticMatch.value = null
            }.onFailure {
                val failedMatch = markLocalIncidentUploadStatus(
                    match = updatedScoringMatchWithIncident,
                    incidentId = localIncident.id,
                    uploadStatus = MATCH_INCIDENT_UPLOAD_FAILED,
                )
                matchRepository.saveMatchLocally(failedMatch)
                _optimisticMatch.value = currentMatch.copy(match = failedMatch)
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
        val updatedMatch = scoringMatch
            .removeIncidentScore(incident)
            .copy(incidents = scoringMatch.incidents.filterNot { row -> row.id == normalizedIncidentId })
        _optimisticMatch.value = currentMatch.copy(match = updatedMatch)

        scope.launch {
            matchRepository.saveMatchLocally(updatedMatch)
            if (incident.isPendingUpload()) {
                _optimisticMatch.value = null
                return@launch
            }
            matchRepository.updateMatchOperations(
                match = updatedMatch,
                incidentOperations = listOf(MatchIncidentOperationDto(action = "DELETE", id = incident.id)),
            ).onSuccess {
                _optimisticMatch.value = null
            }.onFailure { error ->
                _errorState.value = "Failed to remove incident: ${error.userMessage()}"
                matchRepository.saveMatchLocally(scoringMatch)
                _optimisticMatch.value = currentMatch.copy(match = scoringMatch)
            }
        }
    }


    override fun requestSetConfirmation() {
        if (matchFinished.value || !isOfficial.value || officialCheckedIn.value != true) return

        val scoringMatch = updateMatchStructureForCurrentContext(matchWithTeams.value.match)
        val rules = resolveActiveRules(scoringMatch, event.value)
        val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
        val team1Score = scoringMatch.team1Points.getOrElse(setIndex) { 0 }
        val team2Score = scoringMatch.team2Points.getOrElse(setIndex) { 0 }

        if (rules.scoringModel == "SETS" && team1Score == team2Score) {
            _errorState.value = "Set score cannot be tied."
            return
        }

        if (rules.scoringModel == "POINTS_ONLY" && !rules.supportsDraw && team1Score == team2Score) {
            _errorState.value = "Match score cannot be tied."
            return
        }

        _showSetConfirmDialog.value = true
    }


    override fun confirmSet() {
        if (matchFinished.value || !isOfficial.value || officialCheckedIn.value != true) {
            _showSetConfirmDialog.value = false
            return
        }
        _showSetConfirmDialog.value = false

        scope.launch {
            val currentMatch = matchWithTeams.value
            val scoringMatch = updateMatchStructureForCurrentContext(currentMatch.match)
            val rules = resolveActiveRules(scoringMatch, event.value)
            val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
            val team1Score = scoringMatch.team1Points.getOrElse(setIndex) { 0 }
            val team2Score = scoringMatch.team2Points.getOrElse(setIndex) { 0 }

            if (rules.scoringModel == "SETS" && team1Score == team2Score) {
                _errorState.value = "Set score cannot be tied."
                return@launch
            }

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

            if (isMatchOver(updatedScoringMatch)) {
                val endTime = updatedScoringMatch.end ?: updatedScoringMatch.start ?: Clock.System.now()
                syncMatchImmediately(
                    match = updatedScoringMatch,
                    finalize = true,
                    time = endTime,
                    saveLocallyBeforeRemote = false,
                )
            } else {
                syncMatchImmediately(
                    match = updatedScoringMatch,
                    saveLocallyBeforeRemote = false,
                )
            }
        }
    }


    private fun queueDatabaseUpdate(match: MatchMVP) {
        pendingUpdates.add(match)
        scope.launch {
            persistMatchLocally(match, clearOptimisticOnSuccess = true)
        }
        scope.launch {
            delay(500)
            processPendingUpdates()
        }
    }

    private fun queueScoreSet(
        match: MatchMVP,
        segmentId: String?,
        sequence: Int,
        eventTeamId: String,
        points: Int,
    ) {
        scope.launch {
            if (!persistMatchLocally(match, clearOptimisticOnSuccess = true)) {
                return@launch
            }
            scoreSetMutex.withLock {
                matchRepository.setMatchScore(
                    match = match,
                    segmentId = segmentId,
                    sequence = sequence,
                    eventTeamId = eventTeamId,
                    points = points,
                ).onSuccess {
                    _optimisticMatch.value = null
                }.onFailure { error ->
                    _errorState.value = "Failed to sync score: ${error.userMessage()}"
                }
            }
        }
    }

    private suspend fun processPendingUpdates() {
        if (isProcessingUpdates || pendingUpdates.isEmpty()) return

        isProcessingUpdates = true

        try {
            // Get the latest update (most recent state)
            val latestUpdate = pendingUpdates.lastOrNull()
            pendingUpdates.clear()

            latestUpdate?.let { match ->
                matchRepository.updateMatch(match).onFailure { error ->
                    _errorState.value = "Failed to update score: ${error.userMessage()}"
                }
            }
        } finally {
            isProcessingUpdates = false
        }
    }

    private fun syncMatchImmediately(
        match: MatchMVP,
        finalize: Boolean = false,
        time: Instant? = null,
        saveLocallyBeforeRemote: Boolean = true,
    ) {
        scope.launch {
            // Clear any pending updates since we're syncing now
            pendingUpdates.clear()
            if (saveLocallyBeforeRemote) {
                if (!persistMatchLocally(match, clearOptimisticOnSuccess = true)) {
                    return@launch
                }
            }

            val pendingIncidentOperations = pendingIncidentOperationsFor(match)
            for (operation in pendingIncidentOperations) {
                val retryResult = matchRepository.addMatchIncident(match = match, operation = operation)
                if (retryResult.isFailure) {
                    if (!saveLocallyBeforeRemote) {
                        _optimisticMatch.value = null
                    }
                    _errorState.value = "Failed to sync match: ${
                        retryResult.exceptionOrNull()?.userMessage() ?: "Unknown error"
                    }"
                    return@launch
                }
            }
            if (finalize || pendingIncidentOperations.isNotEmpty()) {
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
                }
            } else {
                matchRepository.updateMatch(match).onSuccess {
                    // Clear optimistic state since database is now up to date
                    _optimisticMatch.value = null
                }.onFailure { error ->
                    _errorState.value = "Failed to sync match: ${error.userMessage()}"
                    if (!saveLocallyBeforeRemote) {
                        _optimisticMatch.value = null
                    }
                }
            }
        }
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
        val team1Score = match.team1Points.getOrElse(setIndex) { 0 }
        val team2Score = match.team2Points.getOrElse(setIndex) { 0 }

        if (team1Score == team2Score || matchFinished.value) return false

        val isTeam1Leader = team1Score > team2Score
        val leaderScore = if (isTeam1Leader) team1Score else team2Score
        val followerScore = if (isTeam1Leader) team2Score else team1Score

        val pointsToVictory = resolvePointsToVictory(match, setIndex) ?: return false

        val winBy2 = leaderScore - followerScore >= 2 && leaderScore >= pointsToVictory

        if (winBy2) {
            _showSetConfirmDialog.value = true
            return true
        }

        return false
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
        val explicitCount = rules.segmentCount.coerceAtLeast(1)
        if (match.matchRulesSnapshot != null || match.resolvedMatchRules != null) {
            return explicitCount
        }

        val fallbackSetCount = listOf(
            match.segments.size,
            match.setResults.size,
            match.team1Points.size,
            match.team2Points.size,
            1,
        ).maxOrNull() ?: 1

        if (rules.scoringModel == "POINTS_ONLY") {
            return 1
        }
        if (rules.scoringModel != "SETS") {
            return fallbackSetCount
        }

        val currentEvent = event.value ?: return fallbackSetCount

        val isBracketMatch = isBracketMatch(match)
        return when {
            match.losersBracket -> currentEvent.loserSetCount.coerceAtLeast(1)
            currentEvent.eventType == EventType.LEAGUE && !isBracketMatch -> {
                (currentEvent.setsPerMatch ?: fallbackSetCount).coerceAtLeast(1)
            }
            else -> currentEvent.winnerSetCount.coerceAtLeast(1)
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
            linkedPointDelta = linkedPointDelta,
            note = note?.trim()?.takeIf(String::isNotBlank),
            uploadStatus = MATCH_INCIDENT_UPLOAD_PENDING,
        )
    }

    private fun MatchIncidentMVP.isPendingUpload(): Boolean =
        uploadStatus == MATCH_INCIDENT_UPLOAD_PENDING ||
            uploadStatus == MATCH_INCIDENT_UPLOAD_FAILED ||
            id.startsWith(LOCAL_MATCH_INCIDENT_PREFIX)

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

    private fun pendingIncidentOperationsFor(match: MatchMVP): List<MatchIncidentOperationDto> =
        match.incidents
            .filter { incident -> incident.isPendingUpload() }
            .map { incident -> incident.toCreateIncidentOperation() }

    private fun markLocalIncidentUploadStatus(
        match: MatchMVP,
        incidentId: String,
        uploadStatus: String,
    ): MatchMVP = match.copy(
        incidents = match.incidents.map { incident ->
            if (incident.id == incidentId) {
                incident.copy(uploadStatus = uploadStatus)
            } else {
                incident
            }
        },
    )

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

    private fun resolvePointsToVictory(match: MatchMVP, setIndex: Int): Int? {
        val currentEvent = event.value ?: return null
        if (resolveActiveRules(match, currentEvent).scoringModel != "SETS") return null

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

    private fun resolveActiveRules(match: MatchMVP, currentEvent: Event?): ResolvedMatchRulesMVP {
        val source = match.matchRulesSnapshot
            ?: match.resolvedMatchRules
            ?: currentEvent?.let { current ->
                runCatching { resolveEventMatchRules(current, sport = null) }.getOrNull()
            }
        val fallbackModel = if (currentEvent?.usesSets == true) "SETS" else "POINTS_ONLY"
        val scoringModel = source?.scoringModel
            ?.trim()
            ?.uppercase()
            ?.takeIf { it in setOf("SETS", "PERIODS", "INNINGS", "POINTS_ONLY") }
            ?: fallbackModel
        val explicitSegmentCount = source?.segmentCount?.takeIf { it > 0 }
        val fallbackSegmentCount = listOf(
            match.segments.size,
            match.setResults.size,
            match.team1Points.size,
            match.team2Points.size,
            1,
        ).maxOrNull() ?: 1
        val segmentCount = when {
            explicitSegmentCount != null -> explicitSegmentCount
            scoringModel == "SETS" -> {
                val legacyCount = when {
                    currentEvent == null -> fallbackSegmentCount
                    match.losersBracket -> currentEvent.loserSetCount.coerceAtLeast(1)
                    currentEvent.eventType == EventType.LEAGUE && !isBracketMatch(match) ->
                        (currentEvent.setsPerMatch ?: fallbackSegmentCount).coerceAtLeast(1)
                    else -> currentEvent.winnerSetCount.coerceAtLeast(1)
                }
                legacyCount.coerceAtLeast(1)
            }

            scoringModel == "POINTS_ONLY" -> 1
            else -> fallbackSegmentCount.coerceAtLeast(1)
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
            supportsDraw = source?.supportsDraw == true && !supportsShootout,
            supportsOvertime = source?.supportsOvertime ?: false,
            supportsShootout = supportsShootout,
            canUseOvertime = source?.canUseOvertime ?: source?.supportsOvertime ?: false,
            canUseShootout = source?.canUseShootout ?: source?.supportsShootout ?: false,
            officialRoles = source?.officialRoles ?: emptyList(),
            supportedIncidentTypes = source?.supportedIncidentTypes
                ?.takeIf { it.isNotEmpty() }
                ?: listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN"),
            autoCreatePointIncidentType = source?.autoCreatePointIncidentType ?: "POINT",
            pointIncidentRequiresParticipant = source?.pointIncidentRequiresParticipant ?: false,
        )
    }
}

internal fun shouldRequireScoringIncident(
    rules: ResolvedMatchRulesMVP,
    event: Event?,
): Boolean {
    return rules.pointIncidentRequiresParticipant
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

private fun officialUserIdsForMatch(match: MatchMVP): List<String> =
    (
        match.normalizedOfficialAssignments().map { assignment -> assignment.userId } +
            listOfNotNull(match.officialId)
        )
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
