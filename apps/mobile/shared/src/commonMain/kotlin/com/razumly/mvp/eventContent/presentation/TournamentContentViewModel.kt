package com.razumly.mvp.eventContent.presentation

import com.razumly.mvp.core.data.AppwriteRepository
import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class TournamentContentViewModel(private val appwriteRepository: AppwriteRepository) : ViewModel() {
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

    suspend fun loadTournament(id: String) {
        _selectedTournament.value = appwriteRepository.getTournament(id)
        selectedTournament.value?.divisions?.firstOrNull()?.let { selectDivision(it) }
    }

    fun selectDivision(division: String) {
        _selectedDivision.value = division
        _currentMatches.value =
            _selectedTournament.value?.matches?.values?.filter { it.division == division }
                ?: emptyList()
        _currentTeams.value =
            _selectedTournament.value?.teams?.values?.filter { it.division == division }
                ?: emptyList()
        generateRounds(_currentMatches.value)
    }

    fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    fun toggleLosersBracket() {
        _losersBracket.value = !_losersBracket.value
        generateRounds(_currentMatches.value)
    }

    fun getPrevMatches(match: Match): List<Match?> {
        return listOf(match.previousLeftMatch, match.previousRightMatch).filterNotNull()
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
        var currentRound = finalRound
        while (currentRound.isNotEmpty()) {
            val nextRound = mutableListOf<Match?>()

            for (match in currentRound) {
                if (match != null && match.losersBracket == losersBracket.value) {
                    // Add left match or null
                    if (match.previousLeftMatch != null && !visited.contains(match.previousLeftMatch!!.id)) {
                        nextRound.add(match.previousLeftMatch)
                        visited.add(match.previousLeftMatch!!.id)
                    } else {
                        nextRound.add(null)
                    }

                    // Add right match or null
                    if (match.previousRightMatch != null && !visited.contains(match.previousRightMatch!!.id)) {
                        nextRound.add(match.previousRightMatch)
                        visited.add(match.previousRightMatch!!.id)
                    } else {
                        nextRound.add(null)
                    }
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
}