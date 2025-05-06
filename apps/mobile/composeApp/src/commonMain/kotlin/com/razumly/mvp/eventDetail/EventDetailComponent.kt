package com.razumly.mvp.eventDetail

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.eventDetail.data.IMatchRepository
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
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

interface EventDetailComponent : ComponentContext {
    val selectedEvent: StateFlow<EventAbsWithRelations>
    val divisionMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<Map<String, TeamWithPlayers>>
    val selectedDivision: StateFlow<Division?>
    val isBracketView: StateFlow<Boolean>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val errorState: StateFlow<String?>
    val eventWithRelations: StateFlow<EventWithFullRelations>
    val currentUser: UserData
    val validTeams: StateFlow<List<TeamWithPlayers>>
    val isHost: StateFlow<Boolean>
    val editedEvent: StateFlow<EventAbs>

    fun matchSelected(selectedMatch: MatchWithRelations)
    fun selectDivision(division: Division)
    fun toggleBracketView()
    fun toggleLosersBracket()
    fun toggleDetails()
    fun toggleEdit()
    fun joinEvent()
    fun joinEventAsTeam(team: TeamWithPlayers)
    fun viewEvent()
    fun leaveEvent()
    fun editEventField(update: EventImp.() -> EventImp)
    fun editTournamentField(update: Tournament.() -> Tournament)
    fun updateEvent()
    fun createNewTeam()
    fun selectPlace(place: MVPPlace)
    fun onTypeSelected(type: EventType)
}

@Serializable
data class EventWithFullRelations(
    val event: EventAbs,
    val players: List<UserData>,
    val matches: List<MatchWithRelations>,
    val teams: List<TeamWithPlayers>
)

fun EventAbsWithRelations.toEventWithFullRelations(
    matches: List<MatchWithRelations>, teams: List<TeamWithPlayers>
): EventWithFullRelations = EventWithFullRelations(
    event = this.event, players = this.players, matches = matches, teams = teams
)


