package com.razumly.mvp.profile

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.IMVPRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

interface ProfileComponent {
    fun onLogout()
}

class DefaultProfileComponent(
    private val componentContext: ComponentContext,
    private val mvpRepository: IMVPRepository,
    private val onNavigateToLogin: () -> Unit
) : ProfileComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    override fun onLogout() {
        scope.launch {
            mvpRepository.logout()
            onNavigateToLogin()
        }
    }
}