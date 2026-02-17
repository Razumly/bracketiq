@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.FeeBreakdown
import com.razumly.mvp.core.data.repositories.FamilyChild
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.util.normalizeDivisionLabel
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.util.ShareServiceProvider
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.presentation.util.createEventUrl
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
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
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.ExperimentalTime

interface EventDetailComponent : ComponentContext, IPaymentProcessor {
    val selectedEvent: StateFlow<Event>
    val divisionMatches: StateFlow<Map<String, MatchWithRelations>>
    val divisionTeams: StateFlow<Map<String, TeamWithPlayers>>
    val selectedDivision: StateFlow<String?>
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
    val editedEvent: StateFlow<Event>
    val backCallback: BackCallback
    val showFeeBreakdown: StateFlow<Boolean>
    val currentFeeBreakdown: StateFlow<FeeBreakdown?>
    val isUserInWaitlist: StateFlow<Boolean>
    val isUserFreeAgent: StateFlow<Boolean>
    val isUserCaptain: StateFlow<Boolean>
    val isEditingMatches: StateFlow<Boolean>
    val editableMatches: StateFlow<List<MatchWithRelations>>
    val editableRounds: StateFlow<List<List<MatchWithRelations?>>>
    val showTeamSelectionDialog: StateFlow<TeamSelectionDialogState?>
    val showMatchEditDialog: StateFlow<MatchEditDialogState?>
    val joinChoiceDialog: StateFlow<JoinChoiceDialogState?>
    val childJoinSelectionDialog: StateFlow<ChildJoinSelectionDialogState?>
    val textSignaturePrompt: StateFlow<TextSignaturePromptState?>
    val eventImageIds: StateFlow<List<String>>


    fun onNavigateToChat(user: UserData)
    fun matchSelected(selectedMatch: MatchWithRelations)
    fun showFeeBreakdown(feeBreakdown: FeeBreakdown, onConfirm: () -> Unit, onCancel: () -> Unit)
    fun onHostCreateAccount()
    fun selectDivision(division: String)
    fun setLoadingHandler(loadingHandler: LoadingHandler)
    fun toggleBracketView()
    fun toggleLosersBracket()
    fun toggleDetails()
    fun toggleEdit()
    fun joinEvent()
    fun joinEventAsTeam(team: TeamWithPlayers)
    fun confirmJoinAsSelf()
    fun showChildJoinSelection()
    fun selectChildForJoin(childUserId: String)
    fun dismissJoinChoiceDialog()
    fun dismissChildJoinSelectionDialog()
    fun viewEvent()
    fun leaveEvent()
    fun requestRefund(reason: String)
    fun editEventField(update: Event.() -> Event)
    fun editTournamentField(update: Event.() -> Event)
    fun updateEvent()
    fun publishEvent()
    fun deleteEvent()
    fun shareEvent()
    fun createNewTeam()
    fun selectPlace(place: MVPPlace?)
    fun onTypeSelected(type: EventType)
    fun selectFieldCount(count: Int)
    fun checkIsUserWaitListed(event: Event): Boolean
    fun checkIsUserFreeAgent(event: Event): Boolean
    fun dismissFeeBreakdown()
    fun confirmFeeBreakdown()
    fun startEditingMatches()
    fun cancelEditingMatches()
    fun commitMatchChanges()
    fun updateEditableMatch(matchId: String, updater: (MatchMVP) -> MatchMVP)
    fun showTeamSelection(matchId: String, position: TeamPosition)
    fun selectTeamForMatch(matchId: String, position: TeamPosition, teamId: String?)
    fun dismissTeamSelection()
    fun showMatchEditDialog(match: MatchWithRelations)
    fun dismissMatchEditDialog()
    fun updateMatchFromDialog(updatedMatch: MatchWithRelations)
    fun confirmTextSignature()
    fun dismissTextSignature()
    fun onUploadSelected(photo: GalleryPhotoResult)
    fun deleteImage(imageId: String)
    fun sendNotification(title: String, message: String)
}

data class TeamSelectionDialogState(
    val matchId: String, val position: TeamPosition, val availableTeams: List<TeamWithPlayers>
)

data class MatchEditDialogState(
    val match: MatchWithRelations,
    val teams: List<TeamWithPlayers>,
    val fields: List<FieldWithMatches>
)

data class TextSignaturePromptState(
    val step: SignStep,
    val currentStep: Int,
    val totalSteps: Int,
)

