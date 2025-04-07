package com.razumly.mvp.userAuth.loginScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.repositories.IUserRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AuthComponent(
    internal val userRepository: IUserRepository,
    internal val componentContext: ComponentContext,
    private val onNavigateToHome: () -> Unit
) : ComponentContext by componentContext {

    internal val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    internal val _loginState = MutableStateFlow<LoginState>(LoginState.Initial)
    val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    internal val _currentUser = userRepository.currentUser
        .stateIn(scope, SharingStarted.Eagerly, null)

    internal val _isSignup = MutableStateFlow(false)
    val isSignup: StateFlow<Boolean> = _isSignup.asStateFlow()

    internal val _passwordError = MutableStateFlow("")
    val passwordError = _passwordError.asStateFlow()

    init {
        scope.launch {
            _loginState.collect {
                if (it == LoginState.Success) {
                    onNavigateToHome()
                }
            }
        }
        scope.launch {
            _currentUser.collect { user ->
                if (user == null) {
                    _loginState.value = LoginState.Initial
                } else {
                    _loginState.value = LoginState.Success
                }
            }
        }
    }

    fun onLogin(email: String, password: String) {
        scope.launch {
            _loginState.value = LoginState.Loading

            userRepository.login(email, password).onFailure {
                _loginState.value = LoginState.Error(it.message.toString())
            }.onSuccess {
                if (_currentUser.value == null) {
                    _loginState.value = LoginState.Error("Invalid email or password")
                } else {
                    _loginState.value = LoginState.Success
                }
            }
        }
    }

    fun onLogout() {
        scope.launch {
            userRepository.logout()
                .onSuccess {
                    _loginState.value = LoginState.Initial
                }.onFailure {
                    _loginState.value = LoginState.Error("Failed to logout")
                }
        }
    }

    fun toggleIsSignup() {
        _isSignup.value = !_isSignup.value
    }

    fun onSignup(
        email: String,
        password: String,
        confirmPassword: String,
        firstName: String,
        lastName: String,
        userName: String
    ) {
        if (password != confirmPassword) {
            return
        }
        scope.launch {
            userRepository.createNewUser(email, password, firstName, lastName, userName)
                .onSuccess {
                    onLogin(email, password)
                }.onFailure {
                    _loginState.value = LoginState.Error("Failed to signup")
                }
        }
    }
}