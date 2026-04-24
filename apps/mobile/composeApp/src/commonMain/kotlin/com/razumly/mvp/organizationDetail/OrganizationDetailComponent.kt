package com.razumly.mvp.organizationDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.data.repositories.isActive
import com.razumly.mvp.core.data.repositories.requiresAdditionalSigning
import com.razumly.mvp.core.data.repositories.requiresChildEmail
import com.razumly.mvp.core.data.repositories.userMessage
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventDetail.TextSignaturePromptState
import com.razumly.mvp.eventDetail.WebSignaturePromptState
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventSearch.RentalAvailabilityLoader
import com.razumly.mvp.eventSearch.RentalBusyBlock
import com.razumly.mvp.eventSearch.RentalFieldOption
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.time.Clock

private fun Product.isSinglePurchase(): Boolean =
    period.trim().equals("SINGLE", ignoreCase = true)

interface OrganizationDetailComponent : IPaymentProcessor {
    val initialTab: OrganizationDetailTab
    val organization: StateFlow<Organization?>
    val events: StateFlow<List<Event>>
    val teams: StateFlow<List<TeamWithPlayers>>
    val products: StateFlow<List<Product>>
    val startingProductCheckoutId: StateFlow<String?>
    val rentalFieldOptions: StateFlow<List<RentalFieldOption>>
    val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>>
    val isLoadingOrganization: StateFlow<Boolean>
    val isLoadingEvents: StateFlow<Boolean>
    val isLoadingTeams: StateFlow<Boolean>
    val isLoadingProducts: StateFlow<Boolean>
    val isLoadingRentals: StateFlow<Boolean>
    val errorState: StateFlow<ErrorMessage?>
    val message: StateFlow<String?>
    val billingAddressPrompt: StateFlow<BillingAddressDraft?>
    val currentUser: StateFlow<UserData>
    val startingTeamRegistrationId: StateFlow<String?>
    val textSignaturePrompt: StateFlow<TextSignaturePromptState?>
    val webSignaturePrompt: StateFlow<WebSignaturePromptState?>

    fun setLoadingHandler(handler: LoadingHandler)
    fun refreshOrganization(force: Boolean = false)
    fun refreshEvents(force: Boolean = false)
    fun refreshTeams(force: Boolean = false)
    fun refreshProducts(force: Boolean = false)
    fun refreshRentals(force: Boolean = false)
    fun clearRentalData()
    fun startProductPurchase(product: Product)
    fun startTeamRegistration(team: TeamWithPlayers)
    fun leaveTeam(team: TeamWithPlayers)
    fun submitBillingAddress(address: BillingAddressDraft)
    fun dismissBillingAddressPrompt()
    fun confirmTextSignature()
    fun dismissTextSignature()
    fun dismissWebSignaturePrompt()
    fun startRentalCreate(context: RentalCreateContext)
    fun viewEvent(event: Event)
    fun onBackClicked()
}

