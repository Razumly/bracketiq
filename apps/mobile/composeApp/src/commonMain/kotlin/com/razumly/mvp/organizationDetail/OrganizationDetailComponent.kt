package com.razumly.mvp.organizationDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.OrganizationDetailTab
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.RentalCreateContext
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventSearch.RentalAvailabilityLoader
import com.razumly.mvp.eventSearch.RentalBusyBlock
import com.razumly.mvp.eventSearch.RentalFieldOption
import io.github.aakira.napier.Napier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

interface OrganizationDetailComponent : IPaymentProcessor {
    val initialTab: OrganizationDetailTab
    val organization: StateFlow<Organization?>
    val events: StateFlow<List<Event>>
    val teams: StateFlow<List<TeamWithPlayers>>
    val products: StateFlow<List<Product>>
    val rentalFieldOptions: StateFlow<List<RentalFieldOption>>
    val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>>
    val isLoadingOrganization: StateFlow<Boolean>
    val isLoadingEvents: StateFlow<Boolean>
    val isLoadingTeams: StateFlow<Boolean>
    val isLoadingProducts: StateFlow<Boolean>
    val isLoadingRentals: StateFlow<Boolean>
    val errorState: StateFlow<ErrorMessage?>
    val message: StateFlow<String?>

    fun setLoadingHandler(handler: LoadingHandler)
    fun refreshOrganization(force: Boolean = false)
    fun refreshEvents(force: Boolean = false)
    fun refreshTeams(force: Boolean = false)
    fun refreshProducts(force: Boolean = false)
    fun refreshRentals(force: Boolean = false)
    fun clearRentalData()
    fun startProductPurchase(product: Product)
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

    private var organizationLoaded = false
    private var eventsLoaded = false
    private var teamsLoaded = false
    private var productsLoaded = false
    private var rentalsLoaded = false
    private var pendingProductPurchase: Product? = null

    private lateinit var loadingHandler: LoadingHandler

    init {
        refreshOrganization()

        scope.launch {
            paymentResult.collect { result ->
                if (result == null) return@collect
                when (result) {
                    PaymentResult.Canceled -> {
                        _errorState.value = ErrorMessage("Payment canceled.")
                        pendingProductPurchase = null
                    }

                    is PaymentResult.Failed -> {
                        _errorState.value = ErrorMessage(result.error)
                        pendingProductPurchase = null
                    }

                    PaymentResult.Completed -> {
                        val pendingProduct = pendingProductPurchase
                        if (pendingProduct != null) {
                            handleSubscriptionAfterPurchase(pendingProduct)
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

            val teamIds = _organization.value?.teamIds.orEmpty()
                .map { id -> id.trim() }
                .filter(String::isNotBlank)
                .distinct()

            _isLoadingTeams.value = true
            if (teamIds.isEmpty()) {
                _teams.value = emptyList()
                _isLoadingTeams.value = false
                teamsLoaded = true
                return@launch
            }

            teamRepository.getTeamsWithPlayers(teamIds)
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
            val user = userRepository.currentUser.value.getOrNull()
            val account = userRepository.currentAccount.value.getOrNull()
            if (user == null || user.id.isBlank()) {
                _errorState.value = ErrorMessage("Please sign in to purchase.")
                return@launch
            }

            if (::loadingHandler.isInitialized) {
                loadingHandler.showLoading("Preparing checkout...")
            }
            billingRepository.createProductPurchaseIntent(product.id)
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
        }
    }

    override fun startRentalCreate(context: RentalCreateContext) {
        navigationHandler.navigateToCreate(context)
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
        if (::loadingHandler.isInitialized) {
            loadingHandler.showLoading("Waiting for payment completion...")
        }
        presentPaymentSheet(email, name)
    }

    private suspend fun handleSubscriptionAfterPurchase(product: Product) {
        if (::loadingHandler.isInitialized) {
            loadingHandler.showLoading("Finalizing subscription...")
        }
        billingRepository.createProductSubscription(
            productId = product.id,
            organizationId = product.organizationId,
            priceCents = product.priceCents,
            startDate = null,
        ).onSuccess {
            _message.value = "Subscription started for ${product.name}."
            refreshProducts(force = true)
        }.onFailure { error ->
            _errorState.value = ErrorMessage("Failed to start subscription: ${error.userMessage()}")
        }
        pendingProductPurchase = null
        if (::loadingHandler.isInitialized) {
            loadingHandler.hideLoading()
        }
    }

    private suspend fun resolveOrganizationFieldIds(organization: Organization): List<String> {
        val directFieldIds = organization.fieldIds
            .map { id -> id.trim() }
            .filter(String::isNotBlank)
            .distinct()
        if (directFieldIds.isNotEmpty()) {
            return directFieldIds
        }

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
