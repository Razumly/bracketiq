package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class CurrentUserDataSource(private val dataStore: DataStore<Preferences>) {
    private val idKey = stringPreferencesKey("id")

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
}