class DefaultOrganizationDetailComponent(
    componentContext: ComponentContext,
    private val organizationId: String,
    override val initialTab: OrganizationDetailTab,
    private val billingRepository: IBillingRepository,
    private val eventRepository: IEventRepository,
    private val teamRepository: ITeamRepository,
    private val fieldRepository: IFieldRepository,
    private val matchRepository: IMatchRepository,
    private val userRepository: IUserRepository,
    private val navigationHandler: INavigationHandler,
) : OrganizationDetailComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val rentalAvailabilityLoader = RentalAvailabilityLoader(
        eventRepository = eventRepository,
        matchRepository = matchRepository,
        fieldRepository = fieldRepository,
    )

    private val _organization = MutableStateFlow<Organization?>(null)
    override val organization: StateFlow<Organization?> = _organization.asStateFlow()

    private val _events = MutableStateFlow<List<Event>>(emptyList())
    override val events: StateFlow<List<Event>> = _events.asStateFlow()

    private val _teams = MutableStateFlow<List<TeamWithPlayers>>(emptyList())
    override val teams: StateFlow<List<TeamWithPlayers>> = _teams.asStateFlow()

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    override val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _startingProductCheckoutId = MutableStateFlow<String?>(null)
    override val startingProductCheckoutId: StateFlow<String?> = _startingProductCheckoutId.asStateFlow()

    private val _rentalFieldOptions = MutableStateFlow<List<RentalFieldOption>>(emptyList())
    override val rentalFieldOptions: StateFlow<List<RentalFieldOption>> = _rentalFieldOptions.asStateFlow()

    private val _rentalBusyBlocks = MutableStateFlow<List<RentalBusyBlock>>(emptyList())
    override val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>> = _rentalBusyBlocks.asStateFlow()

    private val _isLoadingOrganization = MutableStateFlow(false)
    override val isLoadingOrganization: StateFlow<Boolean> = _isLoadingOrganization.asStateFlow()

    private val _isLoadingEvents = MutableStateFlow(false)
    override val isLoadingEvents: StateFlow<Boolean> = _isLoadingEvents.asStateFlow()

    private val _isLoadingTeams = MutableStateFlow(false)
    override val isLoadingTeams: StateFlow<Boolean> = _isLoadingTeams.asStateFlow()

    private val _isLoadingProducts = MutableStateFlow(false)
    override val isLoadingProducts: StateFlow<Boolean> = _isLoadingProducts.asStateFlow()

    private val _isLoadingRentals = MutableStateFlow(false)
    override val isLoadingRentals: StateFlow<Boolean> = _isLoadingRentals.asStateFlow()

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState: StateFlow<ErrorMessage?> = _errorState.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    override val message: StateFlow<String?> = _message.asStateFlow()
    private val _billingAddressPrompt = MutableStateFlow<BillingAddressDraft?>(null)
    override val billingAddressPrompt: StateFlow<BillingAddressDraft?> = _billingAddressPrompt.asStateFlow()
    private val _textSignaturePrompt = MutableStateFlow<TextSignaturePromptState?>(null)
    override val textSignaturePrompt: StateFlow<TextSignaturePromptState?> = _textSignaturePrompt.asStateFlow()
    private val _webSignaturePrompt = MutableStateFlow<WebSignaturePromptState?>(null)
    override val webSignaturePrompt: StateFlow<WebSignaturePromptState?> = _webSignaturePrompt.asStateFlow()
    override val currentUser: StateFlow<UserData> = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())
    private val _startingTeamRegistrationId = MutableStateFlow<String?>(null)
    override val startingTeamRegistrationId: StateFlow<String?> = _startingTeamRegistrationId.asStateFlow()

    private var organizationLoaded = false
    private var eventsLoaded = false
    private var teamsLoaded = false
    private var productsLoaded = false
    private var rentalsLoaded = false
    private var pendingProductPurchase: Product? = null
    private var pendingTeamRegistration: TeamWithPlayers? = null
    private var pendingBillingAddressAction: (() -> Unit)? = null
    private var pendingTeamSignatureSteps: List<SignStep> = emptyList()
    private var pendingTeamSignatureStepIndex = 0
    private var pendingTeamSignatureTeamId: String? = null
    private var pendingTeamSignaturePollJob: Job? = null
    private var pendingPostSignatureAction: (suspend () -> Unit)? = null

    private lateinit var loadingHandler: LoadingHandler

    init {
        refreshOrganization()

        scope.launch {
            paymentResult.collect { result ->
                if (result == null) return@collect
                when (result) {
                    PaymentResult.Canceled -> {
                        _errorState.value = ErrorMessage("Payment canceled.")
                        _startingProductCheckoutId.value = null
                        _startingTeamRegistrationId.value = null
                        pendingProductPurchase = null
                        pendingTeamRegistration = null
                    }

                    is PaymentResult.Failed -> {
                        _errorState.value = ErrorMessage(result.error)
                        _startingProductCheckoutId.value = null
                        _startingTeamRegistrationId.value = null
                        pendingProductPurchase = null
                        pendingTeamRegistration = null
                    }

                    PaymentResult.Completed -> {
                        val pendingProduct = pendingProductPurchase
                        val pendingTeam = pendingTeamRegistration
                        _startingProductCheckoutId.value = null
                        _startingTeamRegistrationId.value = null
                        if (pendingProduct != null) {
                            _message.value = if (pendingProduct.isSinglePurchase()) {
                                "Purchase completed for ${pendingProduct.name}."
                            } else {
                                "Subscription started for ${pendingProduct.name}."
                            }
                            refreshProducts(force = true)
                            pendingProductPurchase = null
                        }
                        if (pendingTeam != null) {
                            _message.value = "Registration completed for ${pendingTeam.team.name}."
                            refreshTeams(force = true)
                            pendingTeamRegistration = null
                        }
                    }
                }
                clearPaymentResult()
                if (::loadingHandler.isInitialized) {
                    loadingHandler.hideLoading()
                }
            }
        }
    }

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    override fun refreshOrganization(force: Boolean) {
        scope.launch {
            if (_isLoadingOrganization.value) return@launch
            if (organizationLoaded && !force) return@launch

            _isLoadingOrganization.value = true
            billingRepository.getOrganizationsByIds(listOf(organizationId))
                .onSuccess { organizations ->
                    val loadedOrganization = organizations.firstOrNull()
                    if (loadedOrganization == null) {
                        _errorState.value = ErrorMessage("Organization not found.")
                    }
                    _organization.value = loadedOrganization
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to load organization: ${error.userMessage()}")
                    _organization.value = null
                }
            _isLoadingOrganization.value = false
            organizationLoaded = true

            if (_organization.value != null) {
                refreshEvents(force = true)
                refreshTeams(force = true)
                refreshProducts(force = true)
            }
        }
    }

    override fun refreshEvents(force: Boolean) {
        scope.launch {
            if (_isLoadingEvents.value) return@launch
            if (eventsLoaded && !force) return@launch

            _isLoadingEvents.value = true
            eventRepository.getEventsByOrganization(organizationId, limit = 300)
                .onSuccess { loadedEvents ->
                    _events.value = loadedEvents
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to load organization events: ${error.userMessage()}")
                    _events.value = emptyList()
                }
            _isLoadingEvents.value = false
            eventsLoaded = true
        }
    }

    override fun refreshTeams(force: Boolean) {
        scope.launch {
            if (_isLoadingTeams.value) return@launch
            if (teamsLoaded && !force) return@launch

            _isLoadingTeams.value = true
            teamRepository.getTeamsByOrganization(organizationId)
                .onSuccess { teamsWithPlayers ->
                    _teams.value = teamsWithPlayers
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to load organization teams: ${error.userMessage()}")
                    _teams.value = emptyList()
                }
            _isLoadingTeams.value = false
            teamsLoaded = true
        }
    }

    override fun refreshProducts(force: Boolean) {
        scope.launch {
            if (_isLoadingProducts.value) return@launch
            if (productsLoaded && !force) return@launch

            _isLoadingProducts.value = true
            billingRepository.listProductsByOrganization(organizationId)
                .onSuccess { loadedProducts ->
                    _products.value = loadedProducts
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to load organization products: ${error.userMessage()}")
                    _products.value = emptyList()
                }
            _isLoadingProducts.value = false
            productsLoaded = true
        }
    }

    override fun refreshRentals(force: Boolean) {
        scope.launch {
            if (_isLoadingRentals.value) return@launch
            if (rentalsLoaded && !force) return@launch

            val org = _organization.value
            if (org == null) {
                _rentalFieldOptions.value = emptyList()
                _rentalBusyBlocks.value = emptyList()
                rentalsLoaded = true
                return@launch
            }

            _isLoadingRentals.value = true
            val fieldIds = resolveOrganizationFieldIds(org)
            if (fieldIds.isEmpty()) {
                _rentalFieldOptions.value = emptyList()
                _rentalBusyBlocks.value = emptyList()
                _isLoadingRentals.value = false
                rentalsLoaded = true
                return@launch
            }

            loadRentalFieldOptions(fieldIds)
            loadRentalBusyBlocks(org.id, fieldIds)

            _isLoadingRentals.value = false
            rentalsLoaded = true
        }
    }

    override fun clearRentalData() {
        _rentalFieldOptions.value = emptyList()
        _rentalBusyBlocks.value = emptyList()
        rentalsLoaded = false
    }

    override fun startProductPurchase(product: Product) {
        scope.launch {
            if (_startingProductCheckoutId.value != null) return@launch

            _startingProductCheckoutId.value = product.id
            try {
                val user = userRepository.currentUser.value.getOrNull()
                val account = userRepository.currentAccount.value.getOrNull()
                if (user == null || user.id.isBlank()) {
                    _errorState.value = ErrorMessage("Please sign in to purchase.")
                    return@launch
                }
                if (!ensureBillingAddressOrPrompt { startProductPurchase(product) }) {
                    return@launch
                }

                if (::loadingHandler.isInitialized) {
                    loadingHandler.showLoading("Preparing checkout...")
                }
                val purchaseIntentResult = if (product.isSinglePurchase()) {
                    billingRepository.createProductPurchaseIntent(product.id)
                } else {
                    billingRepository.createProductSubscriptionIntent(product.id)
                }
                purchaseIntentResult
                    .onSuccess { intent ->
                        pendingProductPurchase = product
                        showPaymentSheet(intent, account?.email.orEmpty(), user.fullName)
                    }
                    .onFailure { error ->
                        _errorState.value = ErrorMessage("Unable to start checkout: ${error.userMessage()}")
                        if (::loadingHandler.isInitialized) {
                            loadingHandler.hideLoading()
                        }
                    }
            } catch (error: Throwable) {
                _errorState.value = ErrorMessage("Unable to start checkout: ${error.userMessage()}")
                if (::loadingHandler.isInitialized) {
                    loadingHandler.hideLoading()
                }
            } finally {
                _startingProductCheckoutId.value = null
            }
        }
    }

    override fun startRentalCreate(context: RentalCreateContext) {
        navigationHandler.navigateToCreate(context)
    }

    override fun startTeamRegistration(team: TeamWithPlayers) {
        scope.launch {
            val teamId = team.team.id.trim()
            if (teamId.isBlank() || _startingTeamRegistrationId.value != null) return@launch

            _startingTeamRegistrationId.value = teamId
            try {
                val user = userRepository.currentUser.value.getOrNull()
                val account = userRepository.currentAccount.value.getOrNull()
                if (user == null || user.id.isBlank()) {
                    _errorState.value = ErrorMessage("Please sign in to register.")
                    return@launch
                }

                if (::loadingHandler.isInitialized) {
                    loadingHandler.showLoading("Preparing team registration...")
                }
                teamRepository.requestTeamRegistration(teamId)
                    .onSuccess { result ->
                        handleTeamRegistrationResult(
                            team = team,
                            accountEmail = account?.email.orEmpty(),
                            payerName = user.fullName,
                            result = result,
                        )
                    }
                    .onFailure { error ->
                        _errorState.value = ErrorMessage("Unable to start registration: ${error.userMessage()}")
                    }
                if (::loadingHandler.isInitialized) {
                    loadingHandler.hideLoading()
                }
            } finally {
                if (pendingTeamRegistration == null) {
                    _startingTeamRegistrationId.value = null
                }
            }
        }
    }

    private suspend fun handleTeamRegistrationResult(
        team: TeamWithPlayers,
        accountEmail: String,
        payerName: String,
        result: TeamRegistrationResult,
    ) {
        if (result.requiresChildEmail()) {
            _errorState.value = ErrorMessage(
                result.userMessage("Add the child's email before continuing."),
            )
            return
        }

        if (result.requiresAdditionalSigning()) {
            startTeamSigning(team.team.id) {
                scope.launch {
                    _startingTeamRegistrationId.value = team.team.id
                    if (::loadingHandler.isInitialized) {
                        loadingHandler.showLoading("Refreshing team registration...")
                    }
                    teamRepository.requestTeamRegistration(team.team.id)
                        .onSuccess { refreshed ->
                            continueTeamRegistration(team, accountEmail, payerName, refreshed)
                        }.onFailure { error ->
                            _errorState.value = ErrorMessage(
                                "Unable to refresh team registration: ${error.userMessage()}",
                            )
                        }
                    if (::loadingHandler.isInitialized) {
                        loadingHandler.hideLoading()
                    }
                    if (pendingTeamRegistration == null) {
                        _startingTeamRegistrationId.value = null
                    }
                }
            }
            return
        }

        continueTeamRegistration(team, accountEmail, payerName, result)
    }

    private suspend fun continueTeamRegistration(
        team: TeamWithPlayers,
        accountEmail: String,
        payerName: String,
        result: TeamRegistrationResult,
    ) {
        val teamId = team.team.id.trim()
        if (teamId.isBlank()) {
            _errorState.value = ErrorMessage("This team is missing an id.")
            return
        }

        _startingTeamRegistrationId.value = teamId
        try {
            if (team.team.registrationPriceCents > 0) {
                if (!ensureBillingAddressOrPrompt {
                        scope.launch { continueTeamRegistration(team, accountEmail, payerName, result) }
                    }) {
                    return
                }
                if (::loadingHandler.isInitialized) {
                    loadingHandler.showLoading("Preparing checkout...")
                }
                billingRepository.createTeamRegistrationPurchaseIntent(
                    team = team.team,
                    teamRegistration = result.registration,
                ).onSuccess { intent ->
                    pendingTeamRegistration = team
                    showPaymentSheet(intent, accountEmail, payerName)
                }.onFailure { error ->
                    _errorState.value = ErrorMessage(
                        "Unable to start registration: ${error.userMessage(result.userMessage("Unable to start registration."))}",
                    )
                    if (::loadingHandler.isInitialized) {
                        loadingHandler.hideLoading()
                    }
                }
                return
            }

            if (!result.isActive()) {
                _errorState.value = ErrorMessage(result.userMessage("Unable to register for this team."))
                return
            }

            _message.value = "You are registered for ${team.team.name}."
            refreshTeams(force = true)
        } finally {
            if (pendingTeamRegistration == null) {
                _startingTeamRegistrationId.value = null
            }
        }
    }

    override fun leaveTeam(team: TeamWithPlayers) {
        scope.launch {
            val teamId = team.team.id.trim()
            if (teamId.isBlank()) return@launch
            if (::loadingHandler.isInitialized) {
                loadingHandler.showLoading("Leaving team...")
            }
            teamRepository.leaveTeam(teamId)
                .onSuccess {
                    _message.value = "You left ${team.team.name}."
                    refreshTeams(force = true)
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Unable to leave team: ${error.userMessage()}")
                }
            if (::loadingHandler.isInitialized) {
                loadingHandler.hideLoading()
            }
        }
    }

    override fun submitBillingAddress(address: BillingAddressDraft) {
        scope.launch {
            if (::loadingHandler.isInitialized) {
                loadingHandler.showLoading("Saving billing address...")
            }
            billingRepository.updateBillingAddress(address)
                .onSuccess {
                    _billingAddressPrompt.value = null
                    val action = pendingBillingAddressAction
                    pendingBillingAddressAction = null
                    action?.invoke()
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Unable to save billing address."))
                }
            if (::loadingHandler.isInitialized) {
                loadingHandler.hideLoading()
            }
        }
    }

    override fun dismissBillingAddressPrompt() {
        _billingAddressPrompt.value = null
        pendingBillingAddressAction = null
    }

    override fun confirmTextSignature() {
        val prompt = _textSignaturePrompt.value ?: return
        val teamId = pendingTeamSignatureTeamId?.trim().orEmpty()
        if (teamId.isBlank()) {
            _errorState.value = ErrorMessage("This document is missing a team id.")
            return
        }

        scope.launch {
            if (::loadingHandler.isInitialized) {
                loadingHandler.showLoading("Recording signature ...")
            }
            val documentId = prompt.step.resolvedDocumentId()
                ?: "mobile-team-text-${prompt.step.templateId}-${Clock.System.now().toEpochMilliseconds()}"

            billingRepository.recordTeamSignature(
                teamId = teamId,
                templateId = prompt.step.templateId,
                documentId = documentId,
                type = prompt.step.type,
            ).onFailure { error ->
                _errorState.value = ErrorMessage(error.userMessage("Failed to record signature."))
            }.onSuccess {
                _textSignaturePrompt.value = null
                if (awaitTeamSignatureStepClearance(prompt.step)) {
                    processNextTeamSignatureStep()
                }
            }
            if (::loadingHandler.isInitialized) {
                loadingHandler.hideLoading()
            }
        }
    }

    override fun dismissTextSignature() {
        clearPendingTeamSignatureFlow()
        _errorState.value = ErrorMessage("Document signing canceled.")
    }

    override fun dismissWebSignaturePrompt() {
        clearPendingTeamSignatureFlow()
        _errorState.value = ErrorMessage("Document signing canceled.")
    }

    override fun viewEvent(event: Event) {
        navigationHandler.navigateToEvent(event)
    }

    override fun onBackClicked() {
        navigationHandler.navigateBack()
    }

    private suspend fun showPaymentSheet(
        intent: com.razumly.mvp.core.data.repositories.PurchaseIntent,
        email: String,
        name: String,
    ) {
        setPaymentIntent(intent)
        val billingAddress = loadSavedBillingAddress()
        if (::loadingHandler.isInitialized) {
            loadingHandler.showLoading("Waiting for payment completion...")
        }
        presentPaymentSheet(email, name, billingAddress)
    }

    private suspend fun ensureBillingAddressOrPrompt(onReady: () -> Unit): Boolean {
        val billingAddress = billingRepository.getBillingAddress()
            .getOrElse { error ->
                _errorState.value = ErrorMessage(error.userMessage("Unable to load billing address."))
                return false
            }
            .billingAddress
            ?.normalized()

        if (billingAddress != null && billingAddress.isCompleteForUsTax()) {
            return true
        }

        pendingBillingAddressAction = onReady
        _billingAddressPrompt.value = billingAddress ?: BillingAddressDraft()
        return false
    }

    private suspend fun fetchRequiredTeamSignatureSteps(teamId: String): Result<List<SignStep>> =
        billingRepository.getRequiredTeamSignLinks(teamId)

    private fun SignStep.matchesPendingTeamSignatureStep(other: SignStep): Boolean {
        if (templateId != other.templateId) {
            return false
        }
        val currentDocumentId = resolvedDocumentId()
        val otherDocumentId = other.resolvedDocumentId()
        return currentDocumentId == null || otherDocumentId == null || currentDocumentId == otherDocumentId
    }

    private suspend fun awaitTeamSignatureStepClearance(
        step: SignStep,
        operationId: String? = step.operationId,
    ): Boolean {
        val teamId = pendingTeamSignatureTeamId?.trim().orEmpty()
        if (teamId.isBlank()) {
            _errorState.value = ErrorMessage("This document is missing a team id.")
            clearPendingTeamSignatureFlow()
            return false
        }

        val normalizedOperationId = operationId?.trim()?.takeIf(String::isNotBlank)
        if (normalizedOperationId != null) {
            _errorState.value = ErrorMessage("Waiting for signature sync...")
            billingRepository.pollBoldSignOperation(normalizedOperationId).getOrElse { error ->
                Napier.e("Failed to poll team BoldSign operation.", error)
                _errorState.value = ErrorMessage(error.userMessage("Failed to confirm signature status."))
                clearPendingTeamSignatureFlow()
                return false
            }
        }

        val intervalMillis = 2_000L
        val timeoutMillis = 60_000L
        var elapsedMillis = 0L

        while (elapsedMillis <= timeoutMillis) {
            _errorState.value = ErrorMessage("Waiting for signature sync...")
            val refreshedSteps = fetchRequiredTeamSignatureSteps(teamId).getOrElse { error ->
                _errorState.value = ErrorMessage(error.userMessage("Failed to confirm signature status."))
                clearPendingTeamSignatureFlow()
                return false
            }

            if (refreshedSteps.none { refreshedStep -> refreshedStep.matchesPendingTeamSignatureStep(step) }) {
                pendingTeamSignatureSteps = refreshedSteps
                pendingTeamSignatureStepIndex = 0
                return true
            }

            if (elapsedMillis >= timeoutMillis) {
                break
            }

            delay(intervalMillis)
            elapsedMillis += intervalMillis
        }

        clearPendingTeamSignatureFlow()
        _errorState.value = ErrorMessage("Document synchronization is delayed. Please try again shortly.")
        return false
    }

    private suspend fun startTeamSigning(teamId: String, onReady: suspend () -> Unit) {
        pendingTeamSignatureTeamId = teamId.trim().takeIf(String::isNotBlank)
        pendingPostSignatureAction = onReady
        fetchRequiredTeamSignatureSteps(teamId)
            .onFailure { error ->
                _errorState.value = ErrorMessage(
                    "Unable to load required documents: ${error.userMessage("Unknown error")}",
                )
            }.onSuccess { steps ->
                if (steps.isEmpty()) {
                    val action = pendingPostSignatureAction
                    clearPendingTeamSignatureFlow()
                    action?.invoke()
                    return@onSuccess
                }
                pendingTeamSignatureSteps = steps
                pendingTeamSignatureStepIndex = 0
                processNextTeamSignatureStep()
            }
    }

    private suspend fun processNextTeamSignatureStep() {
        pendingTeamSignaturePollJob?.cancel()
        pendingTeamSignaturePollJob = null

        pendingTeamSignatureTeamId ?: return
        val currentStep = pendingTeamSignatureSteps.getOrNull(pendingTeamSignatureStepIndex)
        if (currentStep == null) {
            val action = pendingPostSignatureAction
            clearPendingTeamSignatureFlow()
            action?.invoke()
            return
        }

        if (currentStep.isTextStep()) {
            _textSignaturePrompt.value = TextSignaturePromptState(
                step = currentStep,
                currentStep = pendingTeamSignatureStepIndex + 1,
                totalSteps = pendingTeamSignatureSteps.size,
            )
            return
        }

        val signingUrl = currentStep.resolvedSigningUrl()
        if (signingUrl.isNullOrBlank()) {
            clearPendingTeamSignatureFlow()
            _errorState.value = ErrorMessage("A required document is missing a signing URL.")
            return
        }

        _webSignaturePrompt.value = WebSignaturePromptState(
            step = currentStep,
            url = signingUrl,
            currentStep = pendingTeamSignatureStepIndex + 1,
            totalSteps = pendingTeamSignatureSteps.size,
        )

        _errorState.value = ErrorMessage("Waiting for signature sync...")
        pendingTeamSignaturePollJob = scope.launch {
            if (awaitTeamSignatureStepClearance(currentStep)) {
                _webSignaturePrompt.value = null
                processNextTeamSignatureStep()
            }
        }
    }

    private fun clearPendingTeamSignatureFlow() {
        pendingTeamSignaturePollJob?.cancel()
        pendingTeamSignaturePollJob = null
        pendingTeamSignatureSteps = emptyList()
        pendingTeamSignatureStepIndex = 0
        pendingTeamSignatureTeamId = null
        pendingPostSignatureAction = null
        _textSignaturePrompt.value = null
        _webSignaturePrompt.value = null
    }

    private suspend fun loadSavedBillingAddress(): BillingAddressDraft? {
        return billingRepository.getBillingAddress()
            .getOrNull()
            ?.billingAddress
            ?.normalized()
    }

    private suspend fun resolveOrganizationFieldIds(organization: Organization): List<String> {
        return fieldRepository.listFields()
            .getOrElse { error ->
                Napier.w("Failed to load fields for organization rentals: ${error.message}")
                emptyList()
            }
            .filter { field -> field.organizationId == organization.id }
            .map { field -> field.id }
            .distinct()
    }

    private suspend fun loadRentalFieldOptions(fieldIds: List<String>) {
        _rentalFieldOptions.value = emptyList()
        rentalAvailabilityLoader.loadFieldOptions(fieldIds)
            .onSuccess { options ->
                _rentalFieldOptions.value = options
            }
            .onFailure { error ->
                _errorState.value = ErrorMessage("Failed to load rental field options: ${error.userMessage()}")
            }
    }

    private suspend fun loadRentalBusyBlocks(organizationId: String, fieldIds: List<String>) {
        rentalAvailabilityLoader.loadBusyBlocks(organizationId = organizationId, fieldIds = fieldIds)
            .onSuccess { busyBlocks ->
                _rentalBusyBlocks.value = busyBlocks
            }
            .onFailure { error ->
                _rentalBusyBlocks.value = emptyList()
                _errorState.value = ErrorMessage("Failed to load existing field events: ${error.userMessage()}")
            }
    }
}
