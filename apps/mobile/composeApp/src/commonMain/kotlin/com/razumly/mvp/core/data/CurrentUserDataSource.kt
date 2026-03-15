package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class CurrentUserDataSource(private val dataStore: DataStore<Preferences>) {
    private val idKey = stringPreferencesKey("id")
    private val pushToken = stringPreferencesKey("token")
    private val pushTarget = stringPreferencesKey("target")
    private val mutedChatIds = stringPreferencesKey("muted_chat_ids")

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

    suspend fun setChatMuted(chatId: String, muted: Boolean) {
        val normalizedChatId = chatId.trim()
        if (normalizedChatId.isBlank()) return

        dataStore.edit { preferences ->
            val existing = parseIdSet(preferences[mutedChatIds])
            if (muted) {
                existing += normalizedChatId
            } else {
                existing -= normalizedChatId
            }
            preferences[mutedChatIds] = serializeIdSet(existing)
        }
    }

    fun isChatMuted(chatId: String): Flow<Boolean> {
        val normalizedChatId = chatId.trim()
        if (normalizedChatId.isBlank()) return dataStore.data.map { false }

        return dataStore.data.map { preferences ->
            parseIdSet(preferences[mutedChatIds]).contains(normalizedChatId)
        }
    }

    private fun parseIdSet(raw: String?): MutableSet<String> {
        if (raw.isNullOrBlank()) return mutableSetOf()
        return raw
            .split(',')
            .map { value -> value.trim() }
            .filter { value -> value.isNotBlank() }
            .toMutableSet()
    }

    private fun serializeIdSet(ids: Set<String>): String =
        ids
            .asSequence()
            .map { value -> value.trim() }
            .filter { value -> value.isNotBlank() }
            .distinct()
            .sorted()
            .joinToString(",")
}
