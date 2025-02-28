package com.razumly.mvp.userAuth.loginScreen

import androidx.activity.ComponentActivity
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.oauth2Login
import kotlinx.coroutines.launch

fun AuthComponent.oauth2Login(activity: ComponentActivity) {
    scope.launch {
        _loginState.value = LoginState.Loading

        _currentUser.value = mvpRepository.oauth2Login(activity)
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Error("Invalid email or password")
            } else {
                _loginState.value = LoginState.Success
            }
    }
}