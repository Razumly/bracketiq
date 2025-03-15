package com.razumly.mvp.matchDetailScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.math.ceil

interface MatchContentComponent {
    val match: StateFlow<MatchWithRelations>
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
    selectedMatch: MatchWithRelations,
) : MatchContentComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val match = mvpRepository
        .getMatchFlow(selectedMatch.match.id)
        .stateIn(scope, SharingStarted.Eagerly, selectedMatch)

    override val tournament = mvpRepository
        .getTournamentFlow(selectedMatch.match.tournamentId)
        .stateIn(scope, SharingStarted.Eagerly, null)

    override val currentTeams = mvpRepository
        .getTeamsInTournamentFlow(selectedMatch.match.tournamentId)
        .stateIn(scope, SharingStarted.Eagerly, mapOf())

    private val _matchFinished = MutableStateFlow(false)
    override val matchFinished = _matchFinished.asStateFlow()

    private val _refCheckedIn = MutableStateFlow(selectedMatch.match.refCheckedIn ?: false)
    override val refCheckedIn: StateFlow<Boolean> = _refCheckedIn.asStateFlow()

    private val _currentSet = MutableStateFlow(0)
    override val currentSet = _currentSet.asStateFlow()

    private val _isRef = MutableStateFlow(false)
    override val isRef = _isRef.asStateFlow()

    private val _showRefCheckInDialog = MutableStateFlow(false)
    override val showRefCheckInDialog = _showRefCheckInDialog.asStateFlow()

    private val _showSetConfirmDialog = MutableStateFlow(false)
    override val showSetConfirmDialog = _showSetConfirmDialog.asStateFlow()

    private lateinit var _currentUser: UserWithRelations

    private var maxSets = 0

    private var setsNeeded = 0

    init {
        scope.launch {
            tournament.collect { tournament ->
                tournament?.let { t ->
                    maxSets = if (match.value.match.losersBracket) {
                        t.loserSetCount
                    } else {
                        t.winnerSetCount
                    }
                    setsNeeded = ceil((maxSets.toDouble()) / 2).toInt()
                }
            }
        }
        scope.launch {
            mvpRepository.setIgnoreMatch(selectedMatch.match)
            _currentUser = mvpRepository.getCurrentUser()!!
            checkRefStatus()
        }
        scope.launch {
            currentTeams.collect { teams ->
                Napier.d("update teams $teams")
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
        _isRef.value = match.value.ref?.id == _currentUser.teams.first().id
        _showRefCheckInDialog.value = refCheckedIn.value != true
    }

    override fun confirmRefCheckIn() {
        scope.launch {
            val updatedMatch = match.value.copy(
                match = match.value.match.copy(
                    refCheckedIn = true,
                    refId = _currentUser.teams.first().id
                ),
            )
            _refCheckedIn.value = true
            _isRef.value = true
            dismissRefDialog()
            mvpRepository.updateMatchSafe(updatedMatch.match)
        }
    }

    override fun updateScore(isTeam1: Boolean, increment: Boolean) {
        if (!refCheckedIn.value) return

        scope.launch {
            val currentPoints = if (isTeam1) {
                match.value.match.team1Points.toMutableList()
            } else {
                match.value.match.team2Points.toMutableList()
            }

            val pointLimit = if (match.value.match.losersBracket) {
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
                match.value.copy(match = match.value.match.copy(team1Points = currentPoints))
            } else {
                match.value.copy(match = match.value.match.copy(team2Points = currentPoints))
            }

            checkSetCompletion(updatedMatch)
            mvpRepository.updateMatchUnsafe(updatedMatch.match)
        }
    }

    override fun confirmSet() {
        _showSetConfirmDialog.value = false

        scope.launch {
            val setResults = match.value.match.setResults.toMutableList()
            val team1Won = match.value.match.team1Points[currentSet.value] >
                    match.value.match.team2Points[currentSet.value]
            setResults[currentSet.value] = if (team1Won) 1 else 2

            val updatedMatch = match.value.copy(
                match = match.value.match.copy(setResults = setResults)
            )

            if (isMatchOver(updatedMatch)) {
                _matchFinished.value = true
                updatedMatch.match.end?.let {
                    mvpRepository.updateMatchFinished(updatedMatch.match,
                        it
                    )
                }
            }

            if (currentSet.value + 1 < maxSets) {
                _currentSet.value++
            }
            mvpRepository.updateMatchSafe(updatedMatch.match)
        }
    }

    private fun isMatchOver(match: MatchWithRelations): Boolean {
        val team1Wins = match.match.setResults.count { it == 1 }
        val team2Wins = match.match.setResults.count { it == 2 }
        return team1Wins >= setsNeeded || team2Wins >= setsNeeded
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