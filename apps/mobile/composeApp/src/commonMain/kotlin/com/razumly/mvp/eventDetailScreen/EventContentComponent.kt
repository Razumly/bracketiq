package com.razumly.mvp.eventDetailScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.repositories.EventAbsRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.eventDetailScreen.data.MatchRepository
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
    val selectedEvent: StateFlow<Result<EventAbsWithRelations>>
    val divisionMatches: StateFlow<List<MatchWithRelations>>
    val currentMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<List<TeamWithRelations>>
    val selectedDivision: StateFlow<Division?>
    val isBracketView: StateFlow<Boolean>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val currentTeams: StateFlow<Map<String, TeamWithRelations>>

    fun matchSelected(selectedMatch: MatchWithRelations)
    fun selectDivision(division: Division)
    fun toggleBracketView()
    fun toggleLosersBracket()
    fun toggleDetails()
}

class DefaultEventContentComponent(
    componentContext: ComponentContext,
    eventAbsRepository: EventAbsRepository,
    userRepository: UserRepository,
    event: EventAbs,
    private val matchRepository: MatchRepository,
    private val onMatchSelected: (MatchWithRelations) -> Unit,
) : EventContentComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val selectedEvent = eventAbsRepository.getEventWithRelationsFlow(event).stateIn(
            scope, SharingStarted.Eagerly, Result.success(
                when (event) {
                    is EventImp -> EventWithRelations(EventImp())
                    is Tournament -> TournamentWithRelations(Tournament())
                }
            )
        )

    private val _currentMatches = MutableStateFlow<Map<String, MatchWithRelations>>(emptyMap())
    override val currentMatches = _currentMatches.asStateFlow()

    override val currentTeams = MutableStateFlow(null)

    private val _currentUser = userRepository.getCurrentUserFlow().stateIn(
        scope, SharingStarted.Eagerly, Result.success(null)
    )

    private val _divisionMatches = MutableStateFlow<List<MatchWithRelations>>(emptyList())
    override val divisionMatches = _divisionMatches.asStateFlow()

    private val _divisionTeams = MutableStateFlow<List<TeamWithRelations>>(listOf())
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
            matchRepository.setIgnoreMatch(null)
            selectedEvent.distinctUntilChanged { old, new -> old == new }.filterNotNull()
                .collect { event ->
                    matchRepository.subscribeToMatches()
                    _userInTournament.value =
                        event.getOrNull()?.players?.contains(_currentUser.value.getOrNull()) == true
                    if (_userInTournament.value) {
                        _showDetails.value = true
                    }
                    if (selectedDivision.value == null) {
                        event.getOrNull()?.event?.divisions?.firstOrNull()
                            ?.let { selectDivision(it) }
                    }
                }
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