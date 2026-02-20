package com.razumly.mvp.userAuth

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.SignupProfileConflict
import com.razumly.mvp.core.data.repositories.SignupProfileConflictException
import com.razumly.mvp.core.data.repositories.SignupProfileSelection
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
    val signupConflict: StateFlow<SignupProfileConflict?>

    fun onLogin(email: String, password: String)
    fun onLogout()
    fun toggleIsSignup()
    fun onSignup(
        email: String,
        password: String,
        confirmPassword: String,
        firstName: String,
        lastName: String,
        userName: String,
        dateOfBirth: String?,
    )
    fun resolveSignupConflict(selection: SignupProfileSelection)
    fun dismissSignupConflict()
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

    private val _signupConflict = MutableStateFlow<SignupProfileConflict?>(null)
    override val signupConflict: StateFlow<SignupProfileConflict?> = _signupConflict.asStateFlow()

    private var pendingSignupRequest: PendingSignupRequest? = null

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
            val maskedEmail = maskEmail(email)
            Napier.d("Auth: email login started for $maskedEmail")
            _loginState.value = LoginState.Loading
            userRepository.login(email, password).onFailure { throwable ->
                logAuthFailure("email login", throwable)
                _loginState.value = LoginState.Error(throwable.message.toString())
            }.onSuccess {
                val currentUser = userRepository.currentUser.value.getOrNull()
                if (currentUser?.id.isNullOrBlank()) {
                    Napier.w("Auth: email login returned user with blank id for $maskedEmail")
                    _loginState.value = LoginState.Error("Invalid email or password")
                } else {
                    Napier.i("Auth: email login succeeded for userId=${currentUser?.id}")
                    _loginState.value = LoginState.Success
                    // Navigation will be handled by RootComponent automatically
                }
            }
        }
    }

    override fun onLogout() {
        scope.launch {
            Napier.d("Auth: logout started")
            userRepository.logout()
                .onSuccess {
                    Napier.i("Auth: logout succeeded")
                    _loginState.value = LoginState.Initial
                    navigationHandler.navigateToLogin()
                }.onFailure { throwable ->
                    logAuthFailure("logout", throwable)
                    _loginState.value = LoginState.Error("Failed to logout")
                }
        }
    }

    override fun toggleIsSignup() {
        _isSignup.value = !_isSignup.value
        clearSignupConflict()
    }

    override fun onSignup(
        email: String, password: String, confirmPassword: String,
        firstName: String, lastName: String, userName: String, dateOfBirth: String?
    ) {
        if (password != confirmPassword) {
            _passwordError.value = "Passwords do not match"
            return
        }
        _passwordError.value = ""

        val request = PendingSignupRequest(
            email = email,
            password = password,
            firstName = firstName,
            lastName = lastName,
            userName = userName,
            dateOfBirth = dateOfBirth,
        )
        pendingSignupRequest = request
        _signupConflict.value = null
        submitSignup(request = request, profileSelection = null)
    }

    override fun resolveSignupConflict(selection: SignupProfileSelection) {
        val request = pendingSignupRequest ?: return
        submitSignup(request = request, profileSelection = selection)
    }

    override fun dismissSignupConflict() {
        clearSignupConflict()
    }

    private fun submitSignup(
        request: PendingSignupRequest,
        profileSelection: SignupProfileSelection?,
    ) {
        scope.launch {
            val maskedEmail = maskEmail(request.email)
            Napier.d("Auth: signup started for $maskedEmail")
            _loginState.value = LoginState.Loading
            userRepository.createNewUser(
                email = request.email,
                password = request.password,
                firstName = request.firstName,
                lastName = request.lastName,
                userName = request.userName,
                dateOfBirth = request.dateOfBirth,
                profileSelection = profileSelection,
            )
                .onSuccess {
                    Napier.i("Auth: signup succeeded for $maskedEmail")
                    clearSignupConflict()
                    _loginState.value = LoginState.Success
                }.onFailure { throwable ->
                    if (throwable is SignupProfileConflictException) {
                        Napier.i("Auth: signup profile conflict for $maskedEmail")
                        _signupConflict.value = throwable.conflict
                        _loginState.value = LoginState.Initial
                        return@onFailure
                    }
                    logAuthFailure("signup", throwable)
                    _loginState.value = LoginState.Error("Failed to signup")
                }
        }
    }

    private fun clearSignupConflict() {
        _signupConflict.value = null
        pendingSignupRequest = null
    }

    private fun logAuthFailure(action: String, throwable: Throwable) {
        Napier.e("Auth: $action failed: ${throwable.message}", throwable)
    }

    private fun maskEmail(email: String): String {
        val atIndex = email.indexOf('@')
        if (atIndex <= 1) return "***"
        return "${email.first()}***${email.substring(atIndex)}"
    }
}

private data class PendingSignupRequest(
    val email: String,
    val password: String,
    val firstName: String,
    val lastName: String,
    val userName: String,
    val dateOfBirth: String?,
)
