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
import com.razumly.mvp.core.data.dataTypes.BillingAddress
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.profile.profileDetails.ProfileDetailsComponent
import io.appwrite.services.Account
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.koin.core.parameter.parametersOf
import org.koin.mp.KoinPlatform.getKoin

interface ProfileComponent : IPaymentProcessor {
    val childStack: Value<ChildStack<*, Child>>
    val errorState: StateFlow<ErrorMessage?>

    fun onBackClicked()
    fun navigateToProfileDetails()
    fun setLoadingHandler(loadingHandler: LoadingHandler)

    // Navigation methods for existing screens
    fun onLogout()
    fun manageTeams()
    fun manageEvents()
    fun manageRefunds()
    fun clearCache()
    fun manageStripeAccountOnboarding()
    fun manageStripeAccount()

    sealed class Child {
        data class ProfileHome(val component: ProfileComponent) : Child()
        data class ProfileDetails(val component: ProfileDetailsComponent) : Child()
    }

    @Serializable
    sealed class Config {
        @Serializable
        data object ProfileHome : Config()

        @Serializable
        data object ProfileDetails : Config()
    }
}

class DefaultProfileComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val onNavigateToLogin: () -> Unit,
    private val onNavigateToEvents: () -> Unit,
    private val onNavigateToTeamSettings: (freeAgents: List<String>, event: EventAbs?) -> Unit,
    private val onNavigateToRefundManager: () -> Unit,
    private val billingRepository: IBillingRepository,
) : ProfileComponent, PaymentProcessor(), ComponentContext by componentContext {

    private val navigation = StackNavigation<ProfileComponent.Config>()
    private val koin = getKoin()
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override val childStack = childStack(
        source = navigation,
        initialConfiguration = ProfileComponent.Config.ProfileHome,
        serializer = ProfileComponent.Config.serializer(),
        handleBackButton = true,
        childFactory = ::createChild
    )

    override fun onBackClicked() {
        val stack = childStack.value
        if (stack.backStack.isNotEmpty()) {
            navigation.pop()
        }
    }

    @OptIn(DelicateDecomposeApi::class)
    override fun navigateToProfileDetails() {
        navigation.push(ProfileComponent.Config.ProfileDetails)
    }

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    override fun onLogout() {
        scope.launch {
            userRepository.logout().onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            onNavigateToLogin()
        }
    }

    override fun manageTeams() {
        onNavigateToTeamSettings(listOf(), null)
    }

    override fun manageEvents() {
        onNavigateToEvents()
    }

    override fun manageRefunds() {
        onNavigateToRefundManager()
    }

    override fun clearCache() {
        scope.launch {
            // Your cache clearing logic
        }
    }

    override fun manageStripeAccountOnboarding() {
        scope.launch {
            loadingHandler.showLoading("Redirecting to Stripe ...")
            billingRepository.getOnboardingLink().onSuccess { onboardingUrl ->
                urlHandler?.openUrlInWebView(url = onboardingUrl)
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            loadingHandler.hideLoading()
        }
    }

    override fun manageStripeAccount() {
        scope.launch {
            loadingHandler.showLoading("Redirecting to Stripe ...")
            urlHandler?.openUrlInWebView(url = "https://dashboard.stripe.com/dashboard")
                ?.onFailure {
                    _errorState.value = ErrorMessage(it.message ?: "")
                }
            loadingHandler.hideLoading()
        }
    }


    private fun createChild(
        config: ProfileComponent.Config, componentContext: ComponentContext
    ): ProfileComponent.Child = when (config) {
        is ProfileComponent.Config.ProfileHome -> ProfileComponent.Child.ProfileHome(
            this@DefaultProfileComponent // Return self for home
        )

        is ProfileComponent.Config.ProfileDetails -> ProfileComponent.Child.ProfileDetails(
            koin.get<ProfileDetailsComponent> {
                parametersOf(
                    componentContext
                )
            })
    }
}
