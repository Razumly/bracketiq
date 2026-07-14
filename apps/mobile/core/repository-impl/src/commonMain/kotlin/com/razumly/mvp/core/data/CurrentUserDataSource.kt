package com.razumly.mvp.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
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
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private const val REGISTRATION_PROGRESS_VERSION = 1
private const val REGISTRATION_PROGRESS_LEGACY_PREFIX = "registration_progress_"
private const val REGISTRATION_PROGRESS_ACCOUNT_PREFIX = "account_registration_progress_"
private val REGISTRATION_PROGRESS_MAX_AGE = 24.hours

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

class CurrentUserDataSource(
    private val dataStore: DataStore<Preferences>,
    private val now: () -> Instant = { Clock.System.now() },
) {
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

    suspend fun clearPushDeviceTarget() {
        dataStore.edit { preferences ->
            preferences.remove(pushToken)
            preferences.remove(pushTarget)
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
            val accountId = preferences[idKey]
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: return@edit
            if (draft.userId.trim().isBlank()) return@edit

            val evaluatedAt = now()
            preferences.purgeInvalidRegistrationProgress(evaluatedAt)
            val scopedKey = registrationProgressKey(accountId, normalizedKey)
            if (!draft.isWithinRegistrationProgressLifetime(evaluatedAt)) {
                preferences.remove(scopedKey)
                return@edit
            }

            preferences[scopedKey] = jsonMVP.encodeToString(draft)
            val legacyKey = legacyRegistrationProgressKey(normalizedKey)
            preferences[legacyKey]
                ?.decodeRegistrationProgressDraft()
                ?.takeIf { legacyDraft -> legacyDraft.userId.trim() == accountId }
                ?.let { preferences.remove(legacyKey) }
        }
    }

    suspend fun loadRegistrationProgress(key: String): RegistrationProgressDraft? {
        val normalizedKey = key.trim().takeIf(String::isNotBlank) ?: return null
        var restoredDraft: RegistrationProgressDraft? = null
        dataStore.edit { preferences ->
            val accountId = preferences[idKey]
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: return@edit
            val evaluatedAt = now()
            preferences.purgeInvalidRegistrationProgress(evaluatedAt)

            val scopedKey = registrationProgressKey(accountId, normalizedKey)
            val legacyKey = legacyRegistrationProgressKey(normalizedKey)
            val scopedRaw = preferences[scopedKey]
            val isLegacy = scopedRaw == null
            val raw = scopedRaw ?: preferences[legacyKey] ?: return@edit
            val draft = raw.decodeRegistrationProgressDraft()
            if (
                draft == null ||
                (isLegacy && draft.userId.trim() != accountId) ||
                !draft.isWithinRegistrationProgressLifetime(evaluatedAt)
            ) {
                if (isLegacy) {
                    if (draft == null || draft.userId.trim() == accountId) {
                        preferences.remove(legacyKey)
                    }
                } else {
                    preferences.remove(scopedKey)
                }
                return@edit
            }

            if (isLegacy) {
                preferences[scopedKey] = raw
                preferences.remove(legacyKey)
            }
            restoredDraft = draft
        }
        return restoredDraft
    }

    suspend fun clearRegistrationProgress(key: String) {
        val normalizedKey = key.trim().takeIf(String::isNotBlank) ?: return
        dataStore.edit { preferences ->
            val accountId = preferences[idKey]
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: return@edit
            preferences.remove(registrationProgressKey(accountId, normalizedKey))

            val legacyKey = legacyRegistrationProgressKey(normalizedKey)
            val legacyDraft = preferences[legacyKey]?.decodeRegistrationProgressDraft()
            if (legacyDraft == null || legacyDraft.userId.trim() == accountId) {
                preferences.remove(legacyKey)
            }
        }
    }

    suspend fun clearRegistrationProgressForAccount(accountId: String) {
        val normalizedAccountId = accountId.trim().takeIf(String::isNotBlank) ?: return
        val accountPrefix = registrationProgressAccountPrefix(normalizedAccountId)
        dataStore.edit { preferences ->
            val evaluatedAt = now()
            preferences.asMap().toList().forEach { (key, value) ->
                val keyName = key.name
                val draft = (value as? String)?.decodeRegistrationProgressDraft()
                val shouldRemove = when {
                    keyName.startsWith(accountPrefix) -> true
                    keyName.startsWith(REGISTRATION_PROGRESS_LEGACY_PREFIX) ->
                        draft == null ||
                            !draft.isWithinRegistrationProgressLifetime(evaluatedAt) ||
                            draft.userId.trim() == normalizedAccountId
                    keyName.startsWith(REGISTRATION_PROGRESS_ACCOUNT_PREFIX) ->
                        draft == null || !draft.isWithinRegistrationProgressLifetime(evaluatedAt)
                    else -> false
                }
                if (shouldRemove) {
                    preferences.removeUntyped(key)
                }
            }
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

    private fun registrationProgressAccountPrefix(accountId: String): String =
        "$REGISTRATION_PROGRESS_ACCOUNT_PREFIX${accountId.length}:$accountId:"

    private fun registrationProgressKey(accountId: String, key: String) =
        stringPreferencesKey("${registrationProgressAccountPrefix(accountId)}$key")

    private fun legacyRegistrationProgressKey(key: String) =
        stringPreferencesKey("$REGISTRATION_PROGRESS_LEGACY_PREFIX$key")

    private fun String.decodeRegistrationProgressDraft(): RegistrationProgressDraft? =
        trim()
            .takeIf(String::isNotBlank)
            ?.let { raw ->
                runCatching { jsonMVP.decodeFromString<RegistrationProgressDraft>(raw) }.getOrNull()
            }

    private fun MutablePreferences.purgeInvalidRegistrationProgress(evaluatedAt: Instant) {
        asMap().toList().forEach { (key, value) ->
            val keyName = key.name
            if (
                !keyName.startsWith(REGISTRATION_PROGRESS_ACCOUNT_PREFIX) &&
                !keyName.startsWith(REGISTRATION_PROGRESS_LEGACY_PREFIX)
            ) {
                return@forEach
            }

            val draft = (value as? String)?.decodeRegistrationProgressDraft()
            if (draft == null || !draft.isWithinRegistrationProgressLifetime(evaluatedAt)) {
                removeUntyped(key)
            }
        }
    }

    private fun RegistrationProgressDraft.isWithinRegistrationProgressLifetime(evaluatedAt: Instant): Boolean {
        if (version != REGISTRATION_PROGRESS_VERSION) return false
        val lastUpdatedAt = updatedAt
            .trim()
            .takeIf(String::isNotBlank)
            ?.let { raw -> runCatching { Instant.parse(raw) }.getOrNull() }
            ?: return false
        if (lastUpdatedAt > evaluatedAt) return false

        val retentionExpiresAt = lastUpdatedAt.plus(REGISTRATION_PROGRESS_MAX_AGE)
        val rawHoldExpiresAt = holdExpiresAt?.trim()?.takeIf(String::isNotBlank)
        val holdExpiry = rawHoldExpiresAt?.let { raw ->
            runCatching { Instant.parse(raw) }.getOrNull() ?: return false
        }
        val expiresAt = holdExpiry?.takeIf { it < retentionExpiresAt } ?: retentionExpiresAt
        return expiresAt > evaluatedAt
    }

    @Suppress("UNCHECKED_CAST")
    private fun MutablePreferences.removeUntyped(key: Preferences.Key<*>) {
        remove(key as Preferences.Key<Any>)
    }
}
