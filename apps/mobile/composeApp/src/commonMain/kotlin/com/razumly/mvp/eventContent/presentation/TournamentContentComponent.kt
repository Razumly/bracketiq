package com.razumly.mvp.eventContent.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.launch

interface TournamentContentComponent : ComponentContext {
    val selectedTournament: StateFlow<Tournament?>
    val divisionMatches: StateFlow<List<MatchWithRelations>>
    val currentMatches: StateFlow<Map<String, MatchWithRelations>>
    val currentTeams: StateFlow<Map<String, TeamWithPlayers>>
    val selectedDivision: StateFlow<String?>
    val isBracketView: StateFlow<Boolean>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>

    fun matchSelected (selectedMatch: MatchMVP)
    fun selectDivision(division: String)
    fun toggleBracketView()
    fun toggleLosersBracket()
}

class DefaultTournamentContentComponent(
    componentContext: ComponentContext,
    private val appwriteRepository: IMVPRepository,
    private val tournamentId: String,
    private val onMatchSelected: (MatchMVP) -> Unit,
) : TournamentContentComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _selectedTournament = MutableStateFlow<Tournament?>(null)
    override val selectedTournament = _selectedTournament.asStateFlow()

    private val _divisionMatches = MutableStateFlow<List<MatchWithRelations>>(emptyList())
    override val divisionMatches = _divisionMatches.asStateFlow()

    private val _currentMatches = MutableStateFlow<Map<String, MatchWithRelations>>(emptyMap())
    override val currentMatches = _currentMatches.asStateFlow()

    private val _currentTeams = MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
    override val currentTeams = _currentTeams.asStateFlow()

    private val _selectedDivision = MutableStateFlow<String?>(null)
    override val selectedDivision = _selectedDivision.asStateFlow()

    private val _isBracketView = MutableStateFlow(false)
    override val isBracketView = _isBracketView.asStateFlow()

    private val _rounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    override val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(false)
    override val losersBracket = _losersBracket.asStateFlow()

    init {
        scope.launch {
            loadTournament(tournamentId)
        }
        scope.launch {
            appwriteRepository.matchUpdates
                .buffer()
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
        scope.launch {
            _divisionMatches.collect { generateRounds() }
        }
    }


    override fun matchSelected(selectedMatch: MatchMVP) {
        onMatchSelected(selectedMatch)
    }

    override fun selectDivision(division: String) {
        _selectedDivision.value = division
        _divisionMatches.value = _currentMatches.value.values
            .filter { it.match.division == division }
    }

    override fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    override fun toggleLosersBracket() {
        _losersBracket.value = !_losersBracket.value
        generateRounds()
    }

    private suspend fun loadTournament(id: String) {
        _selectedTournament.value = appwriteRepository.getTournament(id)
        _currentMatches.value = appwriteRepository.getMatches(id)
        _currentTeams.value = appwriteRepository.getTeams(id)
        _selectedTournament.value?.let { tournament ->
            appwriteRepository.subscribeToMatches()
        }
        selectedTournament.value?.divisions?.firstOrNull()?.let { selectDivision(it) }
    }

    private fun generateRounds() {
        if (_divisionMatches.value.isEmpty()) {
            _rounds.value = emptyList()
            return
        }

        val rounds = mutableListOf<List<MatchWithRelations?>>()
        val visited = mutableSetOf<String>()

        // Find matches with no previous matches (first round)
        val finalRound = _divisionMatches.value.filter {
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