@file:OptIn(ExperimentalTime::class)

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
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventAbsRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.util.ShareServiceProvider
import com.razumly.mvp.core.presentation.util.createEventUrl
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
import kotlin.time.ExperimentalTime

interface EventDetailComponent : ComponentContext, IPaymentProcessor {
    val selectedEvent: StateFlow<EventAbsWithRelations>
    val divisionMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<Map<String, TeamWithPlayers>>
    val selectedDivision: StateFlow<Division?>
    val divisionFields: StateFlow<List<FieldWithMatches>>
    val rounds: StateFlow<List<List<MatchWithRelations?>>>
    val losersBracket: StateFlow<Boolean>
    val showDetails: StateFlow<Boolean>
    val errorState: StateFlow<ErrorMessage?>
    val eventWithRelations: StateFlow<EventWithFullRelations>
    val currentUser: StateFlow<UserData>
    val validTeams: StateFlow<List<TeamWithPlayers>>
    val isHost: StateFlow<Boolean>
    val isEditing: StateFlow<Boolean>
    val isUserInEvent: StateFlow<Boolean>
    val isBracketView: StateFlow<Boolean>
    val isEventFull: StateFlow<Boolean>
    val editedEvent: StateFlow<EventAbs>
    val backCallback: BackCallback
    val showFeeBreakdown: StateFlow<Boolean>
    val currentFeeBreakdown: StateFlow<FeeBreakdown?>
    val isUserInWaitlist: StateFlow<Boolean>
    val isUserFreeAgent: StateFlow<Boolean>
    val isUserCaptain: StateFlow<Boolean>

    fun matchSelected(selectedMatch: MatchWithRelations)
    fun showFeeBreakdown(feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit)
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
    fun requestRefund(reason: String)
    fun editEventField(update: EventImp.() -> EventImp)
    fun editTournamentField(update: Tournament.() -> Tournament)
    fun updateEvent()
    fun deleteEvent()
    fun shareEvent()
    fun createNewTeam()
    fun selectPlace(place: MVPPlace?)
    fun onTypeSelected(type: EventType)
    fun selectFieldCount(count: Int)
    fun checkIsUserWaitListed(event: EventAbs): Boolean
    fun checkIsUserFreeAgent(event: EventAbs): Boolean
    fun dismissFeeBreakdown()
    fun confirmFeeBreakdown()
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

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
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

    override val selectedEvent: StateFlow<EventAbsWithRelations> =
        eventAbsRepository.getEventWithRelationsFlow(event).map { result ->
            result.getOrElse {
                _errorState.value = ErrorMessage(it.message ?: "")
                EventAbsWithRelations.getEmptyEvent(event)
            }
        }.stateIn(scope, SharingStarted.Eagerly, EventAbsWithRelations.getEmptyEvent(event))

    override val isHost = selectedEvent.map { it.event.hostId == currentUser.value.id }
        .stateIn(scope, SharingStarted.Eagerly, false)

