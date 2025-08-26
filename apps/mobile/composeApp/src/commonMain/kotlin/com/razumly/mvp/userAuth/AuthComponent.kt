package com.razumly.mvp.userAuth

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.launch

interface AuthComponent {
    val loginState: StateFlow<LoginState>
    val isSignup: StateFlow<Boolean>
    val passwordError: StateFlow<String>

    fun onLogin(email: String, password: String)
    fun onLogout()
    fun toggleIsSignup()
    fun onSignup(
        email: String,
        password: String,
        confirmPassword: String,
        firstName: String,
        lastName: String,
        userName: String
    )
}

class DefaultAuthComponent(
    internal val userRepository: IUserRepository,
    internal val componentContext: ComponentContext,
    private val navigationHandler: INavigationHandler
) : ComponentContext by componentContext, AuthComponent {

    internal val scope = CoroutineScope(
        SupervisorJob() +
                Dispatchers.Main.immediate +
                CoroutineExceptionHandler { _, throwable ->
                    Napier.e("AuthComponent coroutine error", throwable)
                }
    )

    internal val _loginState = MutableStateFlow<LoginState>(LoginState.Initial)
    override val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    private val _isSignup = MutableStateFlow(false)
    override val isSignup: StateFlow<Boolean> = _isSignup.asStateFlow()

    private val _passwordError = MutableStateFlow("")
    override val passwordError = _passwordError.asStateFlow()

    init {
        // Don't automatically navigate - RootComponent handles this now
        userRepository.currentUser
            .filter { it.isSuccess }
            .take(1)
            .onEach {
                _loginState.value = LoginState.Success
                // RootComponent will handle navigation based on user state
            }
            .launchIn(scope)
    }

    override fun onLogin(email: String, password: String) {
        scope.launch {
            _loginState.value = LoginState.Loading
            userRepository.login(email, password).onFailure {
                _loginState.value = LoginState.Error(it.message.toString())
            }.onSuccess {
                val currentUser = userRepository.currentUser.value.getOrNull()
                if (currentUser?.id.isNullOrBlank()) {
                    _loginState.value = LoginState.Error("Invalid email or password")
                } else {
                    _loginState.value = LoginState.Success
                    // Navigation will be handled by RootComponent automatically
                }
            }
        }
    }

    override fun onLogout() {
        scope.launch {
            userRepository.logout()
                .onSuccess {
                    _loginState.value = LoginState.Initial
                    navigationHandler.navigateToLogin()
                }.onFailure {
                    _loginState.value = LoginState.Error("Failed to logout")
                }
        }
    }

    override fun toggleIsSignup() {
        _isSignup.value = !_isSignup.value
    }

    override fun onSignup(
        email: String, password: String, confirmPassword: String,
        firstName: String, lastName: String, userName: String
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
