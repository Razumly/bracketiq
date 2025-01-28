package com.razumly.mvp.tournamentDetailScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.stateIn
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
    val showHeader: StateFlow<Boolean>

    fun matchSelected (selectedMatch: MatchWithRelations)
    fun selectDivision(division: String)
    fun toggleBracketView()
    fun toggleLosersBracket()
    fun setHeaderState(state: Boolean)
}

class DefaultTournamentContentComponent(
    componentContext: ComponentContext,
    private val mvpRepository: IMVPRepository,
    tournamentId: String,
    private val onMatchSelected: (MatchWithRelations) -> Unit
) : TournamentContentComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val selectedTournament = mvpRepository
        .getTournamentFlow(tournamentId)
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _divisionMatches = MutableStateFlow<List<MatchWithRelations>>(emptyList())
    override val divisionMatches = _divisionMatches.asStateFlow()

    override val currentMatches = mvpRepository
        .getMatchesFlow(tournamentId)
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = emptyMap()
        )

    override val currentTeams = mvpRepository
        .getTeamsWithPlayersFlow(tournamentId)
        .stateIn(scope, SharingStarted.Eagerly, mapOf())

    private val _selectedDivision = MutableStateFlow<String?>(null)
    override val selectedDivision = _selectedDivision.asStateFlow()

    private val _isBracketView = MutableStateFlow(false)
    override val isBracketView = _isBracketView.asStateFlow()

    private val _rounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    override val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(false)
    override val losersBracket = _losersBracket.asStateFlow()

    private val _showHeader = MutableStateFlow(false)
    override val showHeader = _showHeader.asStateFlow()

    init {
        scope.launch {
            mvpRepository.setIgnoreMatch(null)
            selectedTournament
                .distinctUntilChanged { old, new -> old == new }
                .filterNotNull()
                .collect { tournament ->
                    mvpRepository.subscribeToMatches()
                    if (selectedDivision.value == null) {
                        tournament.divisions.firstOrNull()?.let { selectDivision(it) }
                    }
                }

        }
        scope.launch {
            mvpRepository.getTournament(tournamentId)
        }
        scope.launch {
            currentMatches
            .collect { _ ->
                _selectedDivision.value?.let { selectDivision(it) }
            }
        }
        scope.launch {
            _divisionMatches.collect { generateRounds() }
        }
    }

    override fun setHeaderState(state: Boolean) {
        _showHeader.value = state
    }

    override fun matchSelected(selectedMatch: MatchWithRelations) {
        onMatchSelected(selectedMatch)
    }

    override fun selectDivision(division: String) {
        _selectedDivision.value = division
        _divisionMatches.value = currentMatches.value.values
            .filter { it.match.division == division }
    }

    override fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    override fun toggleLosersBracket() {
        _losersBracket.value = !_losersBracket.value
        generateRounds()
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