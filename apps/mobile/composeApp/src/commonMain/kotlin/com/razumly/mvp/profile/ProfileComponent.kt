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
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
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

interface ProfileComponent : IPaymentProcessor {
    val childStack: Value<ChildStack<*, Child>>
    val errorState: StateFlow<ErrorMessage?>
    val paymentPlansState: StateFlow<ProfilePaymentPlansState>
    val membershipsState: StateFlow<ProfileMembershipsState>
    val activeBillPaymentId: StateFlow<String?>
    val activeMembershipActionId: StateFlow<String?>
    val isStripeAccountConnected: StateFlow<Boolean>

    fun onBackClicked()
    fun setLoadingHandler(loadingHandler: LoadingHandler)

    fun navigateToProfileDetails()
    fun navigateToPayments()
    fun navigateToPaymentPlans()
    fun navigateToMemberships()
    fun navigateToChildren()

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

    sealed class Child {
        data class ProfileHome(val component: ProfileComponent) : Child()
        data class ProfileDetails(val component: ProfileDetailsComponent) : Child()
        data class Payments(val component: ProfileComponent) : Child()
        data class PaymentPlans(val component: ProfileComponent) : Child()
        data class Memberships(val component: ProfileComponent) : Child()
        data class Children(val component: ProfileComponent) : Child()
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

    private val _activeBillPaymentId = MutableStateFlow<String?>(null)
    override val activeBillPaymentId = _activeBillPaymentId.asStateFlow()

    private val _activeMembershipActionId = MutableStateFlow<String?>(null)
    override val activeMembershipActionId = _activeMembershipActionId.asStateFlow()

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
    }
}
