package com.razumly.mvp.eventDetail

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithRelations
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventDetail.data.IMatchRepository
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

interface EventDetailComponent : ComponentContext, IPaymentProcessor {
    val selectedEvent: StateFlow<EventAbsWithRelations?>
    val divisionMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<Map<String, TeamWithPlayers>>
    val selectedDivision: StateFlow<Division?>
    val divisionFields: StateFlow<List<FieldWithMatches>>
    val isBracketView: StateFlow<Boolean>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val errorState: StateFlow<ErrorMessage?>
    val eventWithRelations: StateFlow<EventWithFullRelations>
    val currentUser: StateFlow<UserData>
    val validTeams: StateFlow<List<TeamWithPlayers>>
    val isHost: StateFlow<Boolean>
    val editedEvent: StateFlow<EventAbs>
    val isEditing: StateFlow<Boolean>
    val backCallback: BackCallback
    val isUserInEvent: StateFlow<Boolean>

    fun matchSelected(selectedMatch: MatchWithRelations)
    fun onHostCreateAccount()
    fun selectDivision(division: Division)
    fun setLoadingHandler(loadingHandler: LoadingHandler)
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
    fun selectPlace(place: MVPPlace?)
    fun onTypeSelected(type: EventType)
    fun selectFieldCount(count: Int)
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
    fieldRepository: IFieldRepository,
    private val billingRepository: IBillingRepository,
    event: EventAbs,
    onBack: () -> Unit,
    private val eventAbsRepository: IEventAbsRepository,
    private val matchRepository: IMatchRepository,
    private val teamRepository: ITeamRepository,
    private val onMatchSelected: (MatchWithRelations, Tournament) -> Unit,
    private val onNavigateToTeamSettings: (freeAgents: List<String>, event: EventAbs?) -> Unit
) : EventDetailComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    override val currentUser = userRepository.currentUser.map { it.getOrThrow() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    private val _editedEvent = MutableStateFlow(event)
    override var editedEvent = _editedEvent.asStateFlow()

    private val _isEditing = MutableStateFlow(false)
    override var isEditing = _isEditing.asStateFlow()

    private val _fieldCount = MutableStateFlow(0)

    override val backCallback = BackCallback {
        if (isEditing.value) {
            _isEditing.value = false
        } else if (showDetails.value) {
            _showDetails.value = false
        } else {
            onBack()
        }
    }

    private val _isUserInEvent: MutableStateFlow<Boolean> = MutableStateFlow(false)
    override val isUserInEvent = _isUserInEvent.asStateFlow()

    override val selectedEvent: StateFlow<EventAbsWithRelations?> =
        eventAbsRepository.getEventWithRelationsFlow(event).map { result ->
            result.getOrElse {
                _errorState.value = ErrorMessage(it.message ?: "")
                EventAbsWithRelations.getEmptyEvent(event)
            }
        }.stateIn(scope, SharingStarted.Eagerly, null)

    override val isHost = selectedEvent.map { it?.event?.hostId == currentUser.value.id }
        .stateIn(scope, SharingStarted.Eagerly, false)

    override val eventWithRelations = selectedEvent.flatMapLatest { eventWithPlayers ->
        if (eventWithPlayers == null) {
            flowOf(EventWithFullRelations(Tournament(), emptyList(), emptyList(), emptyList()))
        } else {
            combine(matchRepository.getMatchesOfTournamentFlow(eventWithPlayers.event.id)
                .map { result ->
                    result.getOrElse {
                        _errorState.value =
                            ErrorMessage("Error loading matches: ${it.message}"); emptyList()
                    }
                }, teamRepository.getTeamsFlow(
                eventWithPlayers.event.teamIds
            ).map { result ->
                result.getOrElse {
                    _errorState.value =
                        ErrorMessage("Failed to load teams: ${it.message}"); emptyList()
                }
            }) { matches, teams ->
                eventWithPlayers.toEventWithFullRelations(matches, teams)
            }
        }
    }.stateIn(
        scope, SharingStarted.Eagerly, EventWithFullRelations(
            Tournament(), emptyList(), emptyList(), emptyList()
        )
    )

    override val divisionFields = fieldRepository.getFieldsInTournamentWithMatchesFlow(event.id)
        .map { fields -> fields.filter { it.field.divisions.contains(selectedDivision.value?.name) } }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

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

    private val _userTeams = currentUser.flatMapLatest {
        teamRepository.getTeamsWithPlayersFlow(it.id).map { result ->
            result.getOrElse {
                emptyList()
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _usersTeam = MutableStateFlow<TeamWithPlayers?>(null)

    override val validTeams = _userTeams.flatMapLatest { teams ->
        flowOf(teams.filter { it.team.teamSize == event.teamSizeLimit })
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    init {
        backHandler.register(backCallback)
        scope.launch {
            _isEditing.collect { isEditing ->
                backCallback.isEnabled = isEditing
            }
        }
        scope.launch {
            _showDetails.collect { showDetails ->
                backCallback.isEnabled = showDetails
            }
        }
        scope.launch {
            paymentResult.collect {
                if (it != null) {
                    when (it) {
                        PaymentResult.Canceled -> {
                            _errorState.value = ErrorMessage("Payment Canceled")
                        }

                        is PaymentResult.Failed -> {
                            _errorState.value = ErrorMessage(it.error)
                        }

                        PaymentResult.Completed -> {
                            val teams =
                                if (event.teamSignup) event.teamIds + _usersTeam.value?.team?.id else emptyList()
                            val players =
                                event.playerIds + if (event.teamSignup) _usersTeam.value?.team?.playerIds.orEmpty() else listOf(
                                    currentUser.value.id
                                )
                            val update = when (selectedEvent.value?.event!!) {
                                is Tournament -> (selectedEvent.value?.event as Tournament).copy(
                                    teamIds = teams.filterNotNull(), playerIds = players
                                )

                                is EventImp -> (selectedEvent.value?.event as EventImp).copy(
                                    teamIds = teams.filterNotNull(), playerIds = players
                                )
                            }
                            eventAbsRepository.updateEvent(update)
                        }
                    }
                }
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(null)
            eventWithRelations.distinctUntilChanged { old, new -> old == new }.filterNotNull()
                .collect { event ->
                    matchRepository.subscribeToMatches()
                    _isUserInEvent.value = checkIsUserInEvent()
                    if (_isUserInEvent.value) {
                        _usersTeam.value =
                            event.teams.find { it.team.playerIds.contains(currentUser.value.id) }
                                ?.let {
                                    teamRepository.getTeamWithPlayers(it.team.id).getOrNull()
                                } ?: event.event.waitList.find { waitlisted ->
                                currentUser.value.teamIds.contains(
                                    waitlisted
                                )
                            }?.let {
                                teamRepository.getTeamWithPlayers(it).getOrNull()
                            }
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
        if (selectedEvent.value == null) return
        when (selectedEvent.value!!.event) {
            is Tournament -> onMatchSelected(
                selectedMatch, selectedEvent.value!!.event as Tournament
            )

            else -> Unit
        }
    }

    override fun selectDivision(division: Division) {
        if (selectedEvent.value == null) return
        _selectedDivision.value = division
        _divisionTeams.value = if (!selectedEvent.value!!.event.singleDivision) {
            eventWithRelations.value.teams.filter { it.team.division == division }
        } else {
            eventWithRelations.value.teams
        }.associateBy { it.team.id }
        _divisionMatches.value =
            eventWithRelations.value.matches.filter { it.match.division == division }
                .associateBy { it.match.id }
    }

    override fun onHostCreateAccount() {
        scope.launch {
            loadingHandler.showLoading("Redirecting to Stripe On Boarding ...")
            billingRepository.createAccount().onSuccess { onBoardingUrl ->
                urlHandler?.openUrlInWebView(
                    url = onBoardingUrl,
                )
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            loadingHandler.hideLoading()
        }
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
            if (selectedEvent.value == null) return@launch
            if (selectedEvent.value!!.event.price == 0.0 || selectedEvent.value!!.event.teamSignup) {
                loadingHandler.showLoading("Joining Event ...")
                eventAbsRepository.addCurrentUserToEvent(selectedEvent.value!!.event).onSuccess {
                    _isUserInEvent.value = true
                }
            } else {
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(selectedEvent.value!!.event).onSuccess {
                    it?.let { setPaymentIntent(it) }
                    loadingHandler.showLoading("Waiting for Payment Completion ..")
                    presentPaymentSheet()
                }.onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            }
            loadingHandler.hideLoading()
        }
    }

    override fun joinEventAsTeam(team: TeamWithPlayers) {
        scope.launch {
            _usersTeam.value = team
            if (selectedEvent.value == null) return@launch
            if (selectedEvent.value!!.event.price == 0.0) {
                loadingHandler.showLoading("Joining Event ...")
                eventAbsRepository.addTeamToEvent(selectedEvent.value!!.event, team.team)
                    .onSuccess {
                        _isUserInEvent.value = true
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.message ?: "")
                    }
            } else {
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(selectedEvent.value!!.event, team.team.id).onSuccess {
                    it?.let { setPaymentIntent(it) }
                    loadingHandler.showLoading("Waiting for Payment Completion ..")
                    presentPaymentSheet()
                }.onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            }
            loadingHandler.hideLoading()
        }
    }

    override fun leaveEvent() {
        scope.launch {
            if (!_isUserInEvent.value || selectedEvent.value == null) {
                return@launch
            }
            if (selectedEvent.value!!.event.price > 0) {
                loadingHandler.showLoading("Requesting Refund ...")
                billingRepository.leaveAndRefundEvent(selectedEvent.value!!.event).onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            } else if (!selectedEvent.value!!.event.teamSignup || checkIsUserFreeAgent()) {
                loadingHandler.showLoading("Leaving Event ...")
                eventAbsRepository.removeCurrentUserFromEvent(selectedEvent.value!!.event)
                    .onFailure { _errorState.value = ErrorMessage(it.message ?: "") }
            } else {
                loadingHandler.showLoading("Team Leaving Event ...")
                eventAbsRepository.removeTeamFromEvent(
                    selectedEvent.value!!.event, _usersTeam.value!!
                ).onFailure { _errorState.value = ErrorMessage(it.message ?: "") }
            }
            loadingHandler.hideLoading()
        }
    }

    override fun viewEvent() {
        _showDetails.value = true
    }

    override fun toggleDetails() {
        _showDetails.value = !_showDetails.value
    }

    override fun toggleEdit() {
        if (selectedEvent.value == null) return
        _editedEvent.value = selectedEvent.value!!.event
        _isEditing.value = !_isEditing.value
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
                _errorState.value = ErrorMessage(it.message ?: "")
            }
        }
    }

    override fun createNewTeam() {
        if (selectedEvent.value == null) return
        onNavigateToTeamSettings(
            selectedEvent.value!!.event.freeAgents, selectedEvent.value!!.event
        )
    }

    override fun selectPlace(place: MVPPlace?) {
        editEventField {
            copy(
                lat = place?.lat ?: 0.0, long = place?.long ?: 0.0, location = place?.name ?: ""
            )
        }
    }

    override fun onTypeSelected(type: EventType) {
        _editedEvent.value = when (type) {
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

    override fun selectFieldCount(count: Int) {
        _fieldCount.value = count
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

    private fun checkIsUserWaitListed(): Boolean {
        return selectedEvent.value?.event?.waitList?.any { participant ->
            (currentUser.value.id + currentUser.value.teamIds).contains(
                participant
            )
        } == true
    }

    private fun checkIsUserFreeAgent(): Boolean {
        return selectedEvent.value?.event?.freeAgents?.any { participant ->
            (currentUser.value.id + currentUser.value.teamIds).contains(
                participant
            )
        } == true
    }

    private fun checkIsUserParticipant(): Boolean {
        return selectedEvent.value?.event?.playerIds?.contains(currentUser.value.id) == true
    }

    private fun checkIsUserInEvent(): Boolean {
        return checkIsUserParticipant() || checkIsUserFreeAgent() || checkIsUserWaitListed()
    }
}