package com.razumly.mvp.profileCompletion

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.SignupProfileField
import com.razumly.mvp.core.network.userMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface ProfileCompletionComponent {
    val currentUser: StateFlow<UserData>
    val missingFields: StateFlow<Set<SignupProfileField>>
    val isSubmitting: StateFlow<Boolean>
    val errorMessage: StateFlow<String?>

    fun clearError()
    fun submit(firstName: String, lastName: String, dateOfBirth: String)
    fun logout()
}

class DefaultProfileCompletionComponent(
    componentContext: ComponentContext,
    private val userRepository: IUserRepository,
) : ProfileCompletionComponent, ComponentContext by componentContext {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())

    override val currentUser: StateFlow<UserData> = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = UserData(),
        )

    override val missingFields: StateFlow<Set<SignupProfileField>> =
        userRepository.requiredProfileCompletionState
            .map { it.missingFields }
            .stateIn(
                scope = scope,
                started = SharingStarted.Eagerly,
                initialValue = emptySet(),
            )

    private val _isSubmitting = MutableStateFlow(false)
    override val isSubmitting: StateFlow<Boolean> = _isSubmitting.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    override val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    override fun clearError() {
        _errorMessage.value = null
    }

    override fun submit(firstName: String, lastName: String, dateOfBirth: String) {
        scope.launch {
            _isSubmitting.value = true
            _errorMessage.value = null
            userRepository.completeRequiredProfile(
                firstName = firstName,
                lastName = lastName,
                dateOfBirth = dateOfBirth,
            ).onFailure { throwable ->
                _errorMessage.value = throwable.userMessage("Failed to update your profile.")
            }
            _isSubmitting.value = false
        }
    }

    override fun logout() {
        scope.launch {
            _isSubmitting.value = true
            _errorMessage.value = null
            userRepository.logout().onFailure { throwable ->
                _errorMessage.value = throwable.userMessage("Failed to log out.")
            }
            _isSubmitting.value = false
        }
    }
}
