package com.razumly.mvp.profile

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

interface ProfileComponent: IPaymentProcessor {
    val errorState: StateFlow<ErrorMessage?>
    fun onLogout()
    fun manageTeams()
    fun manageEvents()
    fun clearCache()
    fun manageStripeAccountOnboarding()
    fun manageStripeAccount()
    fun setLoadingHandler(loadingHandler: LoadingHandler)
}

class DefaultProfileComponent(
    private val componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val databaseService: DatabaseService,
    private val onNavigateToLogin: () -> Unit,
    private val onNavigateToEvents: () -> Unit,
    private val onNavigateToTeamSettings: (freeAgents: List<String>, event: EventAbs?) -> Unit,
    private val billingRepository: IBillingRepository,
) : ProfileComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val scopeMain = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val scopeIO = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private lateinit var loadingHandler: LoadingHandler

    override fun setLoadingHandler(handler: LoadingHandler) {
        loadingHandler = handler
    }

    override fun onLogout() {
        scopeMain.launch {
            userRepository.logout().onFailure {
                _errorState.value = ErrorMessage(it.message?: "")
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

    override fun manageStripeAccountOnboarding() {
        scopeMain.launch {
            loadingHandler.showLoading("Redirecting to Stripe ...")
            billingRepository.getOnboardingLink().onSuccess { onboardingUrl ->
                urlHandler?.openUrlInWebView(
                    url = onboardingUrl,
                )
            }.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            loadingHandler.hideLoading()
        }
    }

    override fun manageStripeAccount() {
        scopeMain.launch {
            loadingHandler.showLoading("Redirecting to Stripe ...")
            urlHandler?.openUrlInWebView(
                url = "https://dashboard.stripe.com/dashboard",
            )?.onFailure {
                _errorState.value = ErrorMessage(it.message ?: "")
            }
            loadingHandler.hideLoading()
        }
    }

    override fun clearCache() {
        scopeIO.launch {
//            mvpDatabase.clearAllTables() // IDE BUG: NOT A SYNTAX ISSUE
        }
    }
}