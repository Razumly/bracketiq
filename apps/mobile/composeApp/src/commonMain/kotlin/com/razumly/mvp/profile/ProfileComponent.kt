package com.razumly.mvp.profile

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.DelicateDecomposeApi
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.push
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.Subscription
import com.razumly.mvp.core.data.repositories.FamilyChild
import com.razumly.mvp.core.data.repositories.FamilyJoinRequest
import com.razumly.mvp.core.data.repositories.FamilyJoinRequestAction
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.ProfileDocumentCard
import com.razumly.mvp.core.data.repositories.ProfileDocumentType
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentResult
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import io.github.aakira.napier.Napier
import com.razumly.mvp.profile.profileDetails.ProfileDetailsComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin
import kotlin.time.Clock

data class ProfilePaymentPlan(
    val bill: Bill,
    val ownerLabel: String,
    val payments: List<BillPayment> = emptyList(),
) {
    val paidAmountCents: Int
        get() = bill.paidAmountCents ?: 0

    val remainingAmountCents: Int
        get() = (bill.totalAmountCents - paidAmountCents).coerceAtLeast(0)

    val nextPendingPayment: BillPayment?
        get() = payments
            .sortedBy { it.sequence }
            .firstOrNull { it.status.equals("PENDING", ignoreCase = true) }

    val nextPaymentAmountCents: Int
        get() = bill.nextPaymentAmountCents ?: nextPendingPayment?.amountCents ?: remainingAmountCents

    val nextPaymentDue: String?
        get() = bill.nextPaymentDue ?: nextPendingPayment?.dueDate
}

data class ProfilePaymentPlansState(
    val isLoading: Boolean = false,
    val plans: List<ProfilePaymentPlan> = emptyList(),
    val error: String? = null,
)

data class ProfileMembership(
    val subscription: Subscription,
    val productName: String,
    val organizationName: String,
)

data class ProfileMembershipsState(
    val isLoading: Boolean = false,
    val memberships: List<ProfileMembership> = emptyList(),
    val error: String? = null,
)

data class ProfileChild(
    val userId: String,
    val firstName: String,
    val lastName: String,
    val dateOfBirth: String? = null,
    val age: Int? = null,
    val linkStatus: String? = null,
    val relationship: String? = null,
    val email: String? = null,
    val hasEmail: Boolean = false,
) {
    val fullName: String
        get() = listOf(firstName.trim(), lastName.trim())
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { "Child" }
}

data class ProfileJoinRequest(
    val registrationId: String,
    val eventId: String,
    val eventName: String,
    val childUserId: String,
    val childFullName: String,
    val childEmail: String? = null,
    val childHasEmail: Boolean = false,
    val consentStatus: String? = null,
    val requestedAt: String? = null,
)

data class ProfileChildrenState(
    val isLoading: Boolean = false,
    val children: List<ProfileChild> = emptyList(),
    val error: String? = null,
    val isLoadingJoinRequests: Boolean = false,
    val joinRequests: List<ProfileJoinRequest> = emptyList(),
    val joinRequestsError: String? = null,
    val activeJoinRequestId: String? = null,
    val isCreatingChild: Boolean = false,
    val createError: String? = null,
    val isUpdatingChild: Boolean = false,
    val updateError: String? = null,
    val isLinkingChild: Boolean = false,
    val linkError: String? = null,
)

data class ProfileDocumentsState(
    val isLoading: Boolean = false,
    val unsignedDocuments: List<ProfileDocumentCard> = emptyList(),
    val signedDocuments: List<ProfileDocumentCard> = emptyList(),
    val error: String? = null,
)

data class ProfileTextSignaturePromptState(
    val document: ProfileDocumentCard,
    val step: SignStep,
)

