package com.razumly.mvp.core.network

import com.russhwolf.settings.ExperimentalSettingsImplementation
import com.russhwolf.settings.KeychainSettings

private const val AUTH_TOKEN_SERVICE = "com.razumly.mvp.auth"
private const val AUTH_TOKEN_KEY = "session_token"

@OptIn(ExperimentalSettingsImplementation::class)
private class IosKeychainAuthTokenStore(
    private val settings: KeychainSettings = KeychainSettings(service = AUTH_TOKEN_SERVICE),
) : AuthTokenStore {
    override suspend fun get(): String = settings.getStringOrNull(AUTH_TOKEN_KEY).orEmpty()

    override suspend fun set(token: String) {
        if (token.isBlank()) {
            settings.remove(AUTH_TOKEN_KEY)
        } else {
            settings.putString(AUTH_TOKEN_KEY, token)
        }
    }

    override suspend fun clear() {
        settings.remove(AUTH_TOKEN_KEY)
    }
}

@OptIn(ExperimentalSettingsImplementation::class)
actual fun createSecureAuthTokenStore(): AuthTokenStore = IosKeychainAuthTokenStore()
