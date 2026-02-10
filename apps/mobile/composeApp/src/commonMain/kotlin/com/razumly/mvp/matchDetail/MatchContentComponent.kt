@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.eventDetail.data.IMatchRepository
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
import kotlinx.serialization.Serializable
import kotlin.math.ceil
import kotlin.time.ExperimentalTime

interface MatchContentComponent {
    val matchWithTeams: StateFlow<MatchWithTeams>
    val event: StateFlow<Event?>
    val matchFinished: StateFlow<Boolean>
    val refCheckedIn: StateFlow<Boolean>
    val currentSet: StateFlow<Int>
    val isRef: StateFlow<Boolean>
    val showRefCheckInDialog: StateFlow<Boolean>
    val showSetConfirmDialog: StateFlow<Boolean>
    val errorState: StateFlow<String?>

    fun dismissSetDialog()
    fun dismissRefDialog()
    fun checkRefStatus()
    fun confirmRefCheckIn()
    fun updateScore(isTeam1: Boolean, increment: Boolean)
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
    val ref: TeamWithRelations?
)

fun MatchWithRelations.toMatchWithTeams(
    team1: TeamWithRelations?, team2: TeamWithRelations?, ref: TeamWithRelations?
) = MatchWithTeams(
    match = this.match,
    field = this.field,
    winnerNextMatch = this.winnerNextMatch,
    loserNextMatch = this.loserNextMatch,
    previousLeftMatch = this.previousLeftMatch,
    previousRightMatch = this.previousRightMatch,
    team1 = team1,
    team2 = team2,
    ref = ref
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
                eventResult.map { it.event as Event }.getOrElse {
                    _errorState.value = it.message
                    selectedEvent
                }
            }.stateIn(scope, SharingStarted.Eagerly, selectedEvent)

    private val _optimisticMatch = MutableStateFlow<MatchWithTeams?>(null)

    override val matchWithTeams = _optimisticMatch.flatMapLatest { optimisticMatch ->
        if (optimisticMatch != null) {
            flowOf(optimisticMatch)
        } else {
            matchRepository.getMatchFlow(selectedMatch.match.id).distinctUntilChanged()
                .flatMapLatest { dbResult ->
                    val baseMatch = dbResult.getOrElse {
                        _errorState.value = it.message
                        selectedMatch
                    }

                    val team1Flow = baseMatch.match.team1Id?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    val team2Flow = baseMatch.match.team2Id?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    val refFlow = baseMatch.match.teamRefereeId?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    combine(team1Flow, team2Flow, refFlow) { team1Result, team2Result, refResult ->
                        baseMatch.toMatchWithTeams(
                            team1 = team1Result.getOrNull(),
                            team2 = team2Result.getOrNull(),
                            ref = refResult.getOrNull()
                        )
                    }
                }
        }
    }.stateIn(
        scope, SharingStarted.Eagerly, selectedMatch.toMatchWithTeams(null, null, null)
    )

    private val pendingUpdates = mutableListOf<MatchMVP>()
    private var isProcessingUpdates = false

    private val _matchFinished = MutableStateFlow(false)
    override val matchFinished = _matchFinished.asStateFlow()

    private val _refCheckedIn = MutableStateFlow(selectedMatch.match.refereeCheckedIn ?: false)
    override val refCheckedIn: StateFlow<Boolean> = _refCheckedIn.asStateFlow()

    private val _currentSet = MutableStateFlow(0)
    override val currentSet = _currentSet.asStateFlow()

    private val _isRef = MutableStateFlow(false)
    override val isRef = _isRef.asStateFlow()

    private val _showRefCheckInDialog = MutableStateFlow(false)
    override val showRefCheckInDialog = _showRefCheckInDialog.asStateFlow()

    private val _showSetConfirmDialog = MutableStateFlow(false)
    override val showSetConfirmDialog = _showSetConfirmDialog.asStateFlow()

    private val _currentUser = userRepository.currentUser.value.getOrThrow()

    private val _currentUserTeam =
        teamRepository.getTeamsWithPlayersFlow(_currentUser.id).map { teamResults ->
            teamResults.getOrElse {
                _errorState.value = it.message
                emptyList()
            }.find { team ->
                event.value?.id != null && event.value!!.teamIds.contains(team.team.id)
            }
        }.stateIn(scope, SharingStarted.Eagerly, null)

    private var maxSets = 0

    private var setsNeeded = 0

    init {
        scope.launch {
            event.collect { tournament ->
                tournament?.let { t ->
                    maxSets = if (matchWithTeams.value.match.losersBracket) {
                        t.loserSetCount
                    } else {
                        t.winnerSetCount
                    }
                    setsNeeded = ceil((maxSets.toDouble()) / 2).toInt()
                }
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(selectedMatch.match)
            matchWithTeams.collect {
                _matchFinished.value = isMatchOver(it.match)
                if (!_matchFinished.value) {
                    _currentSet.value = it.match.setResults.indexOfFirst { result -> result == 0 }
                }
                checkRefStatus()
            }
        }
    }

    override fun dismissSetDialog() {
        _showSetConfirmDialog.value = false
    }

    override fun dismissRefDialog() {
        _showRefCheckInDialog.value = false
    }

    override fun checkRefStatus() {
        _isRef.value = _currentUser.teamIds.contains(matchWithTeams.value.ref?.team?.id) == true
        _showRefCheckInDialog.value = refCheckedIn.value != true
    }

    override fun confirmRefCheckIn() {
        scope.launch {
            val updatedMatch = matchWithTeams.value.copy(
                match = matchWithTeams.value.match.copy(
                    refereeCheckedIn = true,
                    teamRefereeId = _currentUserTeam.value?.team?.id
                ),
            )
            matchRepository.updateMatch(updatedMatch.match).onSuccess {
                dismissRefDialog()
                _refCheckedIn.value = true
                _isRef.value = true
            }.onFailure {
                _errorState.value = it.message
            }
        }
    }

    override fun updateScore(isTeam1: Boolean, increment: Boolean) {
        val currentMatch = matchWithTeams.value
        if (increment && checkSetCompletion(currentMatch.match)) {
            return
        }

        val currentPoints = if (isTeam1) {
            currentMatch.match.team1Points.toMutableList()
        } else {
            currentMatch.match.team2Points.toMutableList()
        }

        if (increment) {
            currentPoints[currentSet.value]++
        } else if (!increment && currentPoints[currentSet.value] > 0) {
            currentPoints[currentSet.value]--
        }

        val optimisticMatch = if (isTeam1) {
            currentMatch.copy(
                match = currentMatch.match.copy(team1Points = currentPoints)
            )
        } else {
            currentMatch.copy(
                match = currentMatch.match.copy(team2Points = currentPoints)
            )
        }

        _optimisticMatch.value = optimisticMatch

        if (checkSetCompletion(optimisticMatch.match)) {
            syncMatchImmediately(optimisticMatch.match)
        } else {
            queueDatabaseUpdate(optimisticMatch.match)
        }
    }


    override fun confirmSet() {
        _showSetConfirmDialog.value = false

        scope.launch {
            val currentMatch = matchWithTeams.value
            val setResults = currentMatch.match.setResults.toMutableList()
            val team1Won =
                currentMatch.match.team1Points[currentSet.value] > currentMatch.match.team2Points[currentSet.value]

            setResults[currentSet.value] = if (team1Won) 1 else 2

            val updatedMatch = currentMatch.copy(
                match = currentMatch.match.copy(setResults = setResults)
            )

            _optimisticMatch.value = updatedMatch

            if (isMatchOver(updatedMatch.match)) {
                _matchFinished.value = true
                updatedMatch.match.end?.let { endTime ->
                    // For match completion, sync everything immediately
                    matchRepository.updateMatchFinished(updatedMatch.match, endTime).onSuccess {
                        _optimisticMatch.value = null // Clear optimistic state
                    }.onFailure { error ->
                        _errorState.value = "Failed to finish match: ${error.message}"
                    }
                }
            } else {
                if (currentSet.value + 1 < maxSets) {
                    _currentSet.value++
                }

                syncMatchImmediately(updatedMatch.match)
            }
        }
    }


    private fun queueDatabaseUpdate(match: MatchMVP) {
        pendingUpdates.add(match)
        scope.launch {
            delay(500)
            processPendingUpdates()
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
                    _errorState.value = "Failed to update score: ${error.message}"
                    // Revert optimistic update on failure
                    _optimisticMatch.value = null
                }
            }
        } finally {
            isProcessingUpdates = false
        }
    }

    private fun syncMatchImmediately(match: MatchMVP) {
        scope.launch {
            // Clear any pending updates since we're syncing now
            pendingUpdates.clear()

            matchRepository.updateMatch(match).onSuccess {
                // Clear optimistic state since database is now up to date
                _optimisticMatch.value = null
            }.onFailure { error ->
                _errorState.value = "Failed to sync match: ${error.message}"
                // Keep optimistic state on failure
            }
        }
    }

    private fun isMatchOver(match: MatchMVP): Boolean {
        val team1Wins = match.setResults.count { it == 1 }
        val team2Wins = match.setResults.count { it == 2 }
        return team1Wins >= setsNeeded || team2Wins >= setsNeeded
    }

    private fun checkSetCompletion(match: MatchMVP): Boolean {
        val team1Score = match.team1Points[currentSet.value]
        val team2Score = match.team2Points[currentSet.value]

        if (team1Score == team2Score || matchFinished.value) return false

        val isTeam1Leader = team1Score > team2Score
        val leaderScore = if (isTeam1Leader) team1Score else team2Score
        val followerScore = if (isTeam1Leader) team2Score else team1Score

        val pointsToVictory = if (match.losersBracket) {
            event.value?.loserBracketPointsToVictory?.get(currentSet.value)
        } else {
            event.value?.winnerBracketPointsToVictory?.get(currentSet.value)
        }

        val winBy2 = leaderScore - followerScore >= 2 && leaderScore >= pointsToVictory!!

        if (winBy2) {
            _showSetConfirmDialog.value = true
            return true
        }

        return false
    }
}
