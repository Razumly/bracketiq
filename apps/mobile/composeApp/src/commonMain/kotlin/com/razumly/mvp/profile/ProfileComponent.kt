package com.razumly.mvp.profile

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.repositories.IMVPRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

interface ProfileComponent {
    fun onLogout()
    fun manageTeams()
}

class DefaultProfileComponent(
    private val componentContext: ComponentContext,
    private val mvpRepository: IMVPRepository,
    private val onNavigateToLogin: () -> Unit,
    private val onNavigateToTeamSettings: () -> Unit,
) : ProfileComponent, ComponentContext by componentContext {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    override fun onLogout() {
        scope.launch {
            mvpRepository.logout()
            onNavigateToLogin()
        }
    }

    override fun manageTeams() {
        onNavigateToTeamSettings()
    }
}