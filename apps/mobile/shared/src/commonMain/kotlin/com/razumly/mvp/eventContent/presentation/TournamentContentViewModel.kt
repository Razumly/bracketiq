package com.razumly.mvp.eventContent.presentation

import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.MutableStateFlow
import com.rickclephas.kmp.observableviewmodel.launch
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.buffer

class TournamentContentViewModel(
    private val appwriteRepository: IMVPRepository,
    tournamentId: String
) : ViewModel() {
    private val _selectedTournament = MutableStateFlow<Tournament?>(viewModelScope, null)
    val selectedTournament = _selectedTournament.asStateFlow()

    private val _divisionMatches =
        MutableStateFlow<List<MatchWithRelations>>(viewModelScope, emptyList())
    val divisionMatches = _divisionMatches.asStateFlow()

    private val _currentMatches =
        MutableStateFlow<Map<String, MatchWithRelations>>(viewModelScope, emptyMap())
    val currentMatches = _currentMatches.asStateFlow()

    private val _currentTeams =
        MutableStateFlow<Map<String, TeamWithPlayers>>(viewModelScope, emptyMap())
    val currentTeams = _currentTeams.asStateFlow()

    private val _selectedDivision = MutableStateFlow<String?>(viewModelScope, null)
    val selectedDivision = _selectedDivision.asStateFlow()

    private val _isBracketView = MutableStateFlow(viewModelScope, false)
    val isBracketView = _isBracketView.asStateFlow()

    private val _rounds =
        MutableStateFlow<List<List<MatchWithRelations?>>>(viewModelScope, emptyList())
    val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(viewModelScope, false)
    val losersBracket = _losersBracket.asStateFlow()

    init {
        viewModelScope.launch {
            loadTournament(tournamentId)
        }
        viewModelScope.launch {
            appwriteRepository.matchUpdates
                .buffer() // Buffer updates to prevent backpressure
                .collect { updatedMatch ->
                    _currentMatches.value = _currentMatches.value.toMutableMap().apply {
                        put(updatedMatch.match.id, updatedMatch)
                    }

                    if (updatedMatch.match.division == _selectedDivision.value) {
                        _divisionMatches.value = _currentMatches.value.values
                            .filter { it.match.division == _selectedDivision.value }
                    }
                }
        }
        viewModelScope.launch {
            _divisionMatches.collect { generateRounds() }
        }
    }

    override fun onCleared() {
        super.onCleared()
        viewModelScope.launch {
            appwriteRepository.unsubscribeFromRealtime()
        }
    }

    fun selectDivision(division: String) {
        _selectedDivision.value = division
        _divisionMatches.value = _currentMatches.value.values
            .filter { it.match.division == division }
    }

    fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    fun toggleLosersBracket() {
        _losersBracket.value = !_losersBracket.value
        generateRounds()
    }

    private suspend fun loadTournament(id: String) {
        _selectedTournament.value = appwriteRepository.getTournament(id)
        _currentMatches.value = appwriteRepository.getMatches(id)
        _currentTeams.value = appwriteRepository.getTeams(id)
        _selectedTournament.value.let { tournament ->
            if (tournament != null) {
                appwriteRepository.subscribeToMatches()
            }
        }
        selectedTournament.value?.divisions?.firstOrNull()?.let { selectDivision(it) }
    }

    private fun generateRounds() {
        if (_currentMatches.value.isEmpty()) {
            _rounds.value = emptyList()
            return
        }

        val rounds = mutableListOf<List<MatchWithRelations?>>()
        val visited = mutableSetOf<String>()

        // Find matches with no previous matches (first round)
        val finalRound = _currentMatches.value.values.filter {
            it.winnerNextMatch == null && it.loserNextMatch == null
        }

        if (finalRound.isNotEmpty()) {
            rounds.add(finalRound)
            visited.addAll(finalRound.map { it.match.id })
        }

        // Generate subsequent rounds
        var currentRound: List<MatchWithRelations?> = finalRound
        while (currentRound.isNotEmpty()) {
            val nextRound = mutableListOf<MatchWithRelations?>()

            for (match in currentRound.filterNotNull()) {
                if (!validMatch(match)) {
                    nextRound.addAll(listOf(null, null))
                    continue
                }
                if (match.previousLeftMatch == null) {
                    nextRound.add(null)
                } else if (!visited.contains(match.previousLeftMatch.id)) {
                    nextRound.add(currentMatches.value[match.previousLeftMatch.id])
                    visited.add(match.previousLeftMatch.id)
                }

                // Add right match
                if (match.previousRightMatch == null) {
                    nextRound.add(null)
                } else if (!visited.contains(match.previousRightMatch.id)) {
                    nextRound.add(currentMatches.value[match.previousRightMatch.id])
                    visited.add(match.previousRightMatch.id)
                }
            }

            if (nextRound.any { it != null }) {
                rounds.add(nextRound)
                currentRound = nextRound
            } else {
                break
            }
        }

        _rounds.value = rounds.reversed()
    }

    private fun validMatch(match: MatchWithRelations): Boolean {
        return if (losersBracket.value) {
            val finalsMatch =
                match.previousLeftMatch == match.previousRightMatch && match.previousLeftMatch != null
            val mergeMatch =
                match.previousLeftMatch != null && match.previousLeftMatch.losersBracket != match.previousRightMatch?.losersBracket
            val opposite = match.match.losersBracket != losersBracket.value
            val firstRound =
                match.previousLeftMatch == null && match.previousRightMatch == null

            finalsMatch || mergeMatch || !opposite || firstRound
        } else {
            match.match.losersBracket == losersBracket.value
        }
    }
}