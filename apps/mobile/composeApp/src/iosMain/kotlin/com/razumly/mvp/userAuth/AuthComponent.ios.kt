package com.razumly.mvp.userAuth

import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.oauth2Login
import kotlinx.coroutines.launch

fun DefaultAuthComponent.oauth2Login() {
    scope.launch {
        _loginState.value = LoginState.Loading

        _currentUser.value = userRepository.oauth2Login()
        if (_currentUser.value == null) {
            _loginState.value = LoginState.Error("Invalid email or password")
        } else {
            _loginState.value = LoginState.Success
        }
    }
}