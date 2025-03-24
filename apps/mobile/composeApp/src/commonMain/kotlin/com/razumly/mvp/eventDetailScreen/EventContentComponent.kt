package com.razumly.mvp.eventDetailScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithPlayers
import com.razumly.mvp.core.data.dataTypes.EventWithPlayers
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.eventDetailScreen.data.IMatchRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

interface EventContentComponent : ComponentContext {
    val selectedEvent: StateFlow<EventAbsWithPlayers>
    val divisionMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<Map<String, TeamWithRelations>>
    val selectedDivision: StateFlow<Division?>
    val isBracketView: StateFlow<Boolean>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val errorState: StateFlow<String?>
    val eventWithRelations: StateFlow<EventWithRelations>

    fun matchSelected(selectedMatch: MatchWithRelations)
    fun selectDivision(division: Division)
    fun toggleBracketView()
    fun toggleLosersBracket()
    fun toggleDetails()
}

@Serializable
data class EventWithRelations(
    val event: EventAbs,
    val players: List<UserData>,
    val matches: List<MatchWithRelations>,
    val teams: List<TeamWithRelations>
)

fun EventAbsWithPlayers.toEventWithRelations(
    matches: List<MatchWithRelations>, teams: List<TeamWithRelations>
): EventWithRelations = EventWithRelations(
    event = this.event, players = this.players, matches = matches, teams = teams
)


@OptIn(ExperimentalCoroutinesApi::class)
class DefaultEventContentComponent(
    componentContext: ComponentContext,
    eventAbsRepository: IEventAbsRepository,
    userRepository: IUserRepository,
    event: EventAbs,
    private val matchRepository: IMatchRepository,
    private val teamRepository: ITeamRepository,
    private val onMatchSelected: (MatchWithRelations, Tournament) -> Unit,
) : EventContentComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    override val selectedEvent: StateFlow<EventAbsWithPlayers> =
        eventAbsRepository.getEventWithRelationsFlow(event).map { result ->
                result.getOrElse {
                    _errorState.value = it.message
                    EventAbsWithPlayers.getEmptyEvent(event)
                }
            }.stateIn(scope, SharingStarted.Eagerly, EventAbsWithPlayers.getEmptyEvent(event))

    override val eventWithRelations = selectedEvent.flatMapLatest { eventWithPlayers ->
            combine(matchRepository.getMatchesOfTournamentFlow(eventWithPlayers.event.id)
                .map { result ->
                    result.getOrElse {
                        _errorState.value = "Failed to load matches: ${it.message}"; emptyList()
                    }
                }, when (eventWithPlayers) {
                is EventWithPlayers -> teamRepository.getTeamsOfEventFlow(eventWithPlayers.event.id)
                is TournamentWithPlayers -> teamRepository.getTeamsOfTournamentFlow(
                    eventWithPlayers.event.id
                )
            }.map { result ->
                result.getOrElse {
                    _errorState.value = "Failed to load teams: ${it.message}"; emptyList()
                }
            }) { matches, teams ->
                eventWithPlayers.toEventWithRelations(matches, teams)
            }
        }.stateIn(
            scope, SharingStarted.Eagerly, EventWithRelations(
                Tournament(), emptyList(), emptyList(), emptyList()
            )
        )

    private val _currentUser = userRepository.getCurrentUserFlow().stateIn(
        scope, SharingStarted.Eagerly, Result.success(null)
    )

    private val _divisionMatches = MutableStateFlow<Map<String, MatchWithRelations>>(emptyMap())
    override val divisionMatches = _divisionMatches.asStateFlow()

    private val _divisionTeams = MutableStateFlow<Map<String, TeamWithRelations>>(emptyMap())
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
                        event.players.contains(_currentUser.value.getOrElse { _errorState.value = it.message }) == true
                    if (_userInTournament.value) {
                        _showDetails.value = true
                    }
                    if (selectedDivision.value == null) {
                        event.event.divisions.firstOrNull()
                            ?.let { selectDivision(it) }
                    }
                }
        }
        scope.launch {
            selectedDivision
                .collect { _ ->
                    _selectedDivision.value?.let { selectDivision(it) }
                }
        }
        scope.launch {
            _divisionMatches.collect { generateRounds() }
        }
    }

    override fun matchSelected(selectedMatch: MatchWithRelations) {
        when (selectedEvent.value.event) {
            is Tournament -> onMatchSelected(selectedMatch, selectedEvent.value.event as Tournament)
            else -> Unit
        }
    }

    override fun selectDivision(division: Division) {
        _selectedDivision.value = division
        _divisionTeams.value =
            eventWithRelations.value.teams.filter { it.team.division == division }
                .associateBy { it.team.id }
        _divisionMatches.value =
            eventWithRelations.value.matches.filter { it.match.division == division }
                .associateBy { it.match.id }
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
        val finalRound = _divisionMatches.value.values.filter {
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
                    nextRound.add(_divisionMatches.value[match.previousLeftMatch.id])
                    visited.add(match.previousLeftMatch.id)
                }

                // Add right match
                if (match.previousRightMatch == null) {
                    nextRound.add(null)
                } else if (!visited.contains(match.previousRightMatch.id)) {
                    nextRound.add(_divisionMatches.value[match.previousRightMatch.id])
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