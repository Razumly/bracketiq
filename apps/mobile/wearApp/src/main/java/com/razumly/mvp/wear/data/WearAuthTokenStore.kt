package com.razumly.mvp.wear.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class WearAuthTokenStore(context: Context) {
    private val preferences: SharedPreferences = runCatching {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "mvp_wear_auth",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }.getOrElse {
        context.getSharedPreferences("mvp_wear_auth_fallback", Context.MODE_PRIVATE)
    }

    fun token(): String = preferences.getString(KEY_TOKEN, null).orEmpty()

    fun currentUserId(): String? = preferences.getString(KEY_USER_ID, null).normalizedId()

    fun currentUserLabel(): String? = preferences.getString(KEY_USER_LABEL, null).normalizedText()

    fun save(token: String, userId: String?, label: String?) {
        preferences.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USER_LABEL, label)
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    companion object {
        private const val KEY_TOKEN = "token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_LABEL = "user_label"
    }
}
