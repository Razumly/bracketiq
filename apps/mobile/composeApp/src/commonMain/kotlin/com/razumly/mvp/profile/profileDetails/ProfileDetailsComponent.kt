package com.razumly.mvp.profile.profileDetails

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.BillingAddress
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

interface ProfileDetailsComponent: IPaymentProcessor {
    val errorState: StateFlow<ErrorMessage?>
    val currentUser: StateFlow<UserData>
    val currentBillingAddress: StateFlow<BillingAddress?>
    val currentAccount: StateFlow<User<Map<String, Any>>>

    fun onBack()
    fun setLoadingHandler(loadingHandler: LoadingHandler)

    suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        userName: String
    ): Result<Unit>

    suspend fun updateBillingAddress(billingAddress: BillingAddress): Result<Unit>
}

class DefaultProfileDetailsComponent(
    private val componentContext: ComponentContext,
    private val userRepository: IUserRepository,
) : ProfileDetailsComponent, PaymentProcessor(), ComponentContext by componentContext {

    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val _errorState = MutableStateFlow<ErrorMessage?>(null)

    override val errorState = _errorState.asStateFlow()

    override val currentUser = userRepository.currentUser
        .map { result -> result.getOrThrow() }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = UserData()
        )

    override val currentAccount = userRepository.currentAccount
        .map { result -> result.getOrThrow() }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = User.empty<Map<String, Any>>()
        )

    override val currentBillingAddress = userRepository.getBillingAddressFlow()
        .map { result ->  result.getOrElse { BillingAddress.empty() } }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = BillingAddress.empty()
        )

    private lateinit var loadingHandler: LoadingHandler

    override fun onBack() {
        onBack()
    }

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    init {
        handleAddressResult = { billingAddress ->
            scope.launch {
                updateBillingAddress(billingAddress)
            }
        }
    }

    override suspend fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        userName: String
    ): Result<Unit> {
        return try {
            userRepository.updateProfile(firstName, lastName, email, password, userName)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun updateBillingAddress(billingAddress: BillingAddress): Result<Unit> {
        return try {
            userRepository.createOrUpdateBillingAddress(billingAddress).map { }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
