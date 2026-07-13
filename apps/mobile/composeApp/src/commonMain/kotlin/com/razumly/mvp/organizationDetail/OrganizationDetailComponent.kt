package com.razumly.mvp.organizationDetail

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import com.razumly.mvp.core.data.dataTypes.Product
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.isPaymentPending
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.data.repositories.PurchaseIntentTimeSlotContext
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.RentalOrderItem
import com.razumly.mvp.core.data.repositories.RentalOrderPayerMismatchException
import com.razumly.mvp.core.data.repositories.RentalOrderSelectionRequest
import com.razumly.mvp.core.data.repositories.RentalOrderTerminalFailureException
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
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.core.util.trustedBoldSignSigningUrlOrNull
import com.razumly.mvp.eventDetail.TextSignaturePromptState
import com.razumly.mvp.eventDetail.WebSignaturePromptState
import com.razumly.mvp.eventDetail.DiscountCodePromptState
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventSearch.RentalAvailabilityLoader
import com.razumly.mvp.eventSearch.RentalAvailabilityWindow
import com.razumly.mvp.eventSearch.RentalBusyBlock
import com.razumly.mvp.eventSearch.RentalFieldOption
import com.razumly.mvp.eventSearch.rentalAvailabilityFetchWindowForDate
import io.github.aakira.napier.Napier
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
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
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.time.Clock
import kotlin.time.Instant

private fun Product.isSinglePurchase(): Boolean =
    period.trim().equals("SINGLE", ignoreCase = true)

private const val ORGANIZATION_CATALOG_PAGE_SIZE = 50

private fun <T> mergeOrganizationCatalogItems(
    existing: List<T>,
    incoming: List<T>,
    id: (T) -> String,
): List<T> {
    val merged = existing.toMutableList()
    val indexById = buildMap {
        existing.forEachIndexed { index, item ->
            id(item).trim().takeIf(String::isNotBlank)?.let { stableId ->
                put(stableId, index)
            }
        }
    }.toMutableMap()

    incoming.forEach { item ->
        val stableId = id(item).trim()
        if (stableId.isBlank()) {
            merged += item
            return@forEach
        }
        val existingIndex = indexById[stableId]
        if (existingIndex == null) {
            indexById[stableId] = merged.size
            merged += item
        } else {
            merged[existingIndex] = item
        }
    }
    return merged
}

internal suspend fun resolveTeamPaymentCompletionMessage(
    teamRepository: ITeamRepository,
    pendingTeam: TeamWithPlayers,
    currentUserId: String,
): String {
    val refreshedTeam = teamRepository.getTeamWithPlayers(pendingTeam.team.id).getOrNull()
    val paymentPending = refreshedTeam
        ?.team
        ?.playerRegistrations
        ?.any { registration ->
            registration.userId == currentUserId && registration.isPaymentPending()
        } == true

    return when {
        paymentPending ->
            "Payment submitted for ${pendingTeam.team.name}. Registration is pending until the bank payment clears."
        refreshedTeam == null ->
            "Payment submitted for ${pendingTeam.team.name}. We are confirming the registration status."
        else -> "Registration completed for ${pendingTeam.team.name}."
    }
}

data class RentalReservationComplete(
    val bookingId: String,
    val billId: String? = null,
    val totalCents: Int,
)

enum class OrganizationReviewSaveStatus {
    IDLE,
    SAVING,
    SUCCEEDED,
    FAILED,
}

private data class PendingRentalReservation(
    val publicSlug: String,
    val context: RentalCreateContext,
    val selections: List<RentalOrderSelectionRequest>,
    val payerUserId: String,
    val paymentIntentId: String?,
    val pendingOrderId: String? = null,
)

internal fun resolveOrganizationDetailTabs(
    initialTab: OrganizationDetailTab,
    eventsLoaded: Boolean,
    hasEvents: Boolean,
    teamsLoaded: Boolean,
    hasTeams: Boolean,
    rentalsLoaded: Boolean,
    hasRentals: Boolean,
    productsLoaded: Boolean,
    hasProducts: Boolean,
): List<OrganizationDetailTab> = OrganizationDetailTab.entries.filter { tab ->
    when (tab) {
        OrganizationDetailTab.OVERVIEW,
        OrganizationDetailTab.REVIEWS -> true

        OrganizationDetailTab.EVENTS -> if (eventsLoaded) hasEvents else tab == initialTab
        OrganizationDetailTab.TEAMS -> if (teamsLoaded) hasTeams else tab == initialTab
        OrganizationDetailTab.RENTALS -> if (rentalsLoaded) hasRentals else tab == initialTab
        OrganizationDetailTab.STORE -> if (productsLoaded) hasProducts else tab == initialTab
    }
}

interface OrganizationDetailComponent : IPaymentProcessor {
    val initialTab: OrganizationDetailTab
    val selectedTab: StateFlow<OrganizationDetailTab>
    val visibleTabs: StateFlow<List<OrganizationDetailTab>>
    val organization: StateFlow<Organization?>
    val events: StateFlow<List<Event>>
    val teams: StateFlow<List<TeamWithPlayers>>
    val products: StateFlow<List<Product>>
    val reviews: StateFlow<OrganizationReviewsPayload?>
    val startingProductCheckoutId: StateFlow<String?>
    val rentalFieldOptions: StateFlow<List<RentalFieldOption>>
    val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>>
    val loadedRentalAvailabilityWindow: StateFlow<RentalAvailabilityWindow?>
    val isLoadingOrganization: StateFlow<Boolean>
    val isLoadingEvents: StateFlow<Boolean>
    val isLoadingTeams: StateFlow<Boolean>
    val canLoadMoreEvents: StateFlow<Boolean>
    val canLoadMoreTeams: StateFlow<Boolean>
    val isLoadingMoreEvents: StateFlow<Boolean>
    val isLoadingMoreTeams: StateFlow<Boolean>
    val isLoadingProducts: StateFlow<Boolean>
    val isLoadingReviews: StateFlow<Boolean>
    val isMutatingReview: StateFlow<Boolean>
    val reviewSaveStatus: StateFlow<OrganizationReviewSaveStatus>
    val isLoadingRentals: StateFlow<Boolean>
    val errorState: StateFlow<ErrorMessage?>
    val message: StateFlow<String?>
    val billingAddressPrompt: StateFlow<BillingAddressDraft?>
    val currentUser: StateFlow<UserData>
    val startingTeamRegistrationId: StateFlow<String?>
    val teamMemberCompliance: StateFlow<Map<String, EventTeamComplianceSummary>>
    val loadingTeamMemberComplianceId: StateFlow<String?>
    val textSignaturePrompt: StateFlow<TextSignaturePromptState?>
    val webSignaturePrompt: StateFlow<WebSignaturePromptState?>
    val discountCodePrompt: StateFlow<DiscountCodePromptState?>
    val isReservingRental: StateFlow<Boolean>
    val completedRentalReservation: StateFlow<RentalReservationComplete?>

