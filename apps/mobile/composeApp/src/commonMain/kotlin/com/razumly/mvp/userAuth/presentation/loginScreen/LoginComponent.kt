package com.razumly.mvp.userAuth.presentation.loginScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

interface LoginComponent {
    val loginState: StateFlow<LoginState>
    val currentUser: StateFlow<UserData?>

    fun onLogin(email: String, password: String)
    fun onLogout()
}

class DefaultLoginComponent(
    private val appwriteRepository: IMVPRepository,
    private val componentContext: ComponentContext,
    private val onNavigateToHome: () -> Unit
) : LoginComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _loginState = MutableStateFlow<LoginState>(LoginState.Initial)
    override val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    private val _currentUser = MutableStateFlow<UserData?>(null)
    override val currentUser: StateFlow<UserData?> = _currentUser.asStateFlow()

    init {
        scope.launch {
            _loginState.collect {
                if (it == LoginState.Success) {
                    onNavigateToHome()
                }
            }
        }
        scope.launch {
            _currentUser.value = appwriteRepository.getCurrentUser()
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Initial
            } else {
                _loginState.value = LoginState.Success
            }
        }
    }

    override fun onLogin(email: String, password: String) {
        scope.launch {
            _loginState.value = LoginState.Loading

            _currentUser.value = appwriteRepository.login(email, password)
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Error("Invalid email or password")
            } else {
                _loginState.value = LoginState.Success
            }
        }
    }

    override fun onLogout() {
        scope.launch {
            appwriteRepository.logout()
            _currentUser.value = null
            _loginState.value = LoginState.Initial
        }
    }
}
