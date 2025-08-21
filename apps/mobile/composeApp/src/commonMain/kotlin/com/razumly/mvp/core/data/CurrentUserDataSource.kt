package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.razumly.mvp.core.data.dataTypes.BillingAddress
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class CurrentUserDataSource(private val dataStore: DataStore<Preferences>) {
    private val idKey = stringPreferencesKey("id")
    private val pushToken = stringPreferencesKey("token")
    private val pushTarget = stringPreferencesKey("target")

    suspend fun saveUserId(userId: String) {
        dataStore.edit { dataStore ->
            dataStore[idKey] = userId
        }
    }

    fun getUserId(): Flow<String> {
        return dataStore.data.map {
            it[idKey] ?: ""
        }
    }

    suspend fun savePushToken(token: String) {
        dataStore.edit { dataStore ->
            dataStore[pushToken] = token
        }
    }

    fun getPushToken(): Flow<String> {
        return dataStore.data.map {
            it[pushToken] ?: ""
        }
    }

    suspend fun savePushTarget(target: String) {
        dataStore.edit { dataStore ->
            dataStore[pushTarget] = target
        }
    }

    fun getPushTarget(): Flow<String> {
        return dataStore.data.map {
            it[pushTarget] ?: ""
        }
    }
}