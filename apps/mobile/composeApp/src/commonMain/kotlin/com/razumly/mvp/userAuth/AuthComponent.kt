package com.razumly.mvp.userAuth

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.repositories.IUserRepository
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

    @Throws(Throwable::class)
    fun onLogin(email: String, password: String)
    @Throws(Throwable::class)
    fun onLogout()
    @Throws(Throwable::class)
    fun toggleIsSignup()
    @Throws(Throwable::class)
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
    private val onNavigateToHome: () -> Unit
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

    internal val _currentUser = userRepository.currentUser

    private val _isSignup = MutableStateFlow(false)
    override val isSignup: StateFlow<Boolean> = _isSignup.asStateFlow()

    private val _passwordError = MutableStateFlow("")
    override val passwordError = _passwordError.asStateFlow()

    init {
        scope.launch {
            _loginState.collect {
                if (it == LoginState.Success) {
                    onNavigateToHome()
                }
            }
        }
        _currentUser
            .filter { it.isSuccess }
            .take(1)
            .onEach { _loginState.value = LoginState.Success }
            .launchIn(scope)
    }

    override fun onLogin(email: String, password: String) {
        scope.launch {
            _loginState.value = LoginState.Loading

            userRepository.login(email, password).onFailure {
                _loginState.value = LoginState.Error(it.message.toString())
            }.onSuccess {
                if (_currentUser.value.getOrThrow().id.isBlank()) {
                    _loginState.value = LoginState.Error("Invalid email or password")
                } else {
                    _loginState.value = LoginState.Success
                }
            }
        }
    }

    override fun onLogout() {
        scope.launch {
            userRepository.logout()
                .onSuccess {
                    _loginState.value = LoginState.Initial
                }.onFailure {
                    _loginState.value = LoginState.Error("Failed to logout")
                }
        }
    }

    override fun toggleIsSignup() {
        _isSignup.value = !_isSignup.value
    }

    override fun onSignup(
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