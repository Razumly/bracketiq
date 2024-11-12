package com.razumly.mvp.eventContent.presentation

import com.razumly.mvp.core.data.IAppwriteRepository
import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.buffer

class TournamentContentViewModel(private val appwriteRepository: IAppwriteRepository) :
    ViewModel() {
    private val _selectedTournament = MutableStateFlow<Tournament?>(null)
    val selectedTournament = _selectedTournament.asStateFlow()

    private val _currentMatches = MutableStateFlow<List<Match>>(emptyList())
    val currentMatches = _currentMatches.asStateFlow()

    private val _currentTeams = MutableStateFlow<List<Team>>(emptyList())
    val currentTeams = _currentTeams.asStateFlow()

    private val _selectedDivision = MutableStateFlow<String?>(null)
    val selectedDivision = _selectedDivision.asStateFlow()

    private val _isBracketView = MutableStateFlow(false)
    val isBracketView = _isBracketView.asStateFlow()

    private val _rounds = MutableStateFlow<List<List<Match?>>>(emptyList())
    val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(false)
    val losersBracket = _losersBracket.asStateFlow()

    init {
        viewModelScope.launch {
            appwriteRepository.matchUpdates
                .buffer() // Buffer updates to prevent backpressure
                .collect { updatedMatch ->
                    updateTournamentMatch(updatedMatch)
                }
        }
        viewModelScope.launch {
            _currentMatches.collect { matches ->
                generateRounds(matches)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        viewModelScope.launch {
            appwriteRepository.unsubscribeFromMatches()
        }
    }

    private fun updateTournamentMatch(updatedMatch: Match) {
        _selectedTournament.value?.let { currentTournament ->
            val updatedMatches = currentTournament.matches.toMutableMap()
            updatedMatches[updatedMatch.id] = updatedMatch
            when (updatedMatch.losersBracket) {
                false -> {
                    // Winners bracket connections
                    updatedMatch.previousLeftMatch?.winnerNextMatch = updatedMatch
                    updatedMatch.previousRightMatch?.winnerNextMatch = updatedMatch
                }

                true -> {
                    // Losers bracket connections
                    updatedMatch.previousLeftMatch?.loserNextMatch = updatedMatch
                    updatedMatch.previousRightMatch?.loserNextMatch = updatedMatch
                }
            }

            // Update winner's next match connections
            updatedMatch.winnerNextMatch?.let { winnerMatch ->
                when (updatedMatch.id) {
                    winnerMatch.previousLeftMatch?.id -> winnerMatch.previousLeftMatch =
                        updatedMatch

                    winnerMatch.previousRightMatch?.id -> winnerMatch.previousRightMatch =
                        updatedMatch
                }
            }


            val updatedTournament = currentTournament.copy(matches = updatedMatches)
            _selectedTournament.value = updatedTournament

            if (updatedMatch.division == _selectedDivision.value) {
                val filteredMatches = updatedMatches.values
                    .filter { it.division == _selectedDivision.value }
                _currentMatches.value = filteredMatches
            }
        }
    }

    suspend fun loadTournament(id: String) {
        _selectedTournament.value = appwriteRepository.getTournament(id)
        _selectedTournament.value.let { tournament ->
            if (tournament != null) {
                appwriteRepository.subscribeToMatches(tournament)
            }
        }
        selectedTournament.value?.divisions?.firstOrNull()?.let { selectDivision(it) }
    }

    fun selectDivision(division: String) {
        _selectedDivision.value = division
        _selectedTournament.value?.let { tournament ->
            _currentMatches.value = tournament.matches.values
                .filter { it.division == division }
            _currentTeams.value = tournament.teams.values
                .filter { it.division == division }
        }
    }

    fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    fun toggleLosersBracket() {
        _losersBracket.value = !_losersBracket.value
        generateRounds(_currentMatches.value)
    }

    private fun generateRounds(matches: List<Match?>) {
        if (matches.isEmpty()) {
            _rounds.value = emptyList()
            return
        }

        val rounds = mutableListOf<List<Match?>>()
        val visited = mutableSetOf<String>()

        // Find matches with no previous matches (first round)
        val finalRound = matches.filter {
            it?.winnerNextMatch == null && it?.loserNextMatch == null
        }

        if (finalRound.isNotEmpty()) {
            rounds.add(finalRound)
            visited.addAll(finalRound.mapNotNull { it?.id })
        }

        // Generate subsequent rounds
        var currentRound: List<Match?> = finalRound
        while (currentRound.isNotEmpty()) {
            val nextRound = mutableListOf<Match?>()

            for (match in currentRound.filterNotNull()) {
                if (!validMatch(match)) {
                    nextRound.addAll(listOf(null, null))
                    continue
                }
                if (match.previousLeftMatch == null) {
                    nextRound.add(null)
                } else if (!visited.contains(match.previousLeftMatch?.id)) {
                    nextRound.add(match.previousLeftMatch)
                    visited.add(match.previousLeftMatch!!.id)
                }

                // Add right match
                if (match.previousRightMatch == null) {
                    nextRound.add(null)
                } else if (!visited.contains(match.previousRightMatch?.id)) {
                    nextRound.add(match.previousRightMatch)
                    visited.add(match.previousRightMatch!!.id)
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

    private fun validMatch(match: Match): Boolean {
        return if (losersBracket.value) {
            val finalsMatch =
                match.previousLeftMatch == match.previousRightMatch && match.previousLeftMatch != null
            val mergeMatch =
                match.previousLeftMatch != null && match.previousRightMatch != null &&
                        match.previousLeftMatch?.losersBracket != match.previousRightMatch?.losersBracket
            val opposite = match.losersBracket != losersBracket.value
            val firstRound = match.previousLeftMatch == null && match.previousRightMatch == null

            finalsMatch || mergeMatch || !opposite || firstRound
        } else {
            match.losersBracket == losersBracket.value
        }
    }
}