data class JoinChildOption(
    val userId: String,
    val fullName: String,
    val email: String?,
    val hasEmail: Boolean,
)

data class JoinChoiceDialogState(
    val children: List<JoinChildOption>,
)

data class ChildJoinSelectionDialogState(
    val children: List<JoinChildOption>,
)

private fun FamilyChild.toJoinChildOption(): JoinChildOption {
    val normalizedFirstName = firstName.trim()
    val normalizedLastName = lastName.trim()
    val fullName = listOf(normalizedFirstName, normalizedLastName)
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .ifBlank { "Child" }
    val normalizedEmail = email?.trim()?.takeIf(String::isNotBlank)
    return JoinChildOption(
        userId = userId,
        fullName = fullName,
        email = normalizedEmail,
        hasEmail = hasEmail ?: (normalizedEmail != null),
    )
}

enum class TeamPosition { TEAM1, TEAM2, REF }

@Serializable
data class EventWithFullRelations(
    val event: Event,
    val players: List<UserData>,
    val matches: List<MatchWithRelations>,
    val teams: List<TeamWithPlayers>,
    val timeSlots: List<TimeSlot> = emptyList(),
    val organization: Organization? = null,
    val sport: Sport? = null,
    val leagueScoringConfig: LeagueScoringConfig? = null,
    val host: UserData? = null
)

