package com.razumly.mvp.profile.profileDetails

import com.razumly.mvp.core.network.userMessage
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IImagesRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.PaymentProcessor
import com.razumly.mvp.core.presentation.util.convertPhotoResultToUploadFile
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult
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
    val currentAccount: StateFlow<AuthAccount>
    val lastUploadedImageId: StateFlow<String?>

    fun onBackClicked()
    fun setLoadingHandler(loadingHandler: LoadingHandler)
    fun onUploadSelected(photo: GalleryPhotoResult)
    fun consumeUploadedImageSelection()
    fun deleteImage(imageId: String)
    fun deleteAccount(confirmationText: String)

    fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        currentPassword: String,
        newPassword: String,
        userName: String,
        profileImageId: String?,
    )
}

class DefaultProfileDetailsComponent(
    private val componentContext: ComponentContext,
    private val userRepository: IUserRepository,
    private val imageRepository: IImagesRepository,
    private val onNavigateBack: () -> Unit,
    private val navigationHandler: INavigationHandler,
) : ProfileDetailsComponent, PaymentProcessor(), ComponentContext by componentContext {
    private val scope = coroutineScope(Dispatchers.Main + SupervisorJob())
    private val _errorState = MutableStateFlow<ErrorMessage?>(null)
    override val errorState = _errorState.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    override val message = _message.asStateFlow()

    private val _lastUploadedImageId = MutableStateFlow<String?>(null)
    override val lastUploadedImageId = _lastUploadedImageId.asStateFlow()

    override val currentUser = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = UserData()
        )

    override val currentAccount = userRepository.currentAccount
        .map { result -> result.getOrElse {
            userRepository.getCurrentAccount()
            AuthAccount.empty()
        } }
        .stateIn(
            scope = scope,
            started = SharingStarted.Eagerly,
            initialValue = AuthAccount.empty()
        )

    private lateinit var loadingHandler: LoadingHandler

    override fun onBackClicked() {
        onNavigateBack()
    }

    override fun setLoadingHandler(loadingHandler: LoadingHandler) {
        this.loadingHandler = loadingHandler
    }

    override fun onUploadSelected(photo: GalleryPhotoResult) {
        scope.launch {
            if (::loadingHandler.isInitialized) {
                loadingHandler.showLoading("Uploading image...")
            }
            imageRepository.uploadImage(convertPhotoResultToUploadFile(photo))
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to upload image: ${error.userMessage()}")
                }
                .onSuccess { imageId ->
                    _lastUploadedImageId.value = imageId
                }
            if (::loadingHandler.isInitialized) {
                loadingHandler.hideLoading()
            }
        }
    }

    override fun consumeUploadedImageSelection() {
        _lastUploadedImageId.value = null
    }

    override fun deleteImage(imageId: String) {
        scope.launch {
            if (::loadingHandler.isInitialized) {
                loadingHandler.showLoading("Deleting image...")
            }
            imageRepository.deleteImage(imageId)
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to delete image: ${error.userMessage()}")
                }
                .onSuccess {
                    _message.value = "Image deleted"
                }
            if (::loadingHandler.isInitialized) {
                loadingHandler.hideLoading()
            }
        }
    }

    override fun deleteAccount(confirmationText: String) {
        scope.launch {
            if (::loadingHandler.isInitialized) {
                loadingHandler.showLoading("Deleting account...")
            }
            userRepository.deleteAccount(confirmationText)
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to delete account: ${error.userMessage()}")
                }
                .onSuccess {
                    navigationHandler.navigateToLogin()
                }
            if (::loadingHandler.isInitialized) {
                loadingHandler.hideLoading()
            }
        }
    }

    override fun updateProfile(
        firstName: String,
        lastName: String,
        email: String,
        currentPassword: String,
        newPassword: String,
        userName: String,
        profileImageId: String?,
    ) {
        scope.launch {
            loadingHandler.showLoading("Updating Profile...")
            userRepository.updateProfile(
                firstName = firstName,
                lastName = lastName,
                email = email,
                currentPassword = currentPassword,
                newPassword = newPassword,
                userName = userName,
                profileImageId = profileImageId,
            )
                .onFailure { error ->
                    _errorState.value = ErrorMessage("Failed to update profile: ${error.userMessage()}")
                }
                .onSuccess {
                    _message.value = "Profile updated successfully"
                }
            loadingHandler.hideLoading()
        }
    }
}
