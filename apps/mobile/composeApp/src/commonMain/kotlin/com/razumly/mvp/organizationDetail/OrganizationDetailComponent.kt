package com.razumly.mvp.organizationDetail

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
                    _errorState.value = ErrorMessage("Failed to load organization: ${error.message}")
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
                    _errorState.value = ErrorMessage("Failed to load organization events: ${error.message}")
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
                    _errorState.value = ErrorMessage("Failed to load organization teams: ${error.message}")
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
                    _errorState.value = ErrorMessage("Failed to load organization products: ${error.message}")
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
                    _errorState.value = ErrorMessage("Unable to start checkout: ${error.message}")
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
            _errorState.value = ErrorMessage("Failed to start subscription: ${error.message}")
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
        val fields = fieldRepository.getFields(fieldIds)
            .getOrElse { error ->
                _errorState.value = ErrorMessage("Failed to load organization fields: ${error.message}")
                return
            }

        val sortedFields = fields.sortedBy { field -> field.name?.lowercase() ?: "" }
        val slotIds = sortedFields
            .flatMap { field -> field.rentalSlotIds }
            .distinct()
            .filter(String::isNotBlank)

        val timeSlotById = if (slotIds.isEmpty()) {
            emptyMap()
        } else {
            fieldRepository.getTimeSlots(slotIds)
                .getOrElse { error ->
                    _errorState.value = ErrorMessage("Failed to load rental time slots: ${error.message}")
                    return
                }
                .associateBy { slot -> slot.id }
        }

        _rentalFieldOptions.value = sortedFields.map { field ->
            val linkedSlots = field.rentalSlotIds.mapNotNull { slotId -> timeSlotById[slotId] }
            val fallbackSlots = if (linkedSlots.isEmpty()) {
                fieldRepository.getTimeSlotsForField(field.id)
                    .onFailure { error ->
                        Napier.w("Fallback rental-slot lookup failed for field ${field.id}: ${error.message}")
                    }
                    .getOrElse { emptyList() }
            } else {
                emptyList()
            }

            val mergedSlots = (linkedSlots + fallbackSlots)
                .distinctBy { slot -> slot.id }
                .sortedBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE }

            RentalFieldOption(field = field, rentalSlots = mergedSlots)
        }
    }

    private suspend fun loadRentalBusyBlocks(organizationId: String, fieldIds: List<String>) {
        val normalizedFieldIds = fieldIds.map { id -> id.trim() }.filter(String::isNotBlank).distinct()
        if (organizationId.isBlank() || normalizedFieldIds.isEmpty()) {
            _rentalBusyBlocks.value = emptyList()
            return
        }
        val selectedFieldSet = normalizedFieldIds.toSet()

        eventRepository.getEventsByOrganization(organizationId, limit = 300)
            .onSuccess { organizationEvents ->
                val busyBlocks = organizationEvents.flatMap { event ->
                    when (event.eventType) {
                        com.razumly.mvp.core.data.dataTypes.enums.EventType.EVENT -> {
                            val eventFieldIds = event.fieldIds
                                .map { id -> id.trim() }
                                .filter(String::isNotBlank)
                                .distinct()
                            if (eventFieldIds.isEmpty()) {
                                emptyList()
                            } else {
                                eventFieldIds
                                    .intersect(selectedFieldSet)
                                    .map { fieldId ->
                                        RentalBusyBlock(
                                            eventId = event.id,
                                            eventName = event.name.ifBlank { "Reserved event" },
                                            fieldId = fieldId,
                                            start = event.start,
                                            end = event.end,
                                        )
                                    }
                            }
                        }

                        com.razumly.mvp.core.data.dataTypes.enums.EventType.LEAGUE,
                        com.razumly.mvp.core.data.dataTypes.enums.EventType.TOURNAMENT -> {
                            val eventFieldIds = event.fieldIds
                                .map { id -> id.trim() }
                                .filter(String::isNotBlank)
                                .distinct()
                            if (eventFieldIds.isNotEmpty() &&
                                eventFieldIds.intersect(selectedFieldSet).isEmpty()
                            ) {
                                emptyList()
                            } else {
                                matchRepository.getMatchesOfTournament(event.id)
                                    .onFailure { error ->
                                        Napier.w("Failed to load matches for event ${event.id}: ${error.message}")
                                    }
                                    .getOrElse { emptyList() }
                                    .mapNotNull { match ->
                                        val fieldId = match.fieldId?.trim()
                                        val matchStart = match.start ?: return@mapNotNull null
                                        val matchEnd = match.end
                                        if (fieldId.isNullOrBlank()) return@mapNotNull null
                                        if (!selectedFieldSet.contains(fieldId)) return@mapNotNull null
                                        if (matchEnd == null || matchEnd <= matchStart) return@mapNotNull null

                                        RentalBusyBlock(
                                            eventId = event.id,
                                            eventName = event.name.ifBlank { "Reserved match" },
                                            fieldId = fieldId,
                                            start = matchStart,
                                            end = matchEnd,
                                        )
                                    }
                            }
                        }
                    }
                }
                    .filter { block -> block.end > block.start }
                    .distinctBy { block -> "${block.eventId}:${block.fieldId}:${block.start.toEpochMilliseconds()}:${block.end.toEpochMilliseconds()}" }

                _rentalBusyBlocks.value = busyBlocks
            }
            .onFailure { error ->
                _rentalBusyBlocks.value = emptyList()
                _errorState.value = ErrorMessage("Failed to load existing field events: ${error.message}")
            }
    }
}