@OptIn(ExperimentalCoroutinesApi::class)
class DefaultEventDetailComponent(
    componentContext: ComponentContext,
    userRepository: IUserRepository,
    event: EventAbs,
    private val eventAbsRepository: IEventAbsRepository,
    private val matchRepository: IMatchRepository,
    private val teamRepository: ITeamRepository,
    private val onMatchSelected: (MatchWithRelations, Tournament) -> Unit,
    private val onNavigateToTeamSettings: (freeAgents: List<String>, event: EventAbs?) -> Unit
) : EventDetailComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    override val currentUser = userRepository.currentUser.value.getOrThrow()

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _editedEvent = MutableStateFlow(event)
    override var editedEvent = _editedEvent.asStateFlow()

    override val selectedEvent: StateFlow<EventAbsWithRelations> =
        eventAbsRepository.getEventWithRelationsFlow(event).map { result ->
            result.getOrElse {
                _errorState.value = it.message
                EventAbsWithRelations.getEmptyEvent(event)
            }
        }.stateIn(scope, SharingStarted.Eagerly, EventAbsWithRelations.getEmptyEvent(event))

    override val isHost = selectedEvent.map { it.event.hostId == currentUser.id }
        .stateIn(scope, SharingStarted.Eagerly, false)

    override val eventWithRelations = selectedEvent.flatMapLatest { eventWithPlayers ->
        combine(matchRepository.getMatchesOfTournamentFlow(eventWithPlayers.event.id)
            .map { result ->
                result.getOrElse {
                    _errorState.value = "Failed to load matches: ${it.message}"; emptyList()
                }
            }, when (eventWithPlayers) {
            is TournamentWithRelations -> teamRepository.getTeamsOfTournamentFlow(
                eventWithPlayers.event.id
            )

            is EventWithRelations -> teamRepository.getTeamsOfEventFlow(eventWithPlayers.event.id)
        }.map { result ->
            result.getOrElse {
                _errorState.value = "Failed to load teams: ${it.message}"; emptyList()
            }
        }) { matches, teams ->
            eventWithPlayers.toEventWithFullRelations(matches, teams)
        }
    }.stateIn(
        scope, SharingStarted.Eagerly, EventWithFullRelations(
            Tournament(), emptyList(), emptyList(), emptyList()
        )
    )

    private val _divisionMatches = MutableStateFlow<Map<String, MatchWithRelations>>(emptyMap())
    override val divisionMatches = _divisionMatches.asStateFlow()

    private val _divisionTeams = MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
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

    private val _userTeams =
        teamRepository.getTeamsWithPlayersFlow(currentUser.teamIds).map { result ->
            result.getOrElse {
                emptyList()
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _usersTeam = MutableStateFlow<TeamWithPlayers?>(null)

    override val validTeams = _userTeams.flatMapLatest { teams ->
        flowOf(teams.filter { it.players.size == event.teamSizeLimit })
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _userInTournament = MutableStateFlow(false)

    init {
        scope.launch {
            matchRepository.setIgnoreMatch(null)
            eventWithRelations.distinctUntilChanged { old, new -> old == new }.filterNotNull()
                .collect { event ->
                    matchRepository.subscribeToMatches()
                    _userInTournament.value =
                        event.players.contains(currentUser) == true
                    if (_userInTournament.value) {
                        _usersTeam.value =
                            event.teams.find { it.team.players.contains(currentUser.id) }
                    }
                    event.event.divisions.firstOrNull()?.let { selectDivision(it) }
                }
        }
        scope.launch {
            selectedDivision.collect { _ ->
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
        _divisionTeams.value = if (!selectedEvent.value.event.singleDivision) {
            eventWithRelations.value.teams.filter { it.team.division == division }
        } else {
            eventWithRelations.value.teams
        }.associateBy { it.team.id }
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

    override fun joinEvent() {
        scope.launch {
            eventAbsRepository.addCurrentUserToEvent(selectedEvent.value.event)
        }
    }

    override fun joinEventAsTeam(team: TeamWithPlayers) {
        scope.launch {
            eventAbsRepository.addTeamToEvent(selectedEvent.value.event, team)
        }
    }

    override fun leaveEvent() {
        scope.launch {
            val userInFreeAgents =
                selectedEvent.value.event.freeAgents.contains(currentUser.id)
            val userInEvent =
                (currentUser.eventIds + currentUser.tournamentIds).contains(
                    selectedEvent.value.event.id
                )
            if (!selectedEvent.value.event.teamSignup || userInFreeAgents || (userInEvent && _usersTeam.value == null)) {
                eventAbsRepository.removeCurrentUserFromEvent(selectedEvent.value.event)
            } else if (_usersTeam.value != null) {
                eventAbsRepository.removeTeamFromEvent(
                    selectedEvent.value.event, _usersTeam.value!!
                )
            }
        }
    }

    override fun viewEvent() {
        _showDetails.value = true
    }

    override fun toggleDetails() {
        _showDetails.value = !_showDetails.value
    }
    override fun toggleEdit() {
        _editedEvent.value = selectedEvent.value.event
    }

    override fun editEventField(update: EventImp.() -> EventImp) {
        if (_editedEvent.value is EventImp) {
            _editedEvent.value = (_editedEvent.value as EventImp).update()
        }
    }

    override fun editTournamentField(update: Tournament.() -> Tournament) {
        if (_editedEvent.value is Tournament) {
            _editedEvent.value = (_editedEvent.value as Tournament).update()
        }
    }

    override fun updateEvent() {
        scope.launch {
            eventAbsRepository.updateEvent(_editedEvent.value).onFailure {
                _errorState.value = it.message
            }
        }
    }

    override fun createNewTeam() {
        onNavigateToTeamSettings(selectedEvent.value.event.freeAgents, selectedEvent.value.event)
    }

    override fun selectPlace(place: MVPPlace) {
        editEventField { copy(lat = place.lat, long = place.long, location = place.name) }
    }

    override fun onTypeSelected(type: EventType) {
        _editedEvent.value = when(type) {
            EventType.TOURNAMENT -> Tournament().updateTournamentFromEvent(_editedEvent.value as EventImp)
            EventType.EVENT -> (_editedEvent.value as Tournament).toEvent()
        }
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
            val firstRound = match.previousLeftMatch == null && match.previousRightMatch == null

            finalsMatch || mergeMatch || !opposite || firstRound
        } else {
            match.match.losersBracket == losersBracket.value
        }
    }
}