fun EventWithRelations.toEventWithFullRelations(
    matches: List<MatchWithRelations>, teams: List<TeamWithPlayers>
): EventWithFullRelations = EventWithFullRelations(
    event = event,
    players = players,
    matches = matches,
    teams = teams,
    timeSlots = emptyList(),
    organization = null,
    sport = null,
    leagueScoringConfig = null,
    host = host
)

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultEventDetailComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    fieldRepository: IFieldRepository,
    event: Event,
    private val notificationsRepository: IPushNotificationsRepository,
    private val billingRepository: IBillingRepository,
    private val eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    private val teamRepository: ITeamRepository,
    private val imageRepository: IImagesRepository,
    private val navigationHandler: INavigationHandler,

) : EventDetailComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    override val currentUser = userRepository.currentUser.map { it.getOrThrow() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())

    private val _currentAccount = userRepository.currentAccount.map { result ->
        result.getOrElse {
            userRepository.getCurrentAccount()
            AuthAccount.empty()
        }
    }.stateIn(scope, SharingStarted.Eagerly, AuthAccount.empty())

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
            navigationHandler.navigateBack()
        }
    }

    override val eventImageIds =
        imageRepository.getUserImageIdsFlow().stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val eventRelations: StateFlow<EventWithRelations> =
        eventRepository.getEventWithRelationsFlow(event.id).map { result ->
            result.getOrElse {
                _errorState.value = ErrorMessage(it.message ?: "")
                EventWithRelations(event, null)
            }
        }.stateIn(
            scope,
            SharingStarted.Eagerly,
            EventWithRelations(event, null)
        )

    override val selectedEvent: StateFlow<Event> =
        eventRelations.map { it.event }.stateIn(scope, SharingStarted.Eagerly, event)

    override val isHost = selectedEvent.map { it.hostId == currentUser.value.id }
        .stateIn(scope, SharingStarted.Eagerly, false)

    override val eventWithRelations = eventRelations.flatMapLatest { relations ->
        combine(
            matchRepository.getMatchesOfTournamentFlow(relations.event.id).map { result ->
                result.getOrElse {
                    _errorState.value =
                        ErrorMessage("Error loading matches: ${it.message}"); emptyList()
                }
            }, teamRepository.getTeamsFlow(
                relations.event.teamIds
            ).map { result ->
                result.getOrElse {
                    _errorState.value =
                        ErrorMessage("Failed to load teams: ${it.message}"); emptyList()
                }
            }) { matches, teams ->
            relations.toEventWithFullRelations(matches, teams)
        }
    }.stateIn(
        scope, SharingStarted.Eagerly, EventWithFullRelations(
            event, emptyList(), emptyList(), emptyList()
        )
    )

    override val divisionFields =
        fieldRepository.getFieldsWithMatchesFlow(event.fieldIds).map { fields ->
            val activeDivision = _selectedDivision.value
            fields.filter {
                if (!selectedEvent.value.singleDivision && !activeDivision.isNullOrEmpty()) {
                    it.field.divisions.any { division ->
                        division.normalizeDivisionLabel() == activeDivision
                    }
                } else {
                    true
                }
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private val _divisionMatches = MutableStateFlow<Map<String, MatchWithRelations>>(emptyMap())
    override val divisionMatches = _divisionMatches.asStateFlow()

    private val _divisionTeams = MutableStateFlow<Map<String, TeamWithPlayers>>(emptyMap())
    override val divisionTeams = _divisionTeams.asStateFlow()

    private val _selectedDivision = MutableStateFlow<String?>(null)
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

    override val isEventFull = selectedEvent.map { event ->
        checkEventIsFull(event)
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

    private val _isEditingMatches = MutableStateFlow(false)
    override val isEditingMatches = _isEditingMatches.asStateFlow()

    private val _editableMatches = MutableStateFlow<List<MatchWithRelations>>(emptyList())
    override val editableMatches = _editableMatches.asStateFlow()

    private val _editableRounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    override val editableRounds = _editableRounds.asStateFlow()

    private val _showTeamSelectionDialog = MutableStateFlow<TeamSelectionDialogState?>(null)
    override val showTeamSelectionDialog = _showTeamSelectionDialog.asStateFlow()

    private val _showMatchEditDialog = MutableStateFlow<MatchEditDialogState?>(null)
    override val showMatchEditDialog = _showMatchEditDialog.asStateFlow()

    private val _joinChoiceDialog = MutableStateFlow<JoinChoiceDialogState?>(null)
    override val joinChoiceDialog = _joinChoiceDialog.asStateFlow()

    private val _childJoinSelectionDialog = MutableStateFlow<ChildJoinSelectionDialogState?>(null)
    override val childJoinSelectionDialog = _childJoinSelectionDialog.asStateFlow()

    private val _textSignaturePrompt = MutableStateFlow<TextSignaturePromptState?>(null)
    override val textSignaturePrompt = _textSignaturePrompt.asStateFlow()

    private var joinableChildren: List<JoinChildOption> = emptyList()
    private var pendingSignatureSteps: List<SignStep> = emptyList()
    private var pendingSignatureStepIndex = 0
    private var pendingPostSignatureAction: (suspend () -> Unit)? = null
    private var pendingSignatureContext: SignerContext = SignerContext.PARTICIPANT
    private var pendingSignatureChild: JoinChildOption? = null
    private val completedSignatureKeys = mutableSetOf<String>()

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

                            loadingHandler.showLoading("Reloading Event")
                            val userJoinedSuccessfully = waitForUserInEventWithTimeout()
                            if (!userJoinedSuccessfully) {
                                _errorState.value =
                                    ErrorMessage("Failed to confirm event join. Please reload event.")
                            }
                        }
                    }
                    loadingHandler.hideLoading()
                }
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(null)
            matchRepository.subscribeToMatches()
            eventWithRelations.distinctUntilChanged { old, new -> old == new }.filterNotNull()
                .collect { event ->
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

    override fun onNavigateToChat(user: UserData) {
        navigationHandler.navigateToChat(user = user)
    }

    override fun matchSelected(selectedMatch: MatchWithRelations) {
        navigationHandler.navigateToMatch(
            selectedMatch,
            selectedEvent.value
        )
    }

    override fun selectDivision(division: String) {
        val normalizedDivision = division.normalizeDivisionLabel()
        _selectedDivision.value = normalizedDivision.ifEmpty { null }
        _divisionTeams.value = eventWithRelations.value.teams.associateBy { it.team.id }
        val divisionFilter = _selectedDivision.value
        _divisionMatches.value = if (!selectedEvent.value.singleDivision && !divisionFilter.isNullOrEmpty()) {
            eventWithRelations.value.matches.filter {
                it.match.division?.normalizeDivisionLabel() == divisionFilter && !(
                    it.previousRightMatch == null &&
                    it.previousLeftMatch == null &&
                    it.winnerNextMatch == null &&
                    it.loserNextMatch == null
                )
            }
                .associateBy { it.match.id }
        } else {
            eventWithRelations.value.matches.filter {
                !(
                    it.previousRightMatch == null &&
                    it.previousLeftMatch == null &&
                    it.winnerNextMatch == null &&
                    it.loserNextMatch == null
                )
            }.associateBy { it.match.id }
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

    override fun onUploadSelected(photo: GalleryPhotoResult) {
        scope.launch {
            imageRepository.uploadImage(convertPhotoResultToUploadFile(photo))
        }
    }

    override fun deleteImage(imageId: String) {
        scope.launch {
            loadingHandler.showLoading("Deleting Image ...")
            imageRepository.deleteImage(imageId)
            loadingHandler.hideLoading()
        }
    }

    override fun joinEvent() {
        scope.launch {
            if (!selectedEvent.value.teamSignup) {
                val children = loadJoinableChildren()
                if (children.isNotEmpty()) {
                    joinableChildren = children
                    _joinChoiceDialog.value = JoinChoiceDialogState(children = children)
                    _childJoinSelectionDialog.value = null
                    return@launch
                }
            }
            runSelfJoinFlow()
        }
    }

    override fun joinEventAsTeam(team: TeamWithPlayers) {
        scope.launch {
            _usersTeam.value = team
            _joinChoiceDialog.value = null
            _childJoinSelectionDialog.value = null
            runActionAfterRequiredSigning {
                executeJoinEventAsTeam(team)
            }
        }
    }

    override fun confirmJoinAsSelf() {
        _joinChoiceDialog.value = null
        _childJoinSelectionDialog.value = null
        scope.launch {
            runSelfJoinFlow()
        }
    }

    override fun showChildJoinSelection() {
        val children = if (joinableChildren.isNotEmpty()) {
            joinableChildren
        } else {
            _joinChoiceDialog.value?.children.orEmpty()
        }
        _joinChoiceDialog.value = null
        if (children.isEmpty()) {
            _errorState.value = ErrorMessage("No linked children are available for registration.")
            _childJoinSelectionDialog.value = null
            return
        }
        _childJoinSelectionDialog.value = ChildJoinSelectionDialogState(children = children)
    }

    override fun selectChildForJoin(childUserId: String) {
        val selectedChild = joinableChildren.firstOrNull { it.userId == childUserId }
        if (selectedChild == null) {
            _errorState.value = ErrorMessage("Unable to find that child profile.")
            return
        }
        if (!selectedChild.hasEmail || selectedChild.email.isNullOrBlank()) {
            _errorState.value = ErrorMessage(
                "Child email is required before registration can continue."
            )
            return
        }

        _joinChoiceDialog.value = null
        _childJoinSelectionDialog.value = null
        scope.launch {
            runActionAfterRequiredSigning(
                signerContext = SignerContext.PARENT_GUARDIAN,
                child = selectedChild,
            ) {
                executeChildRegistration(selectedChild)
            }
        }
    }

    override fun dismissJoinChoiceDialog() {
        _joinChoiceDialog.value = null
    }

    override fun dismissChildJoinSelectionDialog() {
        _childJoinSelectionDialog.value = null
    }

    private suspend fun runSelfJoinFlow() {
        runActionAfterRequiredSigning(
            signerContext = SignerContext.PARTICIPANT,
            child = null,
        ) {
            executeJoinEvent()
        }
    }

    private suspend fun loadJoinableChildren(): List<JoinChildOption> {
        return userRepository.listChildren()
            .onFailure { throwable ->
                Napier.w("Failed to load linked children before join flow.", throwable)
            }
            .getOrElse { emptyList() }
            .asSequence()
            .filter { child ->
                child.userId.isNotBlank() &&
                    (child.linkStatus?.equals("active", ignoreCase = true) != false)
            }
            .map { child -> child.toJoinChildOption() }
            .toList()
    }

    private suspend fun executeChildRegistration(child: JoinChildOption) {
        try {
            loadingHandler.showLoading("Registering Child ...")
            eventRepository.registerChildForEvent(
                eventId = selectedEvent.value.id,
                childUserId = child.userId,
            ).onSuccess {
                loadingHandler.showLoading("Refreshing Event ...")
                eventRepository.getEvent(selectedEvent.value.id)
                _errorState.value = ErrorMessage(
                    "${child.fullName} registration started."
                )
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(throwable.message ?: "Failed to register child.")
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private suspend fun executeJoinEvent() {
        try {
            if (selectedEvent.value.price == 0.0 || isEventFull.value || selectedEvent.value.teamSignup) {
                loadingHandler.showLoading("Joining Event ...")
                eventRepository.addCurrentUserToEvent(selectedEvent.value).onSuccess {
                    loadingHandler.showLoading("Reloading Event")
                    eventRepository.getEvent(selectedEvent.value.id)
                }.onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            } else {
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(selectedEvent.value)
                    .onSuccess { purchaseIntent ->
                        purchaseIntent?.let {
                            processPurchaseIntent(it)
                        }
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.message ?: "")
                    }
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private suspend fun executeJoinEventAsTeam(team: TeamWithPlayers) {
        try {
            if (selectedEvent.value.price == 0.0 || isEventFull.value) {
                loadingHandler.showLoading("Joining Event ...")
                eventRepository.addTeamToEvent(selectedEvent.value, team.team).onSuccess {
                    loadingHandler.showLoading("Reloading Event")
                    eventRepository.getEvent(selectedEvent.value.id)
                }.onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            } else {
                loadingHandler.showLoading("Creating Purchase Request ...")
                billingRepository.createPurchaseIntent(selectedEvent.value, team.team.id)
                    .onSuccess { purchaseIntent ->
                        purchaseIntent?.let {
                            processPurchaseIntent(it)
                        }
                    }.onFailure {
                        _errorState.value = ErrorMessage(it.message ?: "")
                    }
            }
        } finally {
            loadingHandler.hideLoading()
        }
    }

    private fun signatureCompletionKey(
        templateId: String,
        signerContext: SignerContext,
        child: JoinChildOption?,
    ): String = "${signerContext.name}:${child?.userId.orEmpty()}:$templateId"

    private suspend fun runActionAfterRequiredSigning(
        signerContext: SignerContext = SignerContext.PARTICIPANT,
        child: JoinChildOption? = null,
        onReady: suspend () -> Unit,
    ) {
        billingRepository.getRequiredSignLinks(
            eventId = selectedEvent.value.id,
            signerContext = signerContext,
            childUserId = child?.userId,
            childUserEmail = child?.email,
        ).onFailure { throwable ->
            Napier.e("Failed to load required signing documents.", throwable)
            _errorState.value = ErrorMessage(
                "Unable to load required documents: ${throwable.message ?: "Unknown error"}"
            )
        }.onSuccess { allSteps ->
            val pendingSteps = allSteps.filterNot { step ->
                val key = signatureCompletionKey(
                    templateId = step.templateId,
                    signerContext = signerContext,
                    child = child,
                )
                completedSignatureKeys.contains(key)
            }

            if (pendingSteps.isEmpty()) {
                onReady()
                return@onSuccess
            }

            pendingSignatureSteps = pendingSteps
            pendingSignatureStepIndex = 0
            pendingSignatureContext = signerContext
            pendingSignatureChild = child
            pendingPostSignatureAction = onReady
            processNextSignatureStep()
        }
    }

    private suspend fun processNextSignatureStep() {
        val currentStep = pendingSignatureSteps.getOrNull(pendingSignatureStepIndex)
        if (currentStep == null) {
            val action = pendingPostSignatureAction
            clearPendingSignatureFlow()
            action?.invoke()
            return
        }

        if (currentStep.isTextStep()) {
            _textSignaturePrompt.value = TextSignaturePromptState(
                step = currentStep,
                currentStep = pendingSignatureStepIndex + 1,
                totalSteps = pendingSignatureSteps.size
            )
            return
        }

        val signingUrl = currentStep.resolvedSigningUrl()
        if (signingUrl.isNullOrBlank()) {
            clearPendingSignatureFlow()
            _errorState.value = ErrorMessage(
                "A required document is missing a signing URL."
            )
            return
        }

        val openResult = urlHandler?.openUrlInWebView(signingUrl)
            ?: Result.failure(IllegalStateException("Web view is unavailable."))

        openResult.onFailure { throwable ->
            Napier.e("Failed to open signing URL.", throwable)
            _errorState.value = ErrorMessage(
                "Unable to open signing document: ${throwable.message ?: "Unknown error"}"
            )
        }.onSuccess {
            _errorState.value = ErrorMessage(
                "Please complete document signing, then tap Join/Purchase again."
            )
        }

        clearPendingSignatureFlow()
    }

    private fun clearPendingSignatureFlow() {
        pendingSignatureSteps = emptyList()
        pendingSignatureStepIndex = 0
        pendingSignatureContext = SignerContext.PARTICIPANT
        pendingSignatureChild = null
        pendingPostSignatureAction = null
        _textSignaturePrompt.value = null
    }

    private suspend fun processPurchaseIntent(intent: PurchaseIntent) {
        if (!ensureDocumentSignedBeforePurchase(intent)) {
            return
        }

        intent.feeBreakdown?.let { feeBreakdown ->
            showFeeBreakdown(feeBreakdown, onConfirm = {
                scope.launch {
                    showPaymentSheet(intent)
                }
            }, onCancel = {
                loadingHandler.hideLoading()
            })
        } ?: run {
            showPaymentSheet(intent)
        }
    }

    private suspend fun ensureDocumentSignedBeforePurchase(intent: PurchaseIntent): Boolean {
        if (!intent.isSignatureRequired() || intent.isSignatureCompleted()) {
            return true
        }

        val signingUrl = intent.resolvedSigningUrl()
        if (signingUrl.isNullOrBlank()) {
            Napier.w("Purchase intent requires signature but did not include a signing URL.")
            return true
        }

        val openResult = urlHandler?.openUrlInWebView(signingUrl)
            ?: Result.failure(IllegalStateException("Web view is unavailable."))

        openResult.onFailure { throwable ->
            Napier.e("Failed to open signing URL before purchase.", throwable)
            _errorState.value = ErrorMessage(
                "Unable to open signing document: ${throwable.message ?: "Unknown error"}"
            )
        }.onSuccess {
            _errorState.value = ErrorMessage(
                "Please complete document signing, then tap Purchase Ticket again."
            )
        }

        return false
    }

    private suspend fun showPaymentSheet(intent: PurchaseIntent) {
        setPaymentIntent(intent)
        loadingHandler.showLoading("Waiting for Payment Completion ..")
        presentPaymentSheet(
            _currentAccount.value.email, currentUser.value.fullName
        )
    }

    override fun requestRefund(reason: String) {
        scope.launch {
            if (!_isUserInEvent.value) {
                return@launch
            }
            loadingHandler.showLoading("Requesting Refund ...")
            billingRepository.leaveAndRefundEvent(selectedEvent.value, reason).onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }.onSuccess {
                eventRepository.getEvent(selectedEvent.value.id)
            }
            loadingHandler.showLoading("Reloading Event")
            eventRepository.getEvent(selectedEvent.value.id)
            loadingHandler.hideLoading()
        }
    }

    override fun leaveEvent() {
        scope.launch {
            if (!_isUserInEvent.value) {
                return@launch
            }
            val result =
                if (!selectedEvent.value.teamSignup || checkIsUserFreeAgent(selectedEvent.value)) {
                    loadingHandler.showLoading("Leaving Event ...")
                    eventRepository.removeCurrentUserFromEvent(selectedEvent.value)
                        .onFailure { _errorState.value = ErrorMessage(it.message ?: "") }
                } else {
                    loadingHandler.showLoading("Team Leaving Event ...")
                    eventRepository.removeTeamFromEvent(
                        selectedEvent.value, _usersTeam.value!!
                    ).onFailure { _errorState.value = ErrorMessage(it.message ?: "") }
                }
            result.onSuccess {
                loadingHandler.showLoading("Reloading Event")
                eventRepository.getEvent(selectedEvent.value.id)
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
        _editedEvent.value = selectedEvent.value
        _isEditing.value = !_isEditing.value
    }

    override fun editEventField(update: Event.() -> Event) {
        _editedEvent.value = _editedEvent.value.update()
    }

    override fun editTournamentField(update: Event.() -> Event) {
        _editedEvent.value = _editedEvent.value.update()
    }

    override fun updateEvent() {
        scope.launch {
            eventRepository.updateEvent(_editedEvent.value)
                .onSuccess { updated ->
                    if (updated.eventType == EventType.LEAGUE || updated.eventType == EventType.TOURNAMENT) {
                        matchRepository.getMatchesOfTournament(updated.id)
                    }
                }
                .onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            toggleEdit()
        }
    }

    override fun publishEvent() {
        scope.launch {
            val currentEvent = selectedEvent.value
            if (currentEvent.state == "PUBLISHED") {
                return@launch
            }
            loadingHandler.showLoading("Publishing event...")
            eventRepository.updateEvent(currentEvent.copy(state = "PUBLISHED"))
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.message ?: "Failed to publish event.")
                }
            eventRepository.getEvent(currentEvent.id)
            loadingHandler.hideLoading()
        }
    }

    override fun createNewTeam() {
        navigationHandler.navigateToTeams(
            selectedEvent.value.freeAgents, selectedEvent.value
        )
    }

    override fun selectPlace(place: MVPPlace?) {
        editEventField {
            copy(
                coordinates = place?.coordinates ?: listOf(0.0, 0.0), location = place?.name ?: ""
            )
        }
    }

    override fun onTypeSelected(type: EventType) {
        editEventField { copy(eventType = type) }
    }

    private fun generateRounds() {
        if (_divisionMatches.value.isEmpty()) {
            _rounds.value = emptyList()
            return
        }

        val rounds = mutableListOf<List<MatchWithRelations?>>()
        val visited = mutableSetOf<String>()

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

    override fun checkIsUserWaitListed(event: Event): Boolean {
        return event.waitList.any { participant ->
            (currentUser.value.id + currentUser.value.teamIds).contains(
                participant
            )
        }
    }

    override fun deleteEvent() {
        scope.launch {
            if (selectedEvent.value.price == 0.0) {
                loadingHandler.showLoading("Deleting Event ...")
                eventRepository.deleteEvent(selectedEvent.value.id).onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
                backCallback.onBack()
            } else {
                loadingHandler.showLoading("Deleting Event and Refunding ...")
                billingRepository.deleteAndRefundEvent(selectedEvent.value).onFailure {
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
            selectedEvent.value.name, createEventUrl(selectedEvent.value)
        )
    }

    override fun checkIsUserFreeAgent(event: Event): Boolean {
        return event.freeAgents.any { participant ->
            (currentUser.value.id + currentUser.value.teamIds).contains(
                participant
            )
        }
    }

    private fun checkIsUserParticipant(event: Event): Boolean {
        return event.playerIds.contains(currentUser.value.id)
    }

    private fun checkIsUserCaptain(): Boolean {
        return _usersTeam.value?.team?.captainId == currentUser.value.id
    }

    private fun checkIsUserInEvent(event: Event): Boolean {
        return checkIsUserParticipant(event) || checkIsUserFreeAgent(event) || checkIsUserWaitListed(
            event
        )
    }

    private fun checkEventIsFull(event: Event): Boolean {
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

    override fun confirmTextSignature() {
        val prompt = _textSignaturePrompt.value ?: return

        scope.launch {
            loadingHandler.showLoading("Recording signature ...")

            val documentId = prompt.step.resolvedDocumentId()
                ?: "mobile-text-${prompt.step.templateId}-${Clock.System.now().toEpochMilliseconds()}"

            billingRepository.recordSignature(
                eventId = selectedEvent.value.id,
                templateId = prompt.step.templateId,
                documentId = documentId,
                type = prompt.step.type,
            ).onFailure { throwable ->
                Napier.e("Failed to record signature.", throwable)
                _errorState.value = ErrorMessage(
                    throwable.message ?: "Failed to record signature."
                )
            }.onSuccess {
                completedSignatureKeys += signatureCompletionKey(
                    templateId = prompt.step.templateId,
                    signerContext = pendingSignatureContext,
                    child = pendingSignatureChild,
                )
                _textSignaturePrompt.value = null
                pendingSignatureStepIndex += 1
                processNextSignatureStep()
            }

            loadingHandler.hideLoading()
        }
    }

    override fun dismissTextSignature() {
        clearPendingSignatureFlow()
        _errorState.value = ErrorMessage("Document signing canceled.")
    }

    override fun startEditingMatches() {
        scope.launch {
            val currentMatches = eventWithRelations.value.matches
            _editableMatches.value = currentMatches.map { it.copy() }
            val editableMap = editableMatches.value.associateBy { it.match.id }
            _editableRounds.value = rounds.value.map { round ->
                round.map { match ->
                    match?.let { editableMap[it.match.id] ?: it }
                }
            }
            _isEditingMatches.value = true
        }
    }

    override fun cancelEditingMatches() {
        _isEditingMatches.value = false
        _editableMatches.value = emptyList()
        _showTeamSelectionDialog.value = null
    }

    override fun commitMatchChanges() {
        scope.launch {
            val matches = _editableMatches.value

            val validationResult = validateMatches(matches)
            if (!validationResult.isValid) {
                _errorState.value = ErrorMessage(validationResult.errorMessage)
                return@launch
            }

            loadingHandler.showLoading("Updating matches...")

            try {
                // Update all matches
                matches.forEach { matchWithRelations ->
                    matchRepository.updateMatch(matchWithRelations.match).onFailure { error ->
                        throw Exception("Failed to update match: ${error.message}")
                    }
                }

                _isEditingMatches.value = false
                _editableMatches.value = emptyList()
                loadingHandler.hideLoading()
            } catch (e: Exception) {
                _errorState.value = ErrorMessage(e.message ?: "Failed to update matches")
                loadingHandler.hideLoading()
            }
        }
    }

    override fun updateEditableMatch(matchId: String, updater: (MatchMVP) -> MatchMVP) {
        val currentMatches = _editableMatches.value.toMutableList()
        val matchIndex = currentMatches.indexOfFirst { it.match.id == matchId }

        if (matchIndex != -1) {
            val currentMatch = currentMatches[matchIndex]
            val updatedMatch = currentMatch.copy(match = updater(currentMatch.match))
            currentMatches[matchIndex] = updatedMatch
            _editableMatches.value = currentMatches
        }
    }

    override fun showTeamSelection(matchId: String, position: TeamPosition) {
        val availableTeams = eventWithRelations.value.teams
        _showTeamSelectionDialog.value = TeamSelectionDialogState(
            matchId = matchId, position = position, availableTeams = availableTeams
        )
    }

    override fun selectTeamForMatch(matchId: String, position: TeamPosition, teamId: String?) {
        updateEditableMatch(matchId) { match ->
            when (position) {
                TeamPosition.TEAM1 -> match.copy(team1Id = teamId)
                TeamPosition.TEAM2 -> match.copy(team2Id = teamId)
                TeamPosition.REF -> match.copy(teamRefereeId = teamId)
            }
        }
        _showTeamSelectionDialog.value = null
    }

    override fun dismissTeamSelection() {
        _showTeamSelectionDialog.value = null
    }

    private fun validateMatches(matches: List<MatchWithRelations>): ValidationResult {
        for (i in matches.indices) {
            for (j in i + 1 until matches.size) {
                val match1 = matches[i].match
                val match2 = matches[j].match

                if (doMatchesOverlap(match1, match2)) {
                    if (match1.fieldId != null && match1.fieldId == match2.fieldId) {
                        return ValidationResult(
                            isValid = false,
                            errorMessage = "Matches #${match1.matchId} and #${match2.matchId} overlap on the same field"
                        )
                    }

                    val match1Teams = setOfNotNull(match1.team1Id, match1.team2Id, match1.teamRefereeId)
                    val match2Teams = setOfNotNull(match2.team1Id, match2.team2Id, match2.teamRefereeId)
                    val sharedTeams = match1Teams.intersect(match2Teams)

                    if (sharedTeams.isNotEmpty()) {
                        return ValidationResult(
                            isValid = false,
                            errorMessage = "Matches #${match1.matchId} and #${match2.matchId} have overlapping participants"
                        )
                    }
                }
            }
        }
        return ValidationResult(isValid = true, errorMessage = "")
    }

    private fun doMatchesOverlap(match1: MatchMVP, match2: MatchMVP): Boolean {
        val match1End = match1.end ?: return false
        val match2End = match2.end ?: return false

        return match1.start < match2End && match2.start < match1End
    }

    override fun showMatchEditDialog(match: MatchWithRelations) {
        _showMatchEditDialog.value = MatchEditDialogState(
            match = match, teams = eventWithRelations.value.teams, fields = divisionFields.value
        )
    }

    override fun sendNotification(title: String, message: String) {
        scope.launch {
            val isEvent = selectedEvent.value is Event
            notificationsRepository.sendEventNotification(
                eventWithRelations.value.event.id, title, message, isEvent
            ).onFailure {
                _errorState.value = ErrorMessage(("Failed to send message: " + it.message))
            }
        }
    }

    override fun dismissMatchEditDialog() {
        _showMatchEditDialog.value = null
    }

    override fun updateMatchFromDialog(updatedMatch: MatchWithRelations) {
        val currentMatches = _editableMatches.value.toMutableList()
        val matchIndex = currentMatches.indexOfFirst { it.match.id == updatedMatch.match.id }

        if (matchIndex != -1) {
            currentMatches[matchIndex] = updatedMatch
            _editableMatches.value = currentMatches
        }

        dismissMatchEditDialog()
    }

    private suspend fun waitForUserInEventWithTimeout(
        timeoutS: Duration = 30.seconds, checkIntervalS: Duration = 1.seconds
    ): Boolean {
        val startTime = Clock.System.now()

        while (!_isUserInEvent.value) {
            if (Clock.System.now() - startTime > timeoutS) {
                return false
            }

            try {
                eventRepository.getEvent(selectedEvent.value.id)
                delay(checkIntervalS)
            } catch (e: Exception) {
                delay(checkIntervalS * 2)
            }
        }

        return true // User successfully appeared in event
    }

    data class ValidationResult(
        val isValid: Boolean, val errorMessage: String
    )
}
