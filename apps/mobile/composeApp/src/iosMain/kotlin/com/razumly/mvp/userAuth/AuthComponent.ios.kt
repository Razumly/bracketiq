package com.razumly.mvp.userAuth

import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.oauth2Login
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import kotlinx.coroutines.launch

fun DefaultAuthComponent.oauth2Login() {
    scope.launch {
        _loginState.value = LoginState.Loading
        userRepository.oauth2Login().onSuccess {
            _loginState.value = LoginState.Success
        }.onFailure {
            _loginState.value = LoginState.Error("Failed To Login: ${it.message}")
        }
    }
}