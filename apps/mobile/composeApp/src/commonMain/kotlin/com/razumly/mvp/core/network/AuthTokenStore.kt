package com.razumly.mvp.core.network

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first

interface AuthTokenStore {
    suspend fun get(): String
    suspend fun set(token: String)
    suspend fun clear()
}

class DataStoreAuthTokenStore(
    private val dataStore: DataStore<Preferences>,
) : AuthTokenStore {
    private val tokenKey = stringPreferencesKey("auth_token")

    override suspend fun get(): String = dataStore.data.first()[tokenKey] ?: ""

    override suspend fun set(token: String) {
        dataStore.edit { prefs ->
            prefs[tokenKey] = token
        }
    }

    override suspend fun clear() {
        dataStore.edit { prefs ->
            prefs.remove(tokenKey)
        }
    }
}

