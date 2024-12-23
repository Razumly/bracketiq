package com.razumly.mvp.core.data.dataTypes

sealed class LoginState {
    data object Initial : LoginState()
    data object Loading : LoginState()
    data object Success : LoginState()
    data class Error(val message: String) : LoginState()
}