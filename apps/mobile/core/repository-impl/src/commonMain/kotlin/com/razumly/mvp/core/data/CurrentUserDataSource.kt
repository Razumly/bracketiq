package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.razumly.mvp.core.util.jsonMVP
import com.razumly.mvp.core.util.newId
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlin.time.Clock
import kotlin.time.Instant

@Serializable
data class RegistrationProgressDraft(
    val version: Int = 1,
    val scope: String,
    val userId: String,
    val eventId: String,
    val step: String? = null,
    val answers: Map<String, String> = emptyMap(),
    val selectedDivisionId: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val registrationId: String? = null,
    val holdExpiresAt: String? = null,
    val updatedAt: String,
)

class CurrentUserDataSource(private val dataStore: DataStore<Preferences>) {
    private val idKey = stringPreferencesKey("id")
    private val pushToken = stringPreferencesKey("token")
    private val pushTarget = stringPreferencesKey("target")
    private val mutedChatIds = stringPreferencesKey("muted_chat_ids")
    private val registrationSyncStartedAt = stringPreferencesKey("registration_sync_started_at")
    private val registrationSyncUserId = stringPreferencesKey("registration_sync_user_id")
    private val dismissedAppReleaseKey = stringPreferencesKey("dismissed_app_release_key")
    private val completedGuideIds = stringPreferencesKey("completed_guide_ids")
    private val matchOperationDeviceId = stringPreferencesKey("match_operation_device_id")

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

    suspend fun getUserIdNow(): String =
        dataStore.data.first()[idKey].orEmpty()

    suspend fun getOrCreateMatchOperationDeviceId(): String {
        val existing = dataStore.data.first()[matchOperationDeviceId]
            ?.trim()
            ?.takeIf(String::isNotBlank)
        if (existing != null) return existing

        val created = newId()
        dataStore.edit { preferences ->
            if (preferences[matchOperationDeviceId].isNullOrBlank()) {
                preferences[matchOperationDeviceId] = created
            }
        }
        return dataStore.data.first()[matchOperationDeviceId].orEmpty().ifBlank { created }
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

    suspend fun getRegistrationSyncStartedAt(): Instant? =
        dataStore.data.first()[registrationSyncStartedAt]
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { raw -> runCatching { Instant.parse(raw) }.getOrNull() }

    suspend fun getRegistrationSyncUserId(): String? =
        dataStore.data.first()[registrationSyncUserId]
            ?.trim()
            ?.takeIf(String::isNotBlank)

    suspend fun saveRegistrationSyncState(
        userId: String,
        startedAt: Instant,
    ) {
        val normalizedUserId = userId.trim()
        if (normalizedUserId.isBlank()) return
        dataStore.edit { preferences ->
            preferences[registrationSyncUserId] = normalizedUserId
            preferences[registrationSyncStartedAt] = startedAt.toString()
        }
    }

    suspend fun clearRegistrationSyncState() {
        dataStore.edit { preferences ->
            preferences.remove(registrationSyncUserId)
            preferences.remove(registrationSyncStartedAt)
        }
    }

    suspend fun saveDismissedAppReleaseKey(releaseKey: String) {
        val normalizedReleaseKey = releaseKey.trim()
        if (normalizedReleaseKey.isBlank()) return
        dataStore.edit { preferences ->
            preferences[dismissedAppReleaseKey] = normalizedReleaseKey
        }
    }

    suspend fun getDismissedAppReleaseKeyNow(): String =
        dataStore.data.first()[dismissedAppReleaseKey].orEmpty()

    fun getCompletedGuideIds(): Flow<Set<String>> =
        dataStore.data.map { preferences ->
            parseIdSet(preferences[completedGuideIds])
        }

    suspend fun markGuideCompleted(guideId: String) {
        val normalizedGuideId = guideId.trim()
        if (normalizedGuideId.isBlank()) return
        dataStore.edit { preferences ->
            val existing = parseIdSet(preferences[completedGuideIds])
            existing += normalizedGuideId
            preferences[completedGuideIds] = serializeIdSet(existing)
        }
    }

    suspend fun clearCompletedGuideIds() {
        dataStore.edit { preferences ->
            preferences.remove(completedGuideIds)
        }
    }

    suspend fun saveRegistrationProgress(
        key: String,
        draft: RegistrationProgressDraft,
    ) {
        val normalizedKey = key.trim().takeIf(String::isNotBlank) ?: return
        dataStore.edit { preferences ->
            preferences[registrationProgressKey(normalizedKey)] = jsonMVP.encodeToString(draft)
        }
    }

    suspend fun loadRegistrationProgress(key: String): RegistrationProgressDraft? {
        val normalizedKey = key.trim().takeIf(String::isNotBlank) ?: return null
        val preferenceKey = registrationProgressKey(normalizedKey)
        val raw = dataStore.data.first()[preferenceKey]?.trim()?.takeIf(String::isNotBlank) ?: return null
        val draft = runCatching { jsonMVP.decodeFromString<RegistrationProgressDraft>(raw) }.getOrNull()
        if (draft == null || draft.version != 1 || draft.isHoldExpired()) {
            clearRegistrationProgress(normalizedKey)
            return null
        }
        return draft
    }

    suspend fun clearRegistrationProgress(key: String) {
        val normalizedKey = key.trim().takeIf(String::isNotBlank) ?: return
        dataStore.edit { preferences ->
            preferences.remove(registrationProgressKey(normalizedKey))
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

    private fun registrationProgressKey(key: String) =
        stringPreferencesKey("registration_progress_$key")

    private fun RegistrationProgressDraft.isHoldExpired(): Boolean {
        val rawHoldExpiresAt = holdExpiresAt?.trim()?.takeIf(String::isNotBlank) ?: return false
        val expiresAt = runCatching { Instant.parse(rawHoldExpiresAt) }.getOrNull() ?: return false
        return expiresAt <= Clock.System.now()
    }
}