    override val eventWithRelations = selectedEvent.flatMapLatest { eventWithPlayers ->
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
    }.stateIn(
        scope, SharingStarted.Eagerly, EventWithFullRelations(
            event, emptyList(), emptyList(), emptyList()
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

    private val _showFeeBreakdown = MutableStateFlow(false)
    override val showFeeBreakdown = _showFeeBreakdown.asStateFlow()

    private val _currentFeeBreakdown = MutableStateFlow<FeeBreakdown?>(null)
    override val currentFeeBreakdown = _currentFeeBreakdown.asStateFlow()

    private var pendingPaymentAction: (() -> Unit)? = null

    private val _userTeams = currentUser.flatMapLatest {
        teamRepository.getTeamsWithPlayersFlow(it.id).map { result ->
            result.getOrElse {
                emptyList()
            }
        }
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _usersTeam = MutableStateFlow<TeamWithPlayers?>(null)

    override val validTeams = _userTeams.flatMapLatest { teams ->
        flowOf(teams.filter { it.team.teamSize == event.teamSizeLimit && it.team.captainId == currentUser.value.id })
    }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    override val isEventFull = selectedEvent.map { eventWithRelations ->
        checkEventIsFull(eventWithRelations.event)
    }.stateIn(scope, SharingStarted.Eagerly, checkEventIsFull(event))

    private val _isUserInEvent: MutableStateFlow<Boolean> =
        MutableStateFlow(checkIsUserInEvent(event))
    override val isUserInEvent = _isUserInEvent.asStateFlow()

    private val _isUserInWaitlist = MutableStateFlow(checkIsUserWaitListed(event))
    override val isUserInWaitlist = _isUserInWaitlist.asStateFlow()

    private val _isUserFreeAgent = MutableStateFlow(checkIsUserFreeAgent(event))
    override val isUserFreeAgent = _isUserFreeAgent.asStateFlow()

    private val _isUserCaptain = MutableStateFlow(checkIsUserCaptain())
    override val isUserCaptain = _isUserCaptain.asStateFlow()

    private val shareServiceProvider = ShareServiceProvider()

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
                            val update = when (selectedEvent.value.event) {
                                is Tournament -> (selectedEvent.value.event as Tournament).copy(
                                    teamIds = teams.filterNotNull(), playerIds = players
                                )

                                is EventImp -> (selectedEvent.value.event as EventImp).copy(
                                    teamIds = teams.filterNotNull(), playerIds = players
                                )
                            }
                            eventAbsRepository.updateLocalEvent(update)
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
                    _isUserInEvent.value = checkIsUserInEvent(event.event)
                    _isUserInWaitlist.value = checkIsUserWaitListed(event.event)
                    _isUserFreeAgent.value = checkIsUserFreeAgent(event.event)
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

                        _isUserCaptain.value = checkIsUserCaptain()
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
            is Tournament -> onMatchSelected(
                selectedMatch, selectedEvent.value.event as Tournament
            )

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
        _divisionMatches.value = if (!selectedEvent.value.event.singleDivision) {
            eventWithRelations.value.matches.filter { it.match.division == division }
                .associateBy { it.match.id }
        } else {
            eventWithRelations.value.matches.associateBy { it.match.id }
        }
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

            if (selectedEvent.value.event.price == 0.0 || isEventFull.value || selectedEvent.value.event.teamSignup) {
                loadingHandler.showLoading("Joining Event ...")
                eventAbsRepository.addCurrentUserToEvent(selectedEvent.value.event).onSuccess {
                    loadingHandler.showLoading("Reloading Event")
                    eventAbsRepository.getEvent(selectedEvent.value.event)
                }.onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            } else {
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(selectedEvent.value.event)
                    .onSuccess { purchaseIntent ->
                        purchaseIntent?.let { intent ->
                            intent.feeBreakdown?.let { feeBreakdown ->
                                showFeeBreakdown(feeBreakdown, onConfirm = {
                                    scope.launch {
                                        setPaymentIntent(intent)
                                        loadingHandler.showLoading("Waiting for Payment Completion ..")
                                        presentPaymentSheet()
                                    }
                                }, onCancel = {
                                    loadingHandler.hideLoading()
                                })
                            } ?: run {
                                setPaymentIntent(intent)
                                loadingHandler.showLoading("Waiting for Payment Completion ..")
                                presentPaymentSheet()
                            }
                        }
                        loadingHandler.showLoading("Reloading Event")
                        while(!_isUserInEvent.value) {
                            eventAbsRepository.getEvent(selectedEvent.value.event)
                        }
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

            if (selectedEvent.value.event.price == 0.0 || isEventFull.value) {
                loadingHandler.showLoading("Joining Event ...")
                eventAbsRepository.addTeamToEvent(selectedEvent.value.event, team.team)
                    .onSuccess {
                        loadingHandler.showLoading("Reloading Event")
                        eventAbsRepository.getEvent(selectedEvent.value.event)
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.message ?: "")
                    }
            } else {
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(selectedEvent.value.event, team.team.id)
                    .onSuccess { purchaseIntent ->
                        purchaseIntent?.let { intent ->
                            intent.feeBreakdown?.let { feeBreakdown ->
                                showFeeBreakdown(feeBreakdown, onConfirm = {
                                    scope.launch {
                                        setPaymentIntent(intent)
                                        loadingHandler.showLoading("Waiting for Payment Completion ..")
                                        presentPaymentSheet()
                                    }
                                }, onCancel = {
                                    loadingHandler.hideLoading()
                                })
                            } ?: run {
                                setPaymentIntent(intent)
                                loadingHandler.showLoading("Waiting for Payment Completion ..")
                                presentPaymentSheet()
                            }
                        }
                        loadingHandler.showLoading("Reloading Event")
                        while(!_isUserInEvent.value) {
                            eventAbsRepository.getEvent(selectedEvent.value.event)
                        }
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.message ?: "")
                    }
            }
            loadingHandler.hideLoading()
        }
    }

    override fun requestRefund(reason: String) {
        scope.launch {
            if (!_isUserInEvent.value) {
                return@launch
            }
            loadingHandler.showLoading("Requesting Refund ...")
            billingRepository.leaveAndRefundEvent(selectedEvent.value.event, reason).onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }.onSuccess {
                eventAbsRepository.getEvent(selectedEvent.value.event)
            }
            loadingHandler.showLoading("Reloading Event")
            eventAbsRepository.getEvent(selectedEvent.value.event)
            loadingHandler.hideLoading()
        }
    }

