package com.razumly.mvp.eventDetailScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithPlayers
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.Division
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

interface EventContentComponent : ComponentContext {
    val selectedEvent: StateFlow<EventAbsWithPlayers?>
    val divisionMatches: StateFlow<List<MatchWithRelations>>
    val currentMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<List<TeamWithPlayers>>
    val selectedDivision: StateFlow<Division?>
    val isBracketView: StateFlow<Boolean>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val currentTeams: StateFlow<Map<String, TeamWithPlayers>>

    fun matchSelected(selectedMatch: MatchWithRelations)
    fun selectDivision(division: Division)
    fun toggleBracketView()
    fun toggleLosersBracket()
    fun toggleDetails()
}

class DefaultEventContentComponent(
    componentContext: ComponentContext,
    private val mvpRepository: IMVPRepository,
    event: EventAbs,
    private val onMatchSelected: (MatchWithRelations) -> Unit
) : EventContentComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val selectedEvent = mvpRepository
        .getPlayersOfEventFlow(event)
        .stateIn(scope, SharingStarted.Eagerly, null)

    private val _divisionMatches = MutableStateFlow<List<MatchWithRelations>>(emptyList())
    override val divisionMatches = _divisionMatches.asStateFlow()

    override val currentMatches = mvpRepository
        .getMatchesFlow(event.id)
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = emptyMap()
        )

    override val currentTeams = mvpRepository
        .getTeamsInTournamentFlow(event.id)
        .stateIn(scope, SharingStarted.Eagerly, mapOf())

    private val _divisionTeams = MutableStateFlow<List<TeamWithPlayers>>(listOf())
    override val divisionTeams = _divisionTeams.asStateFlow()

    private val _selectedDivision = MutableStateFlow<Division?>(null)
    override val selectedDivision = _selectedDivision.asStateFlow()

    private val _isBracketView = MutableStateFlow(false)
    override val isBracketView = _isBracketView.asStateFlow()

    private val _rounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    override val rounds = _rounds.asStateFlow()

    private val _losersBracket = MutableStateFlow(false)
    override val losersBracket = _losersBracket.asStateFlow()

    private val _showDetails = MutableStateFlow(false)
    override val showDetails = _showDetails.asStateFlow()

    private val _userInTournament = MutableStateFlow(false)

    init {
        scope.launch {
            mvpRepository.setIgnoreMatch(null)
            selectedEvent
                .distinctUntilChanged { old, new -> old == new }
                .filterNotNull()
                .collect { event ->
                    mvpRepository.subscribeToMatches()
                    _userInTournament.value =
                        event.players.contains(mvpRepository.getCurrentUser()?.user)
                    if (_userInTournament.value) {
                        _showDetails.value = true
                    }
                    if (selectedDivision.value == null) {
                        event.event.divisions.firstOrNull()?.let { selectDivision(it) }
                    }
                }

        }
        scope.launch {
            mvpRepository.getEvent(event)
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

    override fun matchSelected(selectedMatch: MatchWithRelations) {
        onMatchSelected(selectedMatch)
    }

    override fun selectDivision(division: Division) {
        _selectedDivision.value = division
        _divisionTeams.value =
            currentTeams.value.values.filter { it.team.division == division }
        _divisionMatches.value =
            currentMatches.value.values.filter { it.match.division == division }
    }

    override fun toggleBracketView() {
        _isBracketView.value = !_isBracketView.value
    }

    override fun toggleLosersBracket() {
        _losersBracket.value = !_losersBracket.value
        generateRounds()
    }

    override fun toggleDetails() {
        _showDetails.value = !_showDetails.value
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