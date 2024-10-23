package com.razumly.mvp.core.presentation

import com.razumly.mvp.core.data.Database
import com.razumly.mvp.core.data.LoginState
import com.razumly.mvp.core.data.UserData
import com.rickclephas.kmp.observableviewmodel.ViewModel
import com.rickclephas.kmp.observableviewmodel.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow

class MainViewModel(private val database: Database) : ViewModel() {
    val currentTournament = flow {
        database.getTournament("665fd4b40001fe3199da")
            ?.let { emit(it) }
    }

    private val _loginState = MutableStateFlow<LoginState>(LoginState.Initial)
    val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    private val _currentUser = MutableStateFlow<UserData?>(null)
    val currentUser: StateFlow<UserData?> = _currentUser.asStateFlow()

    init {
        viewModelScope.launch {
            _currentUser.value = database.getCurrentUser()
            if (_currentUser.value == null) {
                _loginState.value = LoginState.Initial
            } else {
                _loginState.value = LoginState.Success
            }
        }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _loginState.value = LoginState.Loading

            _currentUser.value = database.login(email, password)
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
            database.logout()
            _currentUser.value = null
            _loginState.value = LoginState.Initial
        }
    }

}