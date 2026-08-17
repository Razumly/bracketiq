package com.razumly.mvp.wear.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

private const val WEAR_AUTH_PREFS_NAME = "mvp_wear_auth"
private const val LEGACY_WEAR_AUTH_PREFS_NAME = "mvp_wear_auth_fallback"
private const val WEAR_AUTH_STORAGE_TAG = "WearAuthStorage"
private const val WEAR_AUTH_STORAGE_UNAVAILABLE_MESSAGE =
    "Secure storage is unavailable. Restart the watch app, then try signing in again."

class WearSecureStorageUnavailableException(cause: Throwable) :
    IllegalStateException(WEAR_AUTH_STORAGE_UNAVAILABLE_MESSAGE, cause)

internal interface WearAuthTokenPreferences {
    fun token(): String?
    fun userId(): String?
    fun userLabel(): String?
    fun save(token: String, userId: String?, label: String?)
    fun clear()
}

private class SharedPreferencesWearAuthTokenPreferences(
    private val preferences: SharedPreferences,
) : WearAuthTokenPreferences {
    override fun token(): String? = preferences.getString(KEY_TOKEN, null)

    override fun userId(): String? = preferences.getString(KEY_USER_ID, null)

    override fun userLabel(): String? = preferences.getString(KEY_USER_LABEL, null)

    override fun save(token: String, userId: String?, label: String?) {
        preferences.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USER_LABEL, label)
            .apply()
    }

    override fun clear() {
        preferences.edit().clear().apply()
    }
}

internal sealed interface WearAuthTokenStorage {
    data class Available(val preferences: WearAuthTokenPreferences) : WearAuthTokenStorage
    data class Unavailable(val error: WearSecureStorageUnavailableException) : WearAuthTokenStorage
}

internal fun resolveWearAuthTokenStorage(
    securePreferences: () -> WearAuthTokenPreferences,
): WearAuthTokenStorage = runCatching {
    WearAuthTokenStorage.Available(securePreferences())
}.getOrElse { cause ->
    WearAuthTokenStorage.Unavailable(WearSecureStorageUnavailableException(cause))
}

class WearAuthTokenStore internal constructor(
    private val storage: WearAuthTokenStorage,
) {
    constructor(context: Context) : this(createWearAuthTokenStorage(context.applicationContext))

    val isSecureStorageAvailable: Boolean
        get() = storage is WearAuthTokenStorage.Available

    val unavailableMessage: String?
        get() = (storage as? WearAuthTokenStorage.Unavailable)?.error?.message

    fun token(): String = preferencesOrThrow().token().orEmpty()

    fun currentUserId(): String? = preferencesOrThrow().userId().normalizedId()

    fun currentUserLabel(): String? = preferencesOrThrow().userLabel().normalizedText()

    fun save(token: String, userId: String?, label: String?) {
        preferencesOrThrow().save(token = token, userId = userId, label = label)
    }

    fun clear() {
        (storage as? WearAuthTokenStorage.Available)?.preferences?.clear()
    }

    private fun preferencesOrThrow(): WearAuthTokenPreferences = when (storage) {
        is WearAuthTokenStorage.Available -> storage.preferences
        is WearAuthTokenStorage.Unavailable -> throw storage.error
    }
}

private fun createWearAuthTokenStorage(context: Context): WearAuthTokenStorage {
    retireLegacyPlaintextAuthStore(context)
    val storage = resolveWearAuthTokenStorage {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        SharedPreferencesWearAuthTokenPreferences(
            EncryptedSharedPreferences.create(
                context,
                WEAR_AUTH_PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            ),
        )
    }
    if (storage is WearAuthTokenStorage.Unavailable) {
        Log.e(
            WEAR_AUTH_STORAGE_TAG,
            "Secure auth storage is unavailable; refusing to persist watch authentication.",
            storage.error,
        )
    }
    return storage
}

private fun retireLegacyPlaintextAuthStore(context: Context) {
    runCatching {
        context.deleteSharedPreferences(LEGACY_WEAR_AUTH_PREFS_NAME)
    }.onFailure { error ->
        Log.w(WEAR_AUTH_STORAGE_TAG, "Unable to remove retired plaintext watch auth storage.", error)
    }
}

private const val KEY_TOKEN = "token"
private const val KEY_USER_ID = "user_id"
private const val KEY_USER_LABEL = "user_label"
