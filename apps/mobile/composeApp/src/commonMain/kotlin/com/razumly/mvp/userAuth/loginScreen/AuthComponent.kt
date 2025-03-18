package com.razumly.mvp.userAuth.loginScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.MVPRepository
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AuthComponent(
    internal val mvpRepository: MVPRepository,
    internal val componentContext: ComponentContext,
    private val onNavigateToHome: () -> Unit
) : ComponentContext by componentContext {

    internal val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    internal val _loginState = MutableStateFlow<LoginState>(LoginState.Initial)
    val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    internal val _currentUser = MutableStateFlow<UserWithRelations?>(null)
    val currentUser: StateFlow<UserWithRelations?> = _currentUser.asStateFlow()

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
            _currentUser.value = mvpRepository.getCurrentUser()
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Initial
            } else {
                _loginState.value = LoginState.Success
            }
        }
    }

    fun onLogin(email: String, password: String) {
        scope.launch {
            _loginState.value = LoginState.Loading

            _currentUser.value = mvpRepository.login(email, password)
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Error("Invalid email or password")
            } else {
                _loginState.value = LoginState.Success
            }
        }
    }

    fun onLogout() {
        scope.launch {
            mvpRepository.logout()
            _currentUser.value = null
            _loginState.value = LoginState.Initial
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
            val user = mvpRepository.createNewUser(email, password, firstName, lastName, userName)
            if (user == null) {
                _passwordError.value = "Password is too long, or is a common password"
            } else {
                onLogin(email, password)
            }
        }
    }
}