package com.razumly.mvp.eventContent.presentation

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

interface MatchContentComponent {
    val match: StateFlow<MatchWithRelations?>
    val tournament: StateFlow<Tournament?>
    val currentTeams: StateFlow<Map<String, TeamWithPlayers>>
    val matchFinished: StateFlow<Boolean>
    val refCheckedIn: StateFlow<Boolean>
    val currentSet: StateFlow<Int>
    val isRef: StateFlow<Boolean>
    val showRefCheckInDialog: StateFlow<Boolean>
    val showSetConfirmDialog: StateFlow<Boolean>

    fun dismissSetDialog()
    fun dismissRefDialog()
    fun checkRefStatus()
    fun confirmRefCheckIn()
    fun updateScore(isTeam1: Boolean, increment: Boolean)
    fun confirmSet()
}

class DefaultMatchContentComponent(
    componentContext: ComponentContext,
    private val mvpRepository: IMVPRepository,
    private val selectedMatch: MatchMVP,
) : MatchContentComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _match = MutableStateFlow<MatchWithRelations?>(null)
    override val match = _match.asStateFlow()

    private val _tournament = MutableStateFlow<Tournament?>(null)
    override val tournament = _tournament.asStateFlow()

    private val _currentTeams = MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
    override val currentTeams = _currentTeams.asStateFlow()

    private val _matchFinished = MutableStateFlow(false)
    override val matchFinished = _matchFinished.asStateFlow()

    private val _refCheckedIn = MutableStateFlow(selectedMatch.refCheckedIn ?: false)
    override val refCheckedIn: StateFlow<Boolean> = _refCheckedIn.asStateFlow()

    private val _currentSet = MutableStateFlow(0)
    override val currentSet = _currentSet.asStateFlow()

    private val _isRef = MutableStateFlow(false)
    override val isRef = _isRef.asStateFlow()

    private val _showRefCheckInDialog = MutableStateFlow(false)
    override val showRefCheckInDialog = _showRefCheckInDialog.asStateFlow()

    private val _showSetConfirmDialog = MutableStateFlow(false)
    override val showSetConfirmDialog = _showSetConfirmDialog.asStateFlow()

    private lateinit var _currentUser: UserData

    init {
        scope.launch {
            _currentTeams.value = mvpRepository.getTeams(selectedMatch.tournamentId)
            _tournament.value = mvpRepository.getTournament(selectedMatch.tournamentId)
            _match.value = mvpRepository.getMatch(selectedMatch.id)
        }

        scope.launch {
            mvpRepository.matchUpdates.collect {
                _match.value = it
                _refCheckedIn.value = it.match.refCheckedIn == true
                checkRefStatus()
            }
        }
        scope.launch {
            _currentUser = mvpRepository.getCurrentUser()!!
        }
    }

    override fun dismissSetDialog() {
        _showSetConfirmDialog.value = false
    }

    override fun dismissRefDialog() {
        _showRefCheckInDialog.value = false
    }

    override fun checkRefStatus() {
        val ref = currentTeams.value[match.value?.match?.refId]
        _isRef.value = ref?.players?.any { it.id == _currentUser.id } == true
        _showRefCheckInDialog.value = refCheckedIn.value != true
    }

    override fun confirmRefCheckIn() {
        scope.launch {
            val updatedMatch = match.value?.copy(
                match = match.value!!.match.copy(
                    refCheckedIn = true,
                    refId = _currentUser.id
                ),
            )
            _refCheckedIn.value = true
            if (updatedMatch != null) {
                mvpRepository.updateMatch(updatedMatch.match)
            }
        }
    }

    override fun updateScore(isTeam1: Boolean, increment: Boolean) {
        if (refCheckedIn.value) return
        if (match.value == null) return

        scope.launch {
            val currentPoints = if (isTeam1) {
                match.value!!.match.team1Points.toMutableList()
            } else {
                match.value!!.match.team2Points.toMutableList()
            }

            val pointLimit = if (match.value!!.match.losersBracket) {
                tournament.value?.loserScoreLimitsPerSet?.get(currentSet.value)
            } else {
                tournament.value?.winnerScoreLimitsPerSet?.get(currentSet.value)
            }

            if (increment && currentPoints[currentSet.value] < pointLimit!!) {
                currentPoints[currentSet.value]++
            } else if (!increment && currentPoints[currentSet.value] > 0) {
                currentPoints[currentSet.value]--
            }

            val updatedMatch = if (isTeam1) {
                match.value!!.copy(match = match.value!!.match.copy(team1Points = currentPoints))
            } else {
                match.value!!.copy(match = match.value!!.match.copy(team2Points = currentPoints))
            }

            checkSetCompletion(updatedMatch)
            _match.value = updatedMatch
            mvpRepository.updateMatch(updatedMatch.match)
        }
    }

    override fun confirmSet() {
        if (match.value == null) return

        scope.launch {
            val setResults = match.value!!.match.setResults.toMutableList()
            val team1Won = match.value!!.match.team1Points[currentSet.value] >
                    match.value!!.match.team2Points[currentSet.value]
            setResults[currentSet.value] = if (team1Won) 1 else 2

            val updatedMatch = match.value!!.copy(
                match = match.value!!.match.copy(setResults = setResults)
            )
            _match.value = updatedMatch
            mvpRepository.updateMatch(updatedMatch.match)

            val setsNeeded = if (match.value!!.match.losersBracket) {
                tournament.value?.loserSetCount
            } else {
                tournament.value?.winnerSetCount
            }

            if (currentSet.value + 1 < setsNeeded!!) {
                _currentSet.value++
            } else {
                _matchFinished.value = true
            }
        }
    }

    private fun checkSetCompletion(match: MatchWithRelations) {
        val team1Score = match.match.team1Points[currentSet.value]
        val team2Score = match.match.team2Points[currentSet.value]
        if (team1Score == team2Score || matchFinished.value) return

        val isTeam1Leader = team1Score > team2Score
        val leaderScore: Int
        val followerScore: Int
        if (isTeam1Leader) {
            leaderScore = team1Score
            followerScore = team2Score
        } else {
            leaderScore = team2Score
            followerScore = team1Score
        }

        val pointLimit = if (match.match.losersBracket) {
            tournament.value?.loserScoreLimitsPerSet?.get(currentSet.value)
        } else {
            tournament.value?.winnerScoreLimitsPerSet?.get(currentSet.value)
        }

        val pointsToVictory = if (match.match.losersBracket) {
            tournament.value?.loserBracketPointsToVictory?.get(currentSet.value)
        } else {
            tournament.value?.winnerBracketPointsToVictory?.get(currentSet.value)
        }
        val winBy2 = leaderScore - followerScore >= 2 && leaderScore >= pointsToVictory!!
        val winByLimit = leaderScore >= pointLimit!!

        if (winBy2 || winByLimit) {
            _showSetConfirmDialog.value = true
        }
    }
}