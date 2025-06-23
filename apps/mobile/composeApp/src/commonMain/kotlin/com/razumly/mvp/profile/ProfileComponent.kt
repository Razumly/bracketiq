package com.razumly.mvp.profile

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

interface ProfileComponent: IPaymentProcessor {
    fun onLogout()
    fun manageTeams()
    fun manageEvents()
    fun clearCache()
    fun manageStripeAccount()
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
    private val _error = MutableStateFlow("")
    override fun onLogout() {
        scopeMain.launch {
            userRepository.logout().onFailure {
                _error.value = it.message.toString()
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

    override fun manageStripeAccount() {
        scopeMain.launch {
            billingRepository.getOnboardingLink().onSuccess { onboardingUrl ->
                urlHandler?.openUrlInWebView(
                    url = onboardingUrl,
                )
            }
        }
    }

    override fun clearCache() {
        scopeIO.launch {
//            mvpDatabase.clearAllTables() // IDE BUG: NOT A SYNTAX ISSUE
        }
    }
}