    fun setLoadingHandler(handler: LoadingHandler)
    fun refreshOrganization(force: Boolean = false)
    fun refreshEvents(force: Boolean = false)
    fun refreshTeams(force: Boolean = false)
    fun loadMoreEvents()
    fun loadMoreTeams()
    fun refreshProducts(force: Boolean = false)
    fun refreshReviews(force: Boolean = false)
    fun saveReview(rating: Int, body: String?)
    fun deleteReview(reviewId: String)
    fun reportReview(reviewId: String)
    fun signInToReview()
    fun refreshRentals(rangeStart: Instant, rangeEnd: Instant, force: Boolean = false)
    fun startProductPurchase(product: Product)
    fun startTeamRegistration(team: TeamWithPlayers)
    fun leaveTeam(team: TeamWithPlayers)
    fun loadTeamMemberCompliance(teamId: String)
    fun submitBillingAddress(address: BillingAddressDraft)
    fun dismissBillingAddressPrompt()
    fun confirmTextSignature()
    fun dismissTextSignature()
    fun dismissWebSignaturePrompt()
    fun continueFromDiscountCodePrompt(code: String?)
    fun dismissDiscountCodePrompt()
    fun startRentalReservation(context: RentalCreateContext, selections: List<RentalOrderSelectionRequest>)
    fun createEventFromCompletedRentalReservation()
    fun dismissCompletedRentalReservation()
    fun viewEvent(event: Event)
    fun selectTab(tab: OrganizationDetailTab)
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
    private val _selectedTab = MutableStateFlow(initialTab)
    override val selectedTab: StateFlow<OrganizationDetailTab> = _selectedTab.asStateFlow()
    private val _visibleTabs = MutableStateFlow(
        resolveOrganizationDetailTabs(
            initialTab = initialTab,
            eventsLoaded = false,
            hasEvents = false,
            teamsLoaded = false,
            hasTeams = false,
            rentalsLoaded = false,
            hasRentals = false,
            productsLoaded = false,
            hasProducts = false,
        ),
    )
    override val visibleTabs: StateFlow<List<OrganizationDetailTab>> = _visibleTabs.asStateFlow()

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val rentalAvailabilityLoader = RentalAvailabilityLoader(fieldRepository)

    private val _organization = MutableStateFlow<Organization?>(null)
    override val organization: StateFlow<Organization?> = _organization.asStateFlow()

    private val _events = MutableStateFlow<List<Event>>(emptyList())
    override val events: StateFlow<List<Event>> = _events.asStateFlow()

    private val _teams = MutableStateFlow<List<TeamWithPlayers>>(emptyList())
    override val teams: StateFlow<List<TeamWithPlayers>> = _teams.asStateFlow()

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    override val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _reviews = MutableStateFlow<OrganizationReviewsPayload?>(null)
    override val reviews: StateFlow<OrganizationReviewsPayload?> = _reviews.asStateFlow()

    private val _startingProductCheckoutId = MutableStateFlow<String?>(null)
    override val startingProductCheckoutId: StateFlow<String?> = _startingProductCheckoutId.asStateFlow()

    private val _rentalFieldOptions = MutableStateFlow<List<RentalFieldOption>>(emptyList())
    override val rentalFieldOptions: StateFlow<List<RentalFieldOption>> = _rentalFieldOptions.asStateFlow()

    private val _rentalBusyBlocks = MutableStateFlow<List<RentalBusyBlock>>(emptyList())
    override val rentalBusyBlocks: StateFlow<List<RentalBusyBlock>> = _rentalBusyBlocks.asStateFlow()

    private val _loadedRentalAvailabilityWindow = MutableStateFlow<RentalAvailabilityWindow?>(null)
    override val loadedRentalAvailabilityWindow: StateFlow<RentalAvailabilityWindow?> =
        _loadedRentalAvailabilityWindow.asStateFlow()

    private val _isLoadingOrganization = MutableStateFlow(false)
    override val isLoadingOrganization: StateFlow<Boolean> = _isLoadingOrganization.asStateFlow()

    private val _isLoadingEvents = MutableStateFlow(false)
    override val isLoadingEvents: StateFlow<Boolean> = _isLoadingEvents.asStateFlow()

    private val _isLoadingTeams = MutableStateFlow(false)
    override val isLoadingTeams: StateFlow<Boolean> = _isLoadingTeams.asStateFlow()

    private val _canLoadMoreEvents = MutableStateFlow(false)
    override val canLoadMoreEvents: StateFlow<Boolean> = _canLoadMoreEvents.asStateFlow()
    private val _canLoadMoreTeams = MutableStateFlow(false)
    override val canLoadMoreTeams: StateFlow<Boolean> = _canLoadMoreTeams.asStateFlow()
    private val _isLoadingMoreEvents = MutableStateFlow(false)
    override val isLoadingMoreEvents: StateFlow<Boolean> = _isLoadingMoreEvents.asStateFlow()
    private val _isLoadingMoreTeams = MutableStateFlow(false)
    override val isLoadingMoreTeams: StateFlow<Boolean> = _isLoadingMoreTeams.asStateFlow()

    private val _isLoadingProducts = MutableStateFlow(false)
    override val isLoadingProducts: StateFlow<Boolean> = _isLoadingProducts.asStateFlow()

