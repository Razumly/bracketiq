package com.razumly.mvp.userAuth

import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.appleLogin
import com.razumly.mvp.core.data.oauth2Login
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.network.userMessage
import kotlinx.coroutines.launch

fun DefaultAuthComponent.oauth2Login() {
    scope.launch {
        _loginState.value = LoginState.Loading
        userRepository.oauth2Login().onSuccess {
            _loginState.value = LoginState.Success
        }.onFailure { throwable ->
            _loginState.value = LoginState.Error(
                throwable.userMessage("Couldn't sign in with Google.")
            )
        }
    }
}

fun DefaultAuthComponent.appleLogin() {
    scope.launch {
        _loginState.value = LoginState.Loading
        userRepository.appleLogin().onSuccess {
            _loginState.value = LoginState.Success
        }.onFailure { throwable ->
            _loginState.value = LoginState.Error(
                throwable.userMessage("Couldn't sign in with Apple.")
            )
        }
    }
}
