package com.razumly.mvp.userAuth

import androidx.activity.ComponentActivity
import android.util.Log
import com.razumly.mvp.core.data.dataTypes.LoginState
import com.razumly.mvp.core.data.oauth2Login
import io.github.aakira.napier.Napier
import kotlinx.coroutines.launch

private const val AUTH_LOG_TAG = "AuthLogin"

fun DefaultAuthComponent.oauth2Login(activity: ComponentActivity) {
    scope.launch {
        Napier.d("Auth: Google sign-in started")
        _loginState.value = LoginState.Loading

        userRepository.oauth2Login(activity).onSuccess {
            Napier.i("Auth: Google sign-in succeeded")
            _loginState.value = LoginState.Success
        }.onFailure { throwable ->
            Napier.e("Auth: Google sign-in failed: ${throwable.message}", throwable)
            Log.e(AUTH_LOG_TAG, "Google sign-in failed: ${throwable.message}", throwable)
            _loginState.value = LoginState.Error("Failed To Login: ${throwable.message}")
        }
    }
}
