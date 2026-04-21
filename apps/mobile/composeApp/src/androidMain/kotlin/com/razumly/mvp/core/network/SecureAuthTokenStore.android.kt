package com.razumly.mvp.core.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.razumly.mvp.MvpApp

private const val AUTH_TOKEN_PREFS_NAME = "secure_auth_token_store"
private const val AUTH_TOKEN_FALLBACK_PREFS_NAME = "auth_token_store"
private const val AUTH_TOKEN_KEY = "auth_token"

private abstract class AndroidSharedPreferencesAuthTokenStore(
) : AuthTokenStore {
    protected abstract val sharedPreferences: SharedPreferences

    override suspend fun get(): String = sharedPreferences.getString(AUTH_TOKEN_KEY, "").orEmpty()

    override suspend fun set(token: String) {
        sharedPreferences.edit().putString(AUTH_TOKEN_KEY, token).apply()
    }

    override suspend fun clear() {
        sharedPreferences.edit().remove(AUTH_TOKEN_KEY).apply()
    }
}

private class AndroidSecureAuthTokenStore(
    context: Context,
) : AndroidSharedPreferencesAuthTokenStore() {
    override val sharedPreferences: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        AUTH_TOKEN_PREFS_NAME,
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
}

private class AndroidJvmFallbackAuthTokenStore(
    context: Context,
) : AndroidSharedPreferencesAuthTokenStore() {
    override val sharedPreferences: SharedPreferences =
        context.getSharedPreferences(AUTH_TOKEN_FALLBACK_PREFS_NAME, Context.MODE_PRIVATE)
}

private fun isRobolectricEnvironment(): Boolean = runCatching {
    Class.forName("org.robolectric.RuntimeEnvironment")
}.isSuccess

actual fun createSecureAuthTokenStore(): AuthTokenStore {
    val context = MvpApp.applicationContext()
    return if (isRobolectricEnvironment()) {
        AndroidJvmFallbackAuthTokenStore(context)
    } else {
        AndroidSecureAuthTokenStore(context)
    }
}