    override fun leaveEvent() {
        scope.launch {
            if (!_isUserInEvent.value) {
                return@launch
            }
            val result =
                if (!selectedEvent.value.event.teamSignup || checkIsUserFreeAgent(selectedEvent.value.event)) {
                    loadingHandler.showLoading("Leaving Event ...")
                    eventAbsRepository.removeCurrentUserFromEvent(selectedEvent.value.event)
                        .onFailure { _errorState.value = ErrorMessage(it.message ?: "") }
                } else {
                    loadingHandler.showLoading("Team Leaving Event ...")
                    eventAbsRepository.removeTeamFromEvent(
                        selectedEvent.value.event, _usersTeam.value!!
                    ).onFailure { _errorState.value = ErrorMessage(it.message ?: "") }
                }
            result.onSuccess {
                loadingHandler.showLoading("Reloading Event")
                eventAbsRepository.getEvent(selectedEvent.value.event)
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
        _editedEvent.value = selectedEvent.value.event
        _isEditing.value = !_isEditing.value
    }

    override fun editEventField(update: EventImp.() -> EventImp) {
        when (_editedEvent.value) {
            is EventImp -> _editedEvent.value = (_editedEvent.value as EventImp).update()
            is Tournament -> {
                var event = (_editedEvent.value as Tournament).toEvent()
                event = event.update()
                _editedEvent.value = Tournament().updateTournamentFromEvent(event)
            }
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
        onNavigateToTeamSettings(
            selectedEvent.value.event.freeAgents, selectedEvent.value.event
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

    override fun checkIsUserWaitListed(event: EventAbs): Boolean {
        return event.waitList.any { participant ->
            (currentUser.value.id + currentUser.value.teamIds).contains(
                participant
            )
        }
    }

    override fun deleteEvent() {
        scope.launch {
            if (selectedEvent.value.event.price == 0.0) {
                loadingHandler.showLoading("Deleting Event ...")
                eventAbsRepository.deleteEvent(selectedEvent.value.event).onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
                backCallback.onBack()
            } else {
                loadingHandler.showLoading("Deleting Event and Refunding ...")
                billingRepository.deleteAndRefundEvent(selectedEvent.value.event).onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
                backCallback.onBack()
            }
            loadingHandler.hideLoading()
        }
    }

    override fun shareEvent() {
        val shareService = shareServiceProvider.getShareService()
        shareService.share(
            selectedEvent.value.event.name, createEventUrl(selectedEvent.value.event)
        )
    }

    override fun checkIsUserFreeAgent(event: EventAbs): Boolean {
        return event.freeAgents.any { participant ->
            (currentUser.value.id + currentUser.value.teamIds).contains(
                participant
            )
        }
    }

    private fun checkIsUserParticipant(event: EventAbs): Boolean {
        return event.playerIds.contains(currentUser.value.id)
    }

    private fun checkIsUserCaptain(): Boolean {
        return _usersTeam.value?.team?.captainId == currentUser.value.id
    }

    private fun checkIsUserInEvent(event: EventAbs): Boolean {
        return checkIsUserParticipant(event) || checkIsUserFreeAgent(event) || checkIsUserWaitListed(
            event
        )
    }

    private fun checkEventIsFull(event: EventAbs): Boolean {
        return if (event.teamSignup) {
            event.maxParticipants <= event.teamIds.size
        } else {
            event.maxParticipants <= event.playerIds.size
        }
    }

    override fun showFeeBreakdown(
        feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit
    ) {
        _currentFeeBreakdown.value = feeBreakdown
        _showFeeBreakdown.value = true
        pendingPaymentAction = onConfirm
    }

    override fun dismissFeeBreakdown() {
        _showFeeBreakdown.value = false
        _currentFeeBreakdown.value = null
        pendingPaymentAction = null
    }

    override fun confirmFeeBreakdown() {
        pendingPaymentAction?.invoke()
        dismissFeeBreakdown()
    }
}