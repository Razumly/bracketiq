package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.IMVPRepository
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.dataTypes.UserData
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.MutableStateFlow
import com.rickclephas.kmp.observableviewmodel.launch
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.DeniedAlwaysException
import dev.icerock.moko.permissions.DeniedException
import dev.icerock.moko.permissions.Permission
import dev.icerock.moko.permissions.PermissionsController
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MainViewModel(
    private val appwriteRepository: IMVPRepository,
    val permissionsController: PermissionsController,
    val locationTracker: LocationTracker
) : ViewModel() {

    private val _loginState = MutableStateFlow<LoginState>(viewModelScope, LoginState.Initial)
    val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    private val _currentUser = MutableStateFlow<UserData?>(viewModelScope, null)
    val currentUser: StateFlow<UserData?> = _currentUser.asStateFlow()

    init {
        viewModelScope.launch {
            _currentUser.value = appwriteRepository.getCurrentUser()
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Initial
            } else {
                _loginState.value = LoginState.Success
            }

            try {
                permissionsController.providePermission(Permission.LOCATION)
            } catch (deniedAlways: DeniedAlwaysException) {
                // Permission is always denied.
            } catch (denied: DeniedException) {
                // Permission was denied.
            }
        }
    }

    fun onStopTracking() {
        locationTracker.stopTracking()
    }

    fun onStartTracking() {
        viewModelScope.launch {
            try {
                permissionsController.providePermission(Permission.LOCATION)
                locationTracker.startTracking()
            } catch (e: Exception) {
                // Handle permission denied
            }
        }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _loginState.value = LoginState.Loading

            _currentUser.value = appwriteRepository.login(email, password)
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Error("Invalid email or password")
                return@launch
            } else {
                _loginState.value = LoginState.Success
            }

        }
    }

    fun logout() {
        viewModelScope.launch {
            appwriteRepository.logout()
            _currentUser.value = null
            _loginState.value = LoginState.Initial
        }
    }


}