interface ProfileComponent : IPaymentProcessor {
    val childStack: Value<ChildStack<*, Child>>
    val errorState: StateFlow<ErrorMessage?>
    val paymentPlansState: StateFlow<ProfilePaymentPlansState>
    val membershipsState: StateFlow<ProfileMembershipsState>
    val childrenState: StateFlow<ProfileChildrenState>
    val documentsState: StateFlow<ProfileDocumentsState>
    val activeBillPaymentId: StateFlow<String?>
    val activeMembershipActionId: StateFlow<String?>
    val activeDocumentActionId: StateFlow<String?>
    val textSignaturePrompt: StateFlow<ProfileTextSignaturePromptState?>
    val isStripeAccountConnected: StateFlow<Boolean>

    fun onBackClicked()
    fun setLoadingHandler(loadingHandler: LoadingHandler)

    fun navigateToProfileDetails()
    fun navigateToPayments()
    fun navigateToPaymentPlans()
    fun navigateToMemberships()
    fun navigateToChildren()
    fun navigateToDocuments()

    fun onLogout()
    fun manageTeams()
    fun manageEvents()
    fun manageRefunds()
    fun clearCache()
    fun manageStripeAccountOnboarding()
    fun manageStripeAccount()
    fun refreshPaymentPlans()
    fun payNextInstallment(paymentPlan: ProfilePaymentPlan)
    fun refreshMemberships()
    fun cancelMembership(membership: ProfileMembership)
    fun restartMembership(membership: ProfileMembership)
    fun refreshChildren()
    fun refreshChildJoinRequests()
    fun approveChildJoinRequest(registrationId: String)
    fun declineChildJoinRequest(registrationId: String)
    fun refreshDocuments()
    fun signDocument(document: ProfileDocumentCard)
    fun openSignedDocument(document: ProfileDocumentCard)
    fun confirmTextSignature()
    fun dismissTextSignature()
    fun createChild(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String? = null,
        relationship: String = "parent",
    )

    fun updateChild(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String? = null,
        relationship: String = "parent",
    )

    fun linkChild(
        childEmail: String? = null,
        childUserId: String? = null,
        relationship: String = "parent",
    )

    sealed class Child {
        data class ProfileHome(val component: ProfileComponent) : Child()
        data class ProfileDetails(val component: ProfileDetailsComponent) : Child()
        data class Payments(val component: ProfileComponent) : Child()
        data class PaymentPlans(val component: ProfileComponent) : Child()
        data class Memberships(val component: ProfileComponent) : Child()
        data class Children(val component: ProfileComponent) : Child()
        data class Documents(val component: ProfileComponent) : Child()
    }
}

@Serializable
private sealed class ProfileConfig {
    @Serializable
    data object Home : ProfileConfig()

    @Serializable
    data object Details : ProfileConfig()

    @Serializable
    data object Payments : ProfileConfig()

    @Serializable
    data object PaymentPlans : ProfileConfig()

    @Serializable
    data object Memberships : ProfileConfig()

    @Serializable
    data object Children : ProfileConfig()

    @Serializable
    data object Documents : ProfileConfig()

}

class DefaultProfileComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val billingRepository: IBillingRepository,
    private val teamRepository: ITeamRepository,
    private val navigationHandler: INavigationHandler,
) : ProfileComponent, PaymentProcessor(), ComponentContext by componentContext {

    private val navigation = StackNavigation<ProfileConfig>()
    private val koin = getKoin()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _paymentPlansState = MutableStateFlow(ProfilePaymentPlansState())
    override val paymentPlansState = _paymentPlansState.asStateFlow()

    private val _membershipsState = MutableStateFlow(ProfileMembershipsState())
    override val membershipsState = _membershipsState.asStateFlow()

    private val _childrenState = MutableStateFlow(ProfileChildrenState())
    override val childrenState = _childrenState.asStateFlow()

    private val _documentsState = MutableStateFlow(ProfileDocumentsState())
    override val documentsState = _documentsState.asStateFlow()

    private val _activeBillPaymentId = MutableStateFlow<String?>(null)
    override val activeBillPaymentId = _activeBillPaymentId.asStateFlow()

    private val _activeMembershipActionId = MutableStateFlow<String?>(null)
    override val activeMembershipActionId = _activeMembershipActionId.asStateFlow()

    private val _activeDocumentActionId = MutableStateFlow<String?>(null)
    override val activeDocumentActionId = _activeDocumentActionId.asStateFlow()

    private val _textSignaturePrompt = MutableStateFlow<ProfileTextSignaturePromptState?>(null)
    override val textSignaturePrompt = _textSignaturePrompt.asStateFlow()

    private val _isStripeAccountConnected = MutableStateFlow(false)
    override val isStripeAccountConnected = _isStripeAccountConnected.asStateFlow()

    private var loadingHandler: LoadingHandler? = null

    override val childStack: Value<ChildStack<*, ProfileComponent.Child>> = childStack(
        source = navigation,
        initialConfiguration = ProfileConfig.Home,
        serializer = ProfileConfig.serializer(),
        handleBackButton = true,
        childFactory = ::createChild,
    )

    init {
        scope.launch {
            userRepository.currentUser.collect { userResult ->
                _isStripeAccountConnected.value = userResult.getOrNull()?.hasStripeAccount == true
            }
        }

        scope.launch {
            paymentResult.collect { payment ->
                if (payment == null || _activeBillPaymentId.value == null) return@collect

                when (payment) {
                    PaymentResult.Canceled -> _errorState.value = ErrorMessage("Payment canceled.")
                    is PaymentResult.Failed -> _errorState.value = ErrorMessage(payment.error)
                    PaymentResult.Completed -> {
                        _errorState.value = ErrorMessage("Payment completed.")
                        refreshPaymentPlans()
                    }
                }

                loadingHandler?.hideLoading()
                _activeBillPaymentId.value = null
            }
        }
    }

    override fun onBackClicked() {
        val stack = childStack.value
        if (stack.backStack.isNotEmpty()) {
            navigation.pop()
        }
    }

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    @OptIn(DelicateDecomposeApi::class)
    private fun push(config: ProfileConfig) {
        navigation.push(config)
    }

    override fun navigateToProfileDetails() {
        push(ProfileConfig.Details)
    }

    override fun navigateToPayments() {
        push(ProfileConfig.Payments)
    }

    override fun navigateToPaymentPlans() {
        push(ProfileConfig.PaymentPlans)
    }

    override fun navigateToMemberships() {
        push(ProfileConfig.Memberships)
    }

    override fun navigateToChildren() {
        push(ProfileConfig.Children)
    }

    override fun navigateToDocuments() {
        push(ProfileConfig.Documents)
    }

    override fun onLogout() {
        scope.launch {
            userRepository.logout().onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            navigationHandler.navigateToLogin()
        }
    }

    override fun manageTeams() {
        navigationHandler.navigateToTeams()
    }

    override fun manageEvents() {
        navigationHandler.navigateToEvents()
    }

    override fun manageRefunds() {
        navigationHandler.navigateToRefunds()
    }

    override fun clearCache() {
        scope.launch {
            // TODO: Wire cache clearing behavior once the cache strategy is finalized.
        }
    }

    override fun manageStripeAccountOnboarding() {
        scope.launch {
            loadingHandler?.showLoading("Redirecting to Stripe ...")
            billingRepository.createAccount().onSuccess { onboardingUrl ->
                urlHandler?.openUrlInWebView(url = onboardingUrl)
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            loadingHandler?.hideLoading()
        }
    }

    override fun manageStripeAccount() {
        scope.launch {
            loadingHandler?.showLoading("Redirecting to Stripe ...")
            billingRepository.getOnboardingLink().onSuccess { onboardingUrl ->
                urlHandler?.openUrlInWebView(url = onboardingUrl)
                    ?.onFailure {
                        _errorState.value = ErrorMessage(it.message ?: "")
                    }
            }.onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
            }
            loadingHandler?.hideLoading()
        }
    }

    override fun refreshPaymentPlans() {
        scope.launch {
            _paymentPlansState.value = _paymentPlansState.value.copy(
                isLoading = true,
                error = null,
            )

            val currentUser = userRepository.currentUser.value.getOrNull()
            if (currentUser == null) {
                _paymentPlansState.value = ProfilePaymentPlansState(
                    isLoading = false,
                    plans = emptyList(),
                    error = "Unable to load payment plans for the current user.",
                )
                return@launch
            }

            val plans = mutableListOf<ProfilePaymentPlan>()
            val userBills = billingRepository.listBills(ownerType = "USER", ownerId = currentUser.id)
                .getOrElse {
                    _paymentPlansState.value = ProfilePaymentPlansState(
                        isLoading = false,
                        plans = emptyList(),
                        error = it.message ?: "Failed to load bills.",
                    )
                    return@launch
                }
            plans.addAll(buildPaymentPlans(bills = userBills, ownerLabel = currentUser.fullName))

            val teams = teamRepository.getTeams(currentUser.teamIds).getOrElse { emptyList() }
            val captainTeams = teams.filter { it.captainId == currentUser.id }
            captainTeams.forEach { team ->
                val ownerLabel = team.name?.takeIf { it.isNotBlank() } ?: "Team"
                val teamBills = billingRepository.listBills(ownerType = "TEAM", ownerId = team.id)
                    .getOrElse { throwable ->
                        Napier.w("Unable to load team bills for team ${team.id}", throwable)
                        return@forEach
                    }
                plans.addAll(buildPaymentPlans(bills = teamBills, ownerLabel = ownerLabel))
            }

            _paymentPlansState.value = ProfilePaymentPlansState(
                isLoading = false,
                plans = plans
                    .distinctBy { it.bill.id }
                    .sortedByDescending { it.nextPaymentDue ?: "" },
            )
        }
    }

    private suspend fun buildPaymentPlans(
        bills: List<Bill>,
        ownerLabel: String,
    ): List<ProfilePaymentPlan> {
        return bills.map { bill ->
            val payments = billingRepository.getBillPayments(bill.id)
                .onFailure { throwable ->
                    Napier.w("Unable to load payments for bill ${bill.id}", throwable)
                }
                .getOrElse { emptyList() }

            ProfilePaymentPlan(
                bill = bill,
                ownerLabel = ownerLabel,
                payments = payments,
            )
        }
    }

    override fun payNextInstallment(paymentPlan: ProfilePaymentPlan) {
        val nextPayment = paymentPlan.nextPendingPayment
        if (nextPayment == null) {
            _errorState.value = ErrorMessage("No pending installment available for this bill.")
            return
        }

        scope.launch {
            _activeBillPaymentId.value = paymentPlan.bill.id
            loadingHandler?.showLoading("Preparing payment ...")

            billingRepository.createBillingIntent(
                billId = paymentPlan.bill.id,
                billPaymentId = nextPayment.id,
            ).onSuccess { intent ->
                runCatching {
                    setPaymentIntent(intent)
                    val account = userRepository.currentAccount.value.getOrThrow()
                    val user = userRepository.currentUser.value.getOrThrow()
                    loadingHandler?.showLoading("Waiting for payment completion ...")
                    presentPaymentSheet(
                        email = account.email,
                        name = user.fullName,
                    )
                }.onFailure {
                    _activeBillPaymentId.value = null
                    loadingHandler?.hideLoading()
                    _errorState.value = ErrorMessage(it.message ?: "Unable to start payment sheet.")
                }
            }.onFailure {
                _activeBillPaymentId.value = null
                loadingHandler?.hideLoading()
                _errorState.value = ErrorMessage(it.message ?: "Unable to create payment intent.")
            }
        }
    }

    override fun refreshMemberships() {
        scope.launch {
            _membershipsState.value = _membershipsState.value.copy(
                isLoading = true,
                error = null,
            )

            val currentUser = userRepository.currentUser.value.getOrNull()
            if (currentUser == null) {
                _membershipsState.value = ProfileMembershipsState(
                    isLoading = false,
                    memberships = emptyList(),
                    error = "Unable to load memberships for the current user.",
                )
                return@launch
            }

            val subscriptions = billingRepository.listSubscriptions(userId = currentUser.id)
                .getOrElse {
                    _membershipsState.value = ProfileMembershipsState(
                        isLoading = false,
                        memberships = emptyList(),
                        error = it.message ?: "Failed to load memberships.",
                    )
                    return@launch
                }

            val productsById = billingRepository.getProductsByIds(
                subscriptions.map { it.productId },
            ).getOrElse { emptyList() }.associateBy { it.id }

            val organizationsById = billingRepository.getOrganizationsByIds(
                subscriptions.mapNotNull { it.organizationId },
            ).getOrElse { emptyList() }.associateBy { it.id }

            val memberships = subscriptions.map { subscription ->
                val product = productsById[subscription.productId]
                val organization = subscription.organizationId?.let { organizationsById[it] }

                ProfileMembership(
                    subscription = subscription,
                    productName = product?.name?.takeIf { it.isNotBlank() }
                        ?: subscription.productId,
                    organizationName = organization?.name?.takeIf { it.isNotBlank() }
                        ?: subscription.organizationId
                        ?: "Organization",
                )
            }.sortedByDescending { it.subscription.startDate }

            _membershipsState.value = ProfileMembershipsState(
                isLoading = false,
                memberships = memberships,
                error = null,
            )
        }
    }

    override fun cancelMembership(membership: ProfileMembership) {
        scope.launch {
            _activeMembershipActionId.value = membership.subscription.id
            billingRepository.cancelSubscription(membership.subscription.id)
                .onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "Unable to cancel membership.")
                }
                .onSuccess { cancelled ->
                    if (!cancelled) {
                        _errorState.value = ErrorMessage("Unable to cancel membership.")
                    } else {
                        refreshMemberships()
                    }
                }
            _activeMembershipActionId.value = null
        }
    }

    override fun restartMembership(membership: ProfileMembership) {
        scope.launch {
            _activeMembershipActionId.value = membership.subscription.id
            billingRepository.restartSubscription(membership.subscription.id)
                .onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "Unable to restart membership.")
                }
                .onSuccess { restarted ->
                    if (!restarted) {
                        _errorState.value = ErrorMessage("Unable to restart membership.")
                    } else {
                        refreshMemberships()
                    }
                }
            _activeMembershipActionId.value = null
        }
    }

    override fun refreshChildren() {
        refreshChildJoinRequests()
        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isLoading = true,
                error = null,
            )

            userRepository.listChildren()
                .onSuccess { children ->
                    _childrenState.value = _childrenState.value.copy(
                        isLoading = false,
                        children = children.map { it.toProfileChild() },
                        error = null,
                    )
                }
                .onFailure {
                    _childrenState.value = _childrenState.value.copy(
                        isLoading = false,
                        children = emptyList(),
                        error = it.message ?: "Failed to load children.",
                    )
                }
        }
    }

    override fun refreshChildJoinRequests() {
        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isLoadingJoinRequests = true,
                joinRequestsError = null,
            )

            userRepository.listPendingChildJoinRequests()
                .onSuccess { requests ->
                    _childrenState.value = _childrenState.value.copy(
                        isLoadingJoinRequests = false,
                        joinRequests = requests.map { it.toProfileJoinRequest() },
                        joinRequestsError = null,
                    )
                }
                .onFailure {
                    _childrenState.value = _childrenState.value.copy(
                        isLoadingJoinRequests = false,
                        joinRequests = emptyList(),
                        joinRequestsError = it.message ?: "Failed to load child join requests.",
                    )
                }
        }
    }

    override fun approveChildJoinRequest(registrationId: String) {
        resolveChildJoinRequest(
            registrationId = registrationId,
            action = FamilyJoinRequestAction.APPROVE,
        )
    }

    override fun declineChildJoinRequest(registrationId: String) {
        resolveChildJoinRequest(
            registrationId = registrationId,
            action = FamilyJoinRequestAction.DECLINE,
        )
    }

    private fun resolveChildJoinRequest(
        registrationId: String,
        action: FamilyJoinRequestAction,
    ) {
        val normalizedRegistrationId = registrationId.trim()
        if (normalizedRegistrationId.isEmpty()) {
            _errorState.value = ErrorMessage("Registration id is required.")
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                activeJoinRequestId = normalizedRegistrationId,
                joinRequestsError = null,
            )

            userRepository.resolveChildJoinRequest(
                registrationId = normalizedRegistrationId,
                action = action,
            ).onSuccess { resolution ->
                resolution.warnings.firstOrNull()?.let { warning ->
                    _errorState.value = ErrorMessage(warning)
                } ?: run {
                    _errorState.value = ErrorMessage(
                        if (action == FamilyJoinRequestAction.APPROVE) {
                            "Join request approved."
                        } else {
                            "Join request declined."
                        },
                    )
                }
                refreshChildren()
                refreshDocuments()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    joinRequestsError = it.message ?: "Failed to update join request.",
                )
            }

            _childrenState.value = _childrenState.value.copy(
                activeJoinRequestId = null,
            )
        }
    }

    override fun refreshDocuments() {
        scope.launch {
            _documentsState.value = _documentsState.value.copy(
                isLoading = true,
                error = null,
            )

            billingRepository.listProfileDocuments()
                .onSuccess { bundle ->
                    _documentsState.value = ProfileDocumentsState(
                        isLoading = false,
                        unsignedDocuments = bundle.unsigned,
                        signedDocuments = bundle.signed,
                        error = null,
                    )
                }
                .onFailure { throwable ->
                    _documentsState.value = _documentsState.value.copy(
                        isLoading = false,
                        error = throwable.message ?: "Failed to load documents.",
                    )
                }
        }
    }

    override fun signDocument(document: ProfileDocumentCard) {
        if (document.requiresChildEmail) {
            _errorState.value = ErrorMessage(
                document.statusNote ?: "Add child email before requesting child-signature documents.",
            )
            return
        }

        val eventId = document.eventId?.trim().orEmpty()
        if (eventId.isEmpty()) {
            _errorState.value = ErrorMessage("This document is missing an event id.")
            return
        }

        scope.launch {
            _activeDocumentActionId.value = document.id
            loadingHandler?.showLoading("Preparing document signing ...")

            billingRepository.getRequiredSignLinks(
                eventId = eventId,
                signerContext = document.signerContext,
                childUserId = document.childUserId,
                childUserEmail = document.childEmail,
            ).onSuccess { steps ->
                val step = steps.firstOrNull { it.templateId == document.templateId }
                    ?: steps.firstOrNull()
                if (step == null) {
                    _errorState.value = ErrorMessage("No signing step is available for this document.")
                    return@onSuccess
                }

                if (step.isTextStep()) {
                    _textSignaturePrompt.value = ProfileTextSignaturePromptState(
                        document = document,
                        step = step,
                    )
                    return@onSuccess
                }

                val signingUrl = step.resolvedSigningUrl()
                if (signingUrl.isNullOrBlank()) {
                    _errorState.value = ErrorMessage("Document is missing a signing URL.")
                    return@onSuccess
                }

                val openResult = urlHandler?.openUrlInWebView(signingUrl)
                    ?: Result.failure(IllegalStateException("Web view is unavailable."))
                openResult.onFailure { throwable ->
                    _errorState.value = ErrorMessage(
                        throwable.message ?: "Unable to open signing document.",
                    )
                }.onSuccess {
                    _errorState.value = ErrorMessage("Complete signing, then refresh documents.")
                }
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.message ?: "Unable to load signing links.",
                )
            }

            _activeDocumentActionId.value = null
            loadingHandler?.hideLoading()
        }
    }

    override fun openSignedDocument(document: ProfileDocumentCard) {
        if (document.type == ProfileDocumentType.TEXT) {
            return
        }

        val viewUrl = document.viewUrl?.trim().orEmpty()
        if (viewUrl.isEmpty()) {
            _errorState.value = ErrorMessage("This document is missing a view URL.")
            return
        }

        scope.launch {
            _activeDocumentActionId.value = document.id
            loadingHandler?.showLoading("Opening document ...")

            val resolvedUrl = if (
                viewUrl.startsWith("http://", ignoreCase = true) ||
                viewUrl.startsWith("https://", ignoreCase = true)
            ) {
                viewUrl
            } else {
                "${apiBaseUrl.trimEnd('/')}/${viewUrl.trimStart('/')}"
            }

            val openResult = urlHandler?.openUrlInWebView(resolvedUrl)
                ?: Result.failure(IllegalStateException("Web view is unavailable."))
            openResult.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.message ?: "Unable to open document.",
                )
            }

            _activeDocumentActionId.value = null
            loadingHandler?.hideLoading()
        }
    }

    override fun confirmTextSignature() {
        val prompt = _textSignaturePrompt.value ?: return
        val eventId = prompt.document.eventId?.trim().orEmpty()
        if (eventId.isEmpty()) {
            _errorState.value = ErrorMessage("This document is missing an event id.")
            return
        }

        scope.launch {
            _activeDocumentActionId.value = prompt.document.id
            loadingHandler?.showLoading("Recording signature ...")

            val documentId = prompt.step.resolvedDocumentId()
                ?: "mobile-profile-text-${prompt.step.templateId}-${Clock.System.now().toEpochMilliseconds()}"

            billingRepository.recordSignature(
                eventId = eventId,
                templateId = prompt.step.templateId,
                documentId = documentId,
                type = prompt.step.type,
            ).onSuccess {
                _textSignaturePrompt.value = null
                _errorState.value = ErrorMessage("Document signed.")
                refreshDocuments()
            }.onFailure { throwable ->
                _errorState.value = ErrorMessage(
                    throwable.message ?: "Failed to record signature.",
                )
            }

            _activeDocumentActionId.value = null
            loadingHandler?.hideLoading()
        }
    }

    override fun dismissTextSignature() {
        _textSignaturePrompt.value = null
    }

    override fun createChild(
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String,
    ) {
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedDateOfBirth = dateOfBirth.trim()
        val normalizedRelationship = relationship.trim().ifBlank { "parent" }
        val normalizedEmail = email?.trim()?.takeIf(String::isNotBlank)

        if (normalizedFirstName.isBlank() || normalizedLastName.isBlank() || normalizedDateOfBirth.isBlank()) {
            _childrenState.value = _childrenState.value.copy(
                createError = "First name, last name, and date of birth are required.",
            )
            return
        }

        if (!normalizedDateOfBirth.matches(DATE_OF_BIRTH_REGEX)) {
            _childrenState.value = _childrenState.value.copy(
                createError = "Date of birth must use YYYY-MM-DD format.",
            )
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isCreatingChild = true,
                createError = null,
            )

            userRepository.createChildAccount(
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                dateOfBirth = normalizedDateOfBirth,
                email = normalizedEmail,
                relationship = normalizedRelationship,
            ).onSuccess {
                _childrenState.value = _childrenState.value.copy(
                    isCreatingChild = false,
                    createError = null,
                )
                refreshChildren()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    isCreatingChild = false,
                    createError = it.message ?: "Failed to create child.",
                )
            }
        }
    }

    override fun updateChild(
        childUserId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        email: String?,
        relationship: String,
    ) {
        val normalizedChildUserId = childUserId.trim()
        val normalizedFirstName = firstName.trim()
        val normalizedLastName = lastName.trim()
        val normalizedDateOfBirth = dateOfBirth.trim()
        val normalizedRelationship = relationship.trim().ifBlank { "parent" }
        val normalizedEmail = email?.trim()?.takeIf(String::isNotBlank)

        if (
            normalizedChildUserId.isBlank() ||
            normalizedFirstName.isBlank() ||
            normalizedLastName.isBlank() ||
            normalizedDateOfBirth.isBlank()
        ) {
            _childrenState.value = _childrenState.value.copy(
                updateError = "First name, last name, and date of birth are required.",
            )
            return
        }

        if (!normalizedDateOfBirth.matches(DATE_OF_BIRTH_REGEX)) {
            _childrenState.value = _childrenState.value.copy(
                updateError = "Date of birth must use YYYY-MM-DD format.",
            )
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isUpdatingChild = true,
                updateError = null,
            )

            userRepository.updateChildAccount(
                childUserId = normalizedChildUserId,
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                dateOfBirth = normalizedDateOfBirth,
                email = normalizedEmail,
                relationship = normalizedRelationship,
            ).onSuccess {
                _childrenState.value = _childrenState.value.copy(
                    isUpdatingChild = false,
                    updateError = null,
                )
                refreshChildren()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    isUpdatingChild = false,
                    updateError = it.message ?: "Failed to update child.",
                )
            }
        }
    }

    override fun linkChild(
        childEmail: String?,
        childUserId: String?,
        relationship: String,
    ) {
        val normalizedChildEmail = childEmail?.trim()?.takeIf(String::isNotBlank)
        val normalizedChildUserId = childUserId?.trim()?.takeIf(String::isNotBlank)
        val normalizedRelationship = relationship.trim().ifBlank { "parent" }
        if (normalizedChildEmail == null && normalizedChildUserId == null) {
            _childrenState.value = _childrenState.value.copy(
                linkError = "Provide a child email or user ID.",
            )
            return
        }

        scope.launch {
            _childrenState.value = _childrenState.value.copy(
                isLinkingChild = true,
                linkError = null,
            )

            userRepository.linkChildToParent(
                childEmail = normalizedChildEmail,
                childUserId = normalizedChildUserId,
                relationship = normalizedRelationship,
            ).onSuccess {
                _childrenState.value = _childrenState.value.copy(
                    isLinkingChild = false,
                    linkError = null,
                )
                refreshChildren()
            }.onFailure {
                _childrenState.value = _childrenState.value.copy(
                    isLinkingChild = false,
                    linkError = it.message ?: "Failed to link child.",
                )
            }
        }
    }

    private fun createChild(
        config: ProfileConfig,
        componentContext: ComponentContext,
    ): ProfileComponent.Child = when (config) {
        ProfileConfig.Home -> ProfileComponent.Child.ProfileHome(this@DefaultProfileComponent)
        ProfileConfig.Details -> ProfileComponent.Child.ProfileDetails(
            koin.get<ProfileDetailsComponent> {
                parametersOf(componentContext, ::onBackClicked)
            },
        )

        ProfileConfig.Payments -> ProfileComponent.Child.Payments(this@DefaultProfileComponent)
        ProfileConfig.PaymentPlans -> ProfileComponent.Child.PaymentPlans(this@DefaultProfileComponent)
        ProfileConfig.Memberships -> ProfileComponent.Child.Memberships(this@DefaultProfileComponent)
        ProfileConfig.Children -> ProfileComponent.Child.Children(this@DefaultProfileComponent)
        ProfileConfig.Documents -> ProfileComponent.Child.Documents(this@DefaultProfileComponent)
    }
}

private val DATE_OF_BIRTH_REGEX = Regex("""\d{4}-\d{2}-\d{2}""")

private fun FamilyChild.toProfileChild(): ProfileChild {
    return ProfileChild(
        userId = userId,
        firstName = firstName,
        lastName = lastName,
        dateOfBirth = dateOfBirth,
        age = age,
        linkStatus = linkStatus,
        relationship = relationship,
        email = email,
        hasEmail = hasEmail ?: email?.isNotBlank() == true,
    )
}

private fun FamilyJoinRequest.toProfileJoinRequest(): ProfileJoinRequest {
    return ProfileJoinRequest(
        registrationId = registrationId,
        eventId = eventId,
        eventName = eventName?.trim()?.takeIf(String::isNotBlank) ?: "Event",
        childUserId = childUserId,
        childFullName = childFullName?.trim()?.takeIf(String::isNotBlank)
            ?: listOf(
                childFirstName?.trim().orEmpty(),
                childLastName?.trim().orEmpty(),
            ).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "Child" },
        childEmail = childEmail?.trim()?.takeIf(String::isNotBlank),
        childHasEmail = childHasEmail,
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
        requestedAt = requestedAt?.trim()?.takeIf(String::isNotBlank),
    )
}