    private val _isLoadingReviews = MutableStateFlow(false)
    override val isLoadingReviews: StateFlow<Boolean> = _isLoadingReviews.asStateFlow()

    private val _isMutatingReview = MutableStateFlow(false)
    override val isMutatingReview: StateFlow<Boolean> = _isMutatingReview.asStateFlow()

    private val _reviewSaveStatus = MutableStateFlow(OrganizationReviewSaveStatus.IDLE)
    override val reviewSaveStatus: StateFlow<OrganizationReviewSaveStatus> = _reviewSaveStatus.asStateFlow()

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
    private val _discountCodePrompt = MutableStateFlow<DiscountCodePromptState?>(null)
    override val discountCodePrompt: StateFlow<DiscountCodePromptState?> = _discountCodePrompt.asStateFlow()
    private val _isReservingRental = MutableStateFlow(false)
    override val isReservingRental: StateFlow<Boolean> = _isReservingRental.asStateFlow()
    private val _completedRentalReservation = MutableStateFlow<RentalReservationComplete?>(null)
    override val completedRentalReservation: StateFlow<RentalReservationComplete?> =
        _completedRentalReservation.asStateFlow()
    override val currentUser: StateFlow<UserData> = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())
    private val _startingTeamRegistrationId = MutableStateFlow<String?>(null)
    override val startingTeamRegistrationId: StateFlow<String?> = _startingTeamRegistrationId.asStateFlow()
    private val _teamMemberCompliance = MutableStateFlow<Map<String, EventTeamComplianceSummary>>(emptyMap())
    override val teamMemberCompliance: StateFlow<Map<String, EventTeamComplianceSummary>> = _teamMemberCompliance.asStateFlow()
    private val _loadingTeamMemberComplianceId = MutableStateFlow<String?>(null)
    override val loadingTeamMemberComplianceId: StateFlow<String?> = _loadingTeamMemberComplianceId.asStateFlow()

    private var organizationLoaded = false
    private var eventsLoaded = false
    private var teamsLoaded = false
    private var nextEventsOffset = 0
    private var nextTeamsOffset = 0
    private var eventsCatalogGeneration = 0L
    private var teamsCatalogGeneration = 0L
    private var productsLoaded = false
    private var reviewsLoaded = false
    private var rentalsLoaded = false
    private var rentalAvailabilityGeneration = 0L
    private var rentalAvailabilityJob: Job? = null
    private var activeRentalAvailabilityWindow: RentalAvailabilityWindow? = null
    private var pendingProductPurchase: Product? = null
    private var pendingTeamRegistration: TeamWithPlayers? = null
    private var pendingBillingAddressAction: (() -> Unit)? = null
    private var pendingDiscountCodeAction: ((String?) -> Unit)? = null
    private var pendingTeamSignatureSteps: List<SignStep> = emptyList()
    private var pendingTeamSignatureStepIndex = 0
    private var pendingTeamSignatureTeamId: String? = null
    private var pendingTeamSignaturePollJob: Job? = null
    private var pendingPostSignatureAction: (suspend () -> Unit)? = null
    private var pendingRentalReservation: PendingRentalReservation? = null
    private val checkoutSessionCoordinator = OrganizationCheckoutSessionCoordinator()
    private var pendingProductCheckoutOperationId: String? = null
    private var pendingTeamCheckoutOperationId: String? = null
    private var pendingRentalCheckoutOperationId: String? = null

    private lateinit var loadingHandler: LoadingHandler

    private val sectionBackCallback = BackCallback(
        isEnabled = initialTab != OrganizationDetailTab.OVERVIEW,
        priority = BackCallback.PRIORITY_MAX,
    ) {
        selectTab(OrganizationDetailTab.OVERVIEW)
    }

    init {
        backHandler.register(sectionBackCallback)
        refreshOrganization()

        scope.launch {
            billingRepository.syncPendingRentalOrders()
                .onFailure { error ->
                    Napier.w("Unable to retry pending paid rental reservations: ${error.message}")
                }
        }

        scope.launch {
            paymentResult.collect { result ->
                if (result == null) return@collect
                val checkout = checkoutSessionCoordinator.claimResult()
                if (checkout == null) {
                    Napier.w("Ignoring organization payment result without an active presented checkout.")
                    clearPaymentResult()
                    return@collect
                }
                if (!matchesOrganizationCheckout(checkout)) {
                    Napier.w("Ignoring organization payment result for unmatched checkout ${checkout.operationId}.")
                    checkoutSessionCoordinator.releaseClaim(checkout)
                    clearPaymentResult()
                    return@collect
                }
                when (result) {
                    PaymentResult.Canceled -> {
                        discardPendingRentalReservation(pendingRentalReservation)
                        _errorState.value = ErrorMessage("Payment canceled.")
                    }

                    is PaymentResult.Failed -> {
                        discardPendingRentalReservation(pendingRentalReservation)
                        _errorState.value = ErrorMessage(result.error)
                    }

                    PaymentResult.Completed -> {
                        val pendingRental = pendingRentalReservation
                        val pendingProduct = pendingProductPurchase
                        val pendingTeam = pendingTeamRegistration
                        when (checkout.owner) {
                        OrganizationCheckoutOwner.RENTAL -> if (pendingRental != null) {
                            completePendingRentalReservation(pendingRental)
                        }
                        OrganizationCheckoutOwner.PRODUCT -> if (pendingProduct != null) {
                            _message.value = if (pendingProduct.isSinglePurchase()) {
                                "Purchase completed for ${pendingProduct.name}."
                            } else {
                                "Subscription started for ${pendingProduct.name}."
                            }
                            refreshProducts(force = true)
                        }
                        OrganizationCheckoutOwner.TEAM -> if (pendingTeam != null) {
                            val generation = ++teamsCatalogGeneration
                            _isLoadingTeams.value = true
                            _isLoadingMoreTeams.value = false
                            val refreshedPage = runCatching {
                                teamRepository.getOrganizationTeamsPage(
                                    organizationId = organizationId,
                                    limit = ORGANIZATION_CATALOG_PAGE_SIZE,
                                    offset = 0,
                                ).getOrThrow()
                            }.getOrNull()
                            if (generation == teamsCatalogGeneration && refreshedPage != null) {
                                _teams.value = mergeOrganizationCatalogItems(
                                    existing = emptyList(),
                                    incoming = refreshedPage.teams,
                                    id = { team -> team.team.id },
                                )
                                nextTeamsOffset = refreshedPage.nextOffset.coerceAtLeast(0)
                                _canLoadMoreTeams.value = refreshedPage.hasMore
                                teamsLoaded = true
                                updateVisibleTabs()
                            }
                            if (generation == teamsCatalogGeneration) {
                                _isLoadingTeams.value = false
                            }
                            _message.value = resolveTeamPaymentCompletionMessage(
                                teamRepository = teamRepository,
                                pendingTeam = pendingTeam,
                                currentUserId = currentUser.value.id,
                            )
                        }
                        }
                    }
                }
                finishOrganizationCheckout(checkout)
                clearPaymentResult()
                if (::loadingHandler.isInitialized) {
                    loadingHandler.hideLoading()
                }
            }
        }
    }

    private fun matchesOrganizationCheckout(checkout: OrganizationCheckoutSession): Boolean = when (checkout.owner) {
        OrganizationCheckoutOwner.PRODUCT ->
            pendingProductPurchase != null && pendingProductCheckoutOperationId == checkout.operationId
        OrganizationCheckoutOwner.TEAM ->
            pendingTeamRegistration != null && pendingTeamCheckoutOperationId == checkout.operationId
        OrganizationCheckoutOwner.RENTAL ->
            pendingRentalReservation != null && pendingRentalCheckoutOperationId == checkout.operationId
    }

    private fun beginOrganizationCheckout(owner: OrganizationCheckoutOwner): OrganizationCheckoutSession? {
        if (checkoutSessionCoordinator.activeSession != null) {
            _errorState.value = ErrorMessage("Another checkout is already in progress.")
            return null
        }

        return checkoutSessionCoordinator.start(owner)
            ?: run {
                _errorState.value = ErrorMessage("Another checkout is already in progress.")
                null
            }
    }

    private fun finishOrganizationCheckout(checkout: OrganizationCheckoutSession): Boolean {
        if (!checkoutSessionCoordinator.finish(checkout)) return false
        when (checkout.owner) {
            OrganizationCheckoutOwner.PRODUCT -> {
                _startingProductCheckoutId.value = null
                pendingProductPurchase = null
                pendingProductCheckoutOperationId = null
            }
            OrganizationCheckoutOwner.TEAM -> {
                _startingTeamRegistrationId.value = null
                pendingTeamRegistration = null
                pendingTeamCheckoutOperationId = null
            }
            OrganizationCheckoutOwner.RENTAL -> {
                pendingRentalReservation = null
                pendingRentalCheckoutOperationId = null
                _isReservingRental.value = false
            }
        }
        return true
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
                refreshReviews(force = true)
                refreshCurrentRentalWeek(force = true)
            } else {
                eventsLoaded = true
                teamsLoaded = true
                productsLoaded = true
                rentalsLoaded = true
                updateVisibleTabs()
            }
        }
    }

    override fun refreshEvents(force: Boolean) {
        if (_isLoadingEvents.value && !force) return
        if (eventsLoaded && !force) return

        val generation = ++eventsCatalogGeneration
        _isLoadingEvents.value = true
        _isLoadingMoreEvents.value = false
        scope.launch {
            runCatching {
                eventRepository.getOrganizationEventsPage(
                    organizationId = organizationId,
                    limit = ORGANIZATION_CATALOG_PAGE_SIZE,
                    offset = 0,
                ).getOrThrow()
            }.onSuccess { page ->
                if (generation == eventsCatalogGeneration) {
                    _events.value = mergeOrganizationCatalogItems(
                        existing = emptyList(),
                        incoming = page.events,
                        id = Event::id,
                    )
                    nextEventsOffset = page.nextOffset.coerceAtLeast(0)
                    _canLoadMoreEvents.value = page.hasMore
                    eventsLoaded = true
                }
            }.onFailure { error ->
                if (generation == eventsCatalogGeneration) {
                    _errorState.value = ErrorMessage("Failed to load organization events: ${error.userMessage()}")
                    eventsLoaded = true
                }
            }
            if (generation == eventsCatalogGeneration) {
                _isLoadingEvents.value = false
                updateVisibleTabs()
            }
        }
    }

    override fun loadMoreEvents() {
        if (!_canLoadMoreEvents.value || _isLoadingMoreEvents.value || _isLoadingEvents.value) return

        val generation = eventsCatalogGeneration
        val offset = nextEventsOffset
        _isLoadingMoreEvents.value = true
        scope.launch {
            runCatching {
                eventRepository.getOrganizationEventsPage(
                    organizationId = organizationId,
                    limit = ORGANIZATION_CATALOG_PAGE_SIZE,
                    offset = offset,
                ).getOrThrow()
            }.onSuccess { page ->
                if (generation == eventsCatalogGeneration) {
                    _events.value = mergeOrganizationCatalogItems(
                        existing = _events.value,
                        incoming = page.events,
                        id = Event::id,
                    )
                    nextEventsOffset = page.nextOffset.coerceAtLeast(offset)
                    _canLoadMoreEvents.value = page.hasMore
                    eventsLoaded = true
                    updateVisibleTabs()
                }
            }.onFailure {
                if (generation == eventsCatalogGeneration) {
                    _errorState.value = ErrorMessage("Failed to load more events. Try again.")
                }
            }
            if (generation == eventsCatalogGeneration) {
                _isLoadingMoreEvents.value = false
            }
        }
    }

    override fun refreshTeams(force: Boolean) {
        if (_isLoadingTeams.value && !force) return
        if (teamsLoaded && !force) return

        val generation = ++teamsCatalogGeneration
        _isLoadingTeams.value = true
        _isLoadingMoreTeams.value = false
        scope.launch {
            runCatching {
                teamRepository.getOrganizationTeamsPage(
                    organizationId = organizationId,
                    limit = ORGANIZATION_CATALOG_PAGE_SIZE,
                    offset = 0,
                ).getOrThrow()
            }.onSuccess { page ->
                if (generation == teamsCatalogGeneration) {
                    _teams.value = mergeOrganizationCatalogItems(
                        existing = emptyList(),
                        incoming = page.teams,
                        id = { team -> team.team.id },
                    )
                    nextTeamsOffset = page.nextOffset.coerceAtLeast(0)
                    _canLoadMoreTeams.value = page.hasMore
                    teamsLoaded = true
                }
            }.onFailure { error ->
                if (generation == teamsCatalogGeneration) {
                    _errorState.value = ErrorMessage("Failed to load organization teams: ${error.userMessage()}")
                    teamsLoaded = true
                }
            }
            if (generation == teamsCatalogGeneration) {
                _isLoadingTeams.value = false
                updateVisibleTabs()
            }
        }
    }

    override fun loadMoreTeams() {
        if (!_canLoadMoreTeams.value || _isLoadingMoreTeams.value || _isLoadingTeams.value) return

        val generation = teamsCatalogGeneration
        val offset = nextTeamsOffset
        _isLoadingMoreTeams.value = true
        scope.launch {
            runCatching {
                teamRepository.getOrganizationTeamsPage(
                    organizationId = organizationId,
                    limit = ORGANIZATION_CATALOG_PAGE_SIZE,
                    offset = offset,
                ).getOrThrow()
            }.onSuccess { page ->
                if (generation == teamsCatalogGeneration) {
                    _teams.value = mergeOrganizationCatalogItems(
                        existing = _teams.value,
                        incoming = page.teams,
                        id = { team -> team.team.id },
                    )
                    nextTeamsOffset = page.nextOffset.coerceAtLeast(offset)
                    _canLoadMoreTeams.value = page.hasMore
                    teamsLoaded = true
                    updateVisibleTabs()
                }
            }.onFailure {
                if (generation == teamsCatalogGeneration) {
                    _errorState.value = ErrorMessage("Failed to load more teams. Try again.")
                }
            }
            if (generation == teamsCatalogGeneration) {
                _isLoadingMoreTeams.value = false
            }
        }
    }

    override fun loadTeamMemberCompliance(teamId: String) {
        val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank) ?: return
        if (_teamMemberCompliance.value.containsKey(normalizedTeamId)) {
            return
        }
        scope.launch {
            _loadingTeamMemberComplianceId.value = normalizedTeamId
            teamRepository.getTeamMemberCompliance(normalizedTeamId)
                .onSuccess { summary ->
                    _teamMemberCompliance.value = _teamMemberCompliance.value + (summary.teamId to summary)
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to load team member status."))
                }
            if (_loadingTeamMemberComplianceId.value == normalizedTeamId) {
                _loadingTeamMemberComplianceId.value = null
            }
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
            updateVisibleTabs()
        }
    }

    override fun refreshReviews(force: Boolean) {
        scope.launch {
            if (_isLoadingReviews.value) return@launch
            if (reviewsLoaded && !force) return@launch

            _isLoadingReviews.value = true
            billingRepository.getOrganizationReviews(organizationId)
                .onSuccess { payload ->
                    _reviews.value = payload
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to load organization reviews."))
                }
            _isLoadingReviews.value = false
            reviewsLoaded = true
        }
    }

    override fun saveReview(rating: Int, body: String?) {
        if (_isMutatingReview.value) return
        _isMutatingReview.value = true
        _reviewSaveStatus.value = OrganizationReviewSaveStatus.SAVING
        scope.launch {
            billingRepository.saveOrganizationReview(organizationId, rating, body)
                .onSuccess { payload ->
                    _reviews.value = payload
                    reviewsLoaded = true
                    _message.value = "Your review has been published."
                    _reviewSaveStatus.value = OrganizationReviewSaveStatus.SUCCEEDED
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to save your review."))
                    _reviewSaveStatus.value = OrganizationReviewSaveStatus.FAILED
                }
            _isMutatingReview.value = false
        }
    }

    override fun deleteReview(reviewId: String) {
        if (_isMutatingReview.value) return
        scope.launch {
            _isMutatingReview.value = true
            billingRepository.deleteOrganizationReview(organizationId, reviewId)
                .onSuccess { payload ->
                    _reviews.value = payload
                    reviewsLoaded = true
                    _message.value = "Your review has been deleted."
                }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to delete your review."))
                }
            _isMutatingReview.value = false
        }
    }

    override fun reportReview(reviewId: String) {
        scope.launch {
            billingRepository.reportOrganizationReview(reviewId)
                .onSuccess { _message.value = "Review reported to moderators." }
                .onFailure { error ->
                    _errorState.value = ErrorMessage(error.userMessage("Failed to report this review."))
                }
        }
    }

    override fun signInToReview() {
        navigationHandler.navigateToLogin()
    }

    override fun refreshRentals(
        rangeStart: Instant,
        rangeEnd: Instant,
        force: Boolean,
    ) {
        if (rangeEnd <= rangeStart) {
            _errorState.value = ErrorMessage("Rental availability range end must be after its start.")
            return
        }

        val organization = _organization.value ?: return
        val requestedWindow = RentalAvailabilityWindow(start = rangeStart, end = rangeEnd)
        if (_isLoadingRentals.value && activeRentalAvailabilityWindow == requestedWindow) return
        if (!force && rentalsLoaded && _loadedRentalAvailabilityWindow.value == requestedWindow) return

        activeRentalAvailabilityWindow = requestedWindow
        val generation = ++rentalAvailabilityGeneration
        rentalAvailabilityJob?.cancel()
        _loadedRentalAvailabilityWindow.value = null
        _isLoadingRentals.value = true
        rentalAvailabilityJob = scope.launch {
            rentalAvailabilityLoader.loadAvailability(
                organizationId = organization.id,
                rangeStart = requestedWindow.start,
                rangeEnd = requestedWindow.end,
            ).onSuccess { snapshot ->
                if (generation != rentalAvailabilityGeneration) return@onSuccess
                _rentalFieldOptions.value = snapshot.fieldOptions
                _rentalBusyBlocks.value = snapshot.busyBlocks
                _loadedRentalAvailabilityWindow.value = requestedWindow
                rentalsLoaded = true
                updateVisibleTabs()
            }.onFailure { error ->
                if (generation != rentalAvailabilityGeneration) return@onFailure
                _errorState.value = ErrorMessage(
                    "Failed to load rental availability: ${error.userMessage()}",
                )
            }

            if (generation == rentalAvailabilityGeneration) {
                _isLoadingRentals.value = false
                updateVisibleTabs()
            }
        }
    }

    private fun refreshCurrentRentalWeek(force: Boolean) {
        val timeZone = TimeZone.currentSystemDefault()
        val today = Clock.System.now().toLocalDateTime(timeZone).date
        val window = rentalAvailabilityFetchWindowForDate(today, timeZone)
        refreshRentals(
            rangeStart = window.start,
            rangeEnd = window.end,
            force = force,
        )
    }

    private fun updateVisibleTabs() {
        _visibleTabs.value = resolveOrganizationDetailTabs(
            initialTab = initialTab,
            eventsLoaded = eventsLoaded,
            hasEvents = _events.value.isNotEmpty(),
            teamsLoaded = teamsLoaded,
            hasTeams = _teams.value.isNotEmpty(),
            rentalsLoaded = rentalsLoaded,
            hasRentals = _rentalFieldOptions.value.isNotEmpty(),
            productsLoaded = productsLoaded,
            hasProducts = _products.value.isNotEmpty(),
        )
        if (_selectedTab.value !in _visibleTabs.value) {
            selectTab(OrganizationDetailTab.OVERVIEW)
        }
    }

    override fun startProductPurchase(product: Product) {
        scope.launch {
            if (_startingProductCheckoutId.value != null) return@launch

            _startingProductCheckoutId.value = product.id
            var checkout: OrganizationCheckoutSession? = null
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
                val discountCode = requestDiscountCode(
                    description = "Enter a discount code for ${product.name}, or continue without one.",
                )
                checkout = beginOrganizationCheckout(OrganizationCheckoutOwner.PRODUCT) ?: return@launch

                if (::loadingHandler.isInitialized) {
                    loadingHandler.showLoading("Preparing checkout...")
                }
                val purchaseIntentResult = if (product.isSinglePurchase()) {
                    billingRepository.createProductPurchaseIntent(product.id, discountCode)
                } else {
                    billingRepository.createProductSubscriptionIntent(product.id, discountCode)
                }
                purchaseIntentResult
                    .onSuccess { intent ->
                        val activeCheckout = checkout ?: return@onSuccess
                        if (!checkoutSessionCoordinator.isCurrent(activeCheckout)) {
                            Napier.w("Ignoring a product intent for inactive checkout ${activeCheckout.operationId}.")
                            return@onSuccess
                        }
                        runCatching {
                            pendingProductPurchase = product
                            pendingProductCheckoutOperationId = activeCheckout.operationId
                            showPaymentSheet(
                                intent = intent,
                                email = account?.email.orEmpty(),
                                name = user.fullName,
                                checkout = activeCheckout,
                            )
                        }.onFailure { error ->
                            if (finishOrganizationCheckout(activeCheckout)) {
                                _errorState.value = ErrorMessage(error.userMessage("Unable to start payment sheet."))
                                if (::loadingHandler.isInitialized) {
                                    loadingHandler.hideLoading()
                                }
                            }
                        }
                    }
                    .onFailure { error ->
                        checkout?.let { activeCheckout ->
                            if (finishOrganizationCheckout(activeCheckout)) {
                                _errorState.value = ErrorMessage("Unable to start checkout: ${error.userMessage()}")
                                if (::loadingHandler.isInitialized) {
                                    loadingHandler.hideLoading()
                                }
                            }
                        }
                    }
            } catch (error: Throwable) {
                val activeCheckout = checkout
                if (activeCheckout == null || finishOrganizationCheckout(activeCheckout)) {
                    _errorState.value = ErrorMessage("Unable to start checkout: ${error.userMessage()}")
                    if (::loadingHandler.isInitialized) {
                        loadingHandler.hideLoading()
                    }
                }
            } finally {
                if (pendingProductPurchase == null && checkoutSessionCoordinator.activeSession == null) {
                    _startingProductCheckoutId.value = null
                }
            }
        }
    }

    override fun startRentalReservation(
        context: RentalCreateContext,
        selections: List<RentalOrderSelectionRequest>,
    ) {
        scope.launch {
            if (_isReservingRental.value) return@launch
            _completedRentalReservation.value = null
            _isReservingRental.value = true
            try {
                val organization = _organization.value
                if (organization == null) {
                    _errorState.value = ErrorMessage("Organization is not available.")
                    return@launch
                }
                val publicSlug = organization.publicSlug?.trim()?.takeIf(String::isNotBlank)
                if (publicSlug == null || !organization.publicPageEnabled) {
                    _errorState.value = ErrorMessage("This organization needs a public rental checkout before resources can be reserved.")
                    return@launch
                }
                val user = userRepository.currentUser.value.getOrNull()
                val account = userRepository.currentAccount.value.getOrNull()
                if (user == null || user.id.isBlank()) {
                    _errorState.value = ErrorMessage("Please sign in to reserve resources.")
                    return@launch
                }
                if (selections.isEmpty()) {
                    _errorState.value = ErrorMessage("Select at least one rental slot.")
                    return@launch
                }

                val bookingId = context.rentalBookingId?.trim()?.takeIf(String::isNotBlank) ?: newId()
                val rentalContext = context.copy(rentalBookingId = bookingId)
                val orderSelections = selections
                if (orderSelections.isEmpty()) {
                    _errorState.value = ErrorMessage("Selected rental slots are no longer available.")
                    return@launch
                }

                if (rentalContext.rentalPriceCents > 0 && !ensureBillingAddressOrPrompt {
                        startRentalReservation(context, selections)
                    }) {
                    return@launch
                }

                val pendingReservation = PendingRentalReservation(
                    publicSlug = publicSlug,
                    context = rentalContext,
                    selections = orderSelections,
                    payerUserId = user.id,
                    paymentIntentId = null,
                )

                if (rentalContext.rentalPriceCents <= 0) {
                    completePendingRentalReservation(pendingReservation)
                    return@launch
                }

                val checkout = beginOrganizationCheckout(OrganizationCheckoutOwner.RENTAL) ?: return@launch

                if (::loadingHandler.isInitialized) {
                    loadingHandler.showLoading("Preparing rental checkout...")
                }
                billingRepository.createPurchaseIntent(
                    event = buildRentalPaymentEvent(
                        organization = organization,
                        context = rentalContext,
                        userId = user.id,
                    ),
                    timeSlotContext = buildRentalPaymentTimeSlotContext(rentalContext),
                ).onSuccess { intent ->
                    if (!checkoutSessionCoordinator.isCurrent(checkout)) {
                        Napier.w("Ignoring a rental intent for inactive checkout ${checkout.operationId}.")
                        return@onSuccess
                    }
                    runCatching {
                        val paymentIntentId = intent.paymentIntent.toPaymentIntentId()
                            ?.trim()
                            ?.takeIf(String::isNotBlank)
                            ?: error("Rental checkout did not return a payment intent.")
                        billingRepository.prepareRentalOrder(
                            publicSlug = pendingReservation.publicSlug,
                            eventId = rentalContext.rentalBookingId ?: error("Rental booking id is required."),
                            selections = pendingReservation.selections,
                            paymentIntentId = paymentIntentId,
                            payerUserId = pendingReservation.payerUserId,
                        ).getOrThrow().also { pendingOrderId ->
                            pendingRentalReservation = pendingReservation.copy(
                                paymentIntentId = paymentIntentId,
                                pendingOrderId = pendingOrderId,
                            )
                            pendingRentalCheckoutOperationId = checkout.operationId
                        }
                        showPaymentSheet(
                            intent = intent,
                            email = account?.email.orEmpty(),
                            name = user.fullName,
                            checkout = checkout,
                        )
                    }.onFailure { error ->
                        discardPendingRentalReservation(pendingRentalReservation)
                        if (finishOrganizationCheckout(checkout)) {
                            _errorState.value = ErrorMessage(error.userMessage("Unable to start rental payment."))
                        }
                    }
                }.onFailure { error ->
                    if (finishOrganizationCheckout(checkout)) {
                        _errorState.value = ErrorMessage(error.userMessage("Unable to start rental checkout."))
                    }
                }
            } finally {
                if (pendingRentalReservation == null) {
                    _isReservingRental.value = false
                    if (::loadingHandler.isInitialized) {
                        loadingHandler.hideLoading()
                    }
                }
            }
        }
    }

    override fun createEventFromCompletedRentalReservation() {
        _completedRentalReservation.value ?: return
        _completedRentalReservation.value = null
        navigationHandler.navigateToCreate()
    }

    override fun dismissCompletedRentalReservation() {
        _completedRentalReservation.value = null
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
        if (result.requiresParentApproval) {
            _errorState.value = ErrorMessage(
                result.userMessage("A parent or guardian must approve this team request before registration can continue."),
            )
            refreshTeams(force = true)
            return
        }

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
                val discountCode = requestDiscountCode(
                    description = "Enter a discount code for this team registration, or continue without one.",
                )
                val checkout = beginOrganizationCheckout(OrganizationCheckoutOwner.TEAM) ?: return
                billingRepository.createTeamRegistrationPurchaseIntent(
                    team = team.team,
                    teamRegistration = result.registration,
                    discountCode = discountCode,
                ).onSuccess { intent ->
                    if (!checkoutSessionCoordinator.isCurrent(checkout)) {
                        Napier.w("Ignoring a team intent for inactive checkout ${checkout.operationId}.")
                        return@onSuccess
                    }
                    runCatching {
                        pendingTeamRegistration = team
                        pendingTeamCheckoutOperationId = checkout.operationId
                        showPaymentSheet(
                            intent = intent,
                            email = accountEmail,
                            name = payerName,
                            checkout = checkout,
                        )
                    }.onFailure { error ->
                        if (finishOrganizationCheckout(checkout)) {
                            _errorState.value = ErrorMessage(
                                error.userMessage("Unable to start payment sheet."),
                            )
                            if (::loadingHandler.isInitialized) {
                                loadingHandler.hideLoading()
                            }
                        }
                    }
                }.onFailure { error ->
                    if (finishOrganizationCheckout(checkout)) {
                        _errorState.value = ErrorMessage(
                            "Unable to start registration: ${error.userMessage(result.userMessage("Unable to start registration."))}",
                        )
                        if (::loadingHandler.isInitialized) {
                            loadingHandler.hideLoading()
                        }
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

    override fun continueFromDiscountCodePrompt(code: String?) {
        val action = pendingDiscountCodeAction
        pendingDiscountCodeAction = null
        _discountCodePrompt.value = null
        action?.invoke(code?.trim()?.takeIf(String::isNotBlank))
    }

    override fun dismissDiscountCodePrompt() {
        continueFromDiscountCodePrompt(null)
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
        navigationHandler.navigateToEvent(event.id)
    }

    override fun selectTab(tab: OrganizationDetailTab) {
        _selectedTab.value = tab
        sectionBackCallback.isEnabled = tab != OrganizationDetailTab.OVERVIEW
    }

    override fun onBackClicked() {
        if (_selectedTab.value == OrganizationDetailTab.OVERVIEW) {
            navigationHandler.navigateBack()
        } else {
            selectTab(OrganizationDetailTab.OVERVIEW)
        }
    }

    private suspend fun showPaymentSheet(
        intent: PurchaseIntent,
        email: String,
        name: String,
        checkout: OrganizationCheckoutSession,
    ) {
        check(checkoutSessionCoordinator.isCurrent(checkout)) {
            "Checkout is no longer active."
        }
        clearPaymentResult()
        setPaymentIntent(intent)
        val billingAddress = loadSavedBillingAddress()
        if (::loadingHandler.isInitialized) {
            loadingHandler.showLoading("Waiting for payment completion...")
        }
        check(checkoutSessionCoordinator.awaitResult(checkout)) {
            "Checkout is no longer active."
        }
        presentPaymentSheet(email, name, billingAddress)
    }

    private suspend fun completePendingRentalReservation(pending: PendingRentalReservation) {
        if (::loadingHandler.isInitialized) {
            loadingHandler.showLoading("Reserving resources...")
        }
        billingRepository.createRentalOrder(
            publicSlug = pending.publicSlug,
            eventId = pending.context.rentalBookingId?.trim()?.takeIf(String::isNotBlank) ?: newId(),
            selections = pending.selections,
            paymentIntentId = pending.paymentIntentId,
            payerUserId = pending.payerUserId,
        ).onSuccess { result ->
            _completedRentalReservation.value = RentalReservationComplete(
                bookingId = result.bookingId,
                billId = result.billId,
                totalCents = result.totalCents,
            )
            _message.value = "Resources reserved."
            activeRentalAvailabilityWindow?.let { window ->
                refreshRentals(
                    rangeStart = window.start,
                    rangeEnd = window.end,
                    force = true,
                )
            }
        }.onFailure { error ->
            _errorState.value = ErrorMessage(
                if (error is RentalOrderTerminalFailureException) {
                    "Payment was recorded, but this reservation needs staff assistance. " +
                        "Do not submit another payment. " + error.userMessage()
                } else if (error is RentalOrderPayerMismatchException) {
                    "Payment is linked to the original renter account. Sign back in as that renter to finish the reservation."
                } else {
                    "Payment was recorded, but the reservation is still being finalized. " +
                        "It will retry automatically; do not submit another payment. " +
                        error.userMessage("Unable to reserve resources right now.")
                },
            )
        }
        pendingRentalReservation = null
        _isReservingRental.value = false
        if (::loadingHandler.isInitialized) {
            loadingHandler.hideLoading()
        }
    }

    private suspend fun discardPendingRentalReservation(pending: PendingRentalReservation?) {
        val pendingOrderId = pending?.pendingOrderId?.trim()?.takeIf(String::isNotBlank) ?: return
        billingRepository.discardPreparedRentalOrder(pendingOrderId)
            .onFailure { error ->
                Napier.w("Unable to discard canceled rental checkout $pendingOrderId: ${error.message}")
            }
    }

    private fun buildRentalPaymentEvent(
        organization: Organization,
        context: RentalCreateContext,
        userId: String,
    ): Event {
        val start = Instant.fromEpochMilliseconds(context.startEpochMillis)
        val end = Instant.fromEpochMilliseconds(context.endEpochMillis)
        return Event(
            id = context.rentalBookingId?.trim()?.takeIf(String::isNotBlank) ?: newId(),
            name = "${organization.name} rental",
            description = "Private rental order for ${organization.name}.",
            hostId = userId,
            organizationId = organization.id,
            fieldIds = context.selectedFieldIds,
            timeSlotIds = listOf("${context.rentalBookingId.orEmpty()}-rental-payment")
                .filter(String::isNotBlank),
            start = start,
            end = end,
            location = context.organizationLocation ?: organization.location ?: "Rental",
            address = context.organizationAddress ?: organization.address,
            coordinates = context.organizationCoordinates ?: organization.coordinates ?: listOf(0.0, 0.0),
            priceCents = 0,
            eventType = EventType.EVENT,
            state = "PRIVATE",
            noFixedEndDateTime = false,
        )
    }

    private fun buildRentalPaymentTimeSlotContext(
        context: RentalCreateContext,
    ): PurchaseIntentTimeSlotContext {
        val bookingId = context.rentalBookingId?.trim()?.takeIf(String::isNotBlank) ?: newId()
        return PurchaseIntentTimeSlotContext(
            id = "$bookingId-rental-payment",
            priceCents = context.rentalPriceCents.coerceAtLeast(0),
            startDate = Instant.fromEpochMilliseconds(context.startEpochMillis).toString(),
            endDate = Instant.fromEpochMilliseconds(context.endEpochMillis).toString(),
            scheduledFieldId = context.selectedFieldIds.firstOrNull(),
            scheduledFieldIds = context.selectedFieldIds,
            hostRequiredTemplateIds = context.hostRequiredTemplateIds,
        )
    }

    private fun RentalCreateContext.withRentalOrderResult(
        bookingId: String,
        items: List<RentalOrderItem>,
    ): RentalCreateContext {
        return copy(
            rentalBookingId = bookingId,
            lockedSelections = lockedSelections.map { selection ->
                val item = items.firstOrNull { candidate -> candidate.matchesLockedSelection(selection) }
                selection.copy(rentalBookingItemId = item?.id)
            },
        )
    }

    private fun RentalOrderItem.matchesLockedSelection(selection: com.razumly.mvp.core.presentation.LockedRentalSelection): Boolean {
        if (fieldId.trim() != selection.fieldId.trim()) {
            return false
        }
        val itemStart = runCatching { Instant.parse(start).toEpochMilliseconds() }.getOrNull()
        val itemEnd = runCatching { Instant.parse(end).toEpochMilliseconds() }.getOrNull()
        return itemStart == selection.startEpochMillis && itemEnd == selection.endEpochMillis
    }

    private fun String?.toPaymentIntentId(): String? {
        val normalized = this?.trim()?.takeIf(String::isNotBlank) ?: return null
        val secretIndex = normalized.indexOf("_secret_")
        return if (secretIndex > 0) {
            normalized.take(secretIndex)
        } else {
            normalized
        }.takeIf { value -> value.startsWith("pi_") }
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

    private suspend fun requestDiscountCode(
        description: String = "Enter a discount code for this checkout, or continue without one.",
    ): String? = suspendCancellableCoroutine { continuation ->
        pendingDiscountCodeAction = { code ->
            if (continuation.isActive) {
                continuation.resume(code?.trim()?.takeIf(String::isNotBlank))
            }
        }
        _discountCodePrompt.value = DiscountCodePromptState(description = description)
        continuation.invokeOnCancellation {
            pendingDiscountCodeAction = null
            _discountCodePrompt.value = null
        }
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

        val signingUrl = trustedBoldSignSigningUrlOrNull(currentStep.resolvedSigningUrl())
        if (signingUrl == null) {
            clearPendingTeamSignatureFlow()
            _errorState.value = ErrorMessage("A required document has an unavailable or invalid signing URL.")
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

}
