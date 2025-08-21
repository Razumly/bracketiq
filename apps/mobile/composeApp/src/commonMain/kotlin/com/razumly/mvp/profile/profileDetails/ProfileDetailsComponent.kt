package com.razumly.mvp.profile.profileDetails

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.empty
import io.appwrite.models.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

interface ProfileDetailsComponent : IPaymentProcessor {
    val errorState: StateFlow<ErrorMessage?>
    val message: StateFlow<String?>
    val currentUser: StateFlow<UserData>
    val currentAccount: StateFlow<User<Map<String, Any>>>

    fun onBack()
    fun setLoadingHandler(loadingHandler: LoadingHandler)

    fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        userName: String
    )
}

class DefaultProfileDetailsComponent(
    private val componentContext: ComponentContext,
    private val userRepository: IUserRepository,
) : ProfileDetailsComponent, PaymentProcessor(), ComponentContext by componentContext {

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    override val message = _message.asStateFlow()

    override val currentUser = userRepository.currentUser
        .map { result -> result.getOrThrow() }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = UserData()
        )

    override val currentAccount = userRepository.currentAccount
        .map { result -> result.getOrElse {
            userRepository.getCurrentAccount()
            User.empty<Map<String, Any>>()
        } }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = User.empty<Map<String, Any>>()
        )

    private lateinit var loadingHandler: LoadingHandler

    override fun onBack() {
        onBack()
    }

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    override fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        userName: String
    ) {
        scope.launch {
            loadingHandler.showLoading("Updating Profile...")
            userRepository.updateProfile(firstName, lastName, email, password, userName)
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to update profile: ${error.message}")
                }
                .onSuccess {
                    _message.value = "Profile updated successfully"
                }
            loadingHandler.hideLoading()
        }
    }
}
