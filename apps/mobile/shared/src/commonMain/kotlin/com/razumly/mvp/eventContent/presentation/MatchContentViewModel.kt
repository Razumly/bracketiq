package com.razumly.mvp.eventContent.presentation

import com.razumly.mvp.core.data.IAppwriteRepository
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlin.math.abs

class MatchContentViewModel(
    private val appwriteRepository: IAppwriteRepository,
    selectedMatch: MatchMVP,
    private val currentUserId: String
) :
    ViewModel() {
    private val _match = MutableStateFlow<MatchWithRelations?>(null)
    val match = _match.asStateFlow()

    private val _tournament = MutableStateFlow<Tournament?>(null)
    val tournament = _tournament.asStateFlow()

    private val _currentTeams = MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
    val currentTeams = _currentTeams.asStateFlow()

    private val _matchFinished = MutableStateFlow(false)
    val matchFinished = _matchFinished.asStateFlow()

    private val _refCheckedIn = MutableStateFlow(selectedMatch.refCheckedIn)
    val refCheckedIn = _refCheckedIn.asStateFlow()

    private val _currentSet = MutableStateFlow(0)
    val currentSet = _currentSet.asStateFlow()

    private val _isRef = MutableStateFlow(false)
    val isRef = _isRef.asStateFlow()

    private val _showRefCheckInDialog = MutableStateFlow(false)
    val showRefCheckInDialog = _showRefCheckInDialog.asStateFlow()

    private val _showSetConfirmDialog = MutableStateFlow(false)
    val showSetConfirmDialog = _showSetConfirmDialog.asStateFlow()

    init {
        viewModelScope.launch {
            _currentTeams.value = appwriteRepository.getTeams(selectedMatch.tournamentId)
            _tournament.value = appwriteRepository.getTournament(selectedMatch.tournamentId)
            _match.value = appwriteRepository.getMatch(selectedMatch.id)
        }

        viewModelScope.launch {
            appwriteRepository.matchUpdates.collect {
                _match.value = it
                _refCheckedIn.value = it.match.refCheckedIn
            }
            checkRefStatus()
        }
    }

    fun dismissSetDialog() {
        _showSetConfirmDialog.value = false
    }

    fun dismissRefDialog() {
        _showRefCheckInDialog.value = false
    }

    fun checkRefStatus() {
        val ref = currentTeams.value[match.value?.match?.refId]
        _isRef.value = ref?.players?.any { it.id == currentUserId } == true
        _showRefCheckInDialog.value = !refCheckedIn.value
    }

    fun confirmRefCheckIn() {
        viewModelScope.launch {
            val updatedMatch =
                match.value?.copy(
                    match = match.value!!.match.copy(
                        refCheckedIn = true,
                        refId = currentUserId
                    )
                )
            _refCheckedIn.value = true
            if (updatedMatch != null) {
                appwriteRepository.updateMatch(updatedMatch)
            }
        }
    }

    fun updateScore(isTeam1: Boolean, increment: Boolean) {
        if (!refCheckedIn.value) return
        if (match.value == null) return

        viewModelScope.launch {
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
            appwriteRepository.updateMatch(updatedMatch)
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

    fun confirmSet() {
        if (match.value == null) return

        viewModelScope.launch {
            val setResults = match.value!!.match.setResults.toMutableList()
            val team1Won =
                match.value!!.match.team1Points[currentSet.value] > match.value!!.match.team2Points[currentSet.value]
            setResults[currentSet.value] = if (team1Won) 1 else 2

            val updatedMatch =
                match.value!!.copy(match = match.value!!.match.copy(setResults = setResults))
            _match.value = updatedMatch
            appwriteRepository.updateMatch(updatedMatch)

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
}