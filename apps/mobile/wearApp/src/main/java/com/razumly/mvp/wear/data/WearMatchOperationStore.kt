package com.razumly.mvp.wear.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID

const val WEAR_MATCH_OPERATION_KIND_PATCH = "MATCH_UPDATE"
const val WEAR_MATCH_OPERATION_KIND_SCORE_SET = "SCORE_SET"
const val WEAR_MATCH_OPERATION_STATUS_PENDING = "PENDING"
const val WEAR_MATCH_OPERATION_STATUS_SYNCING = "SYNCING"
const val WEAR_MATCH_OPERATION_STATUS_FAILED = "FAILED"
const val WEAR_MATCH_OPERATION_STATUS_IMPORTED = "IMPORTED"

@Serializable
data class WearPendingMatchOperation(
    val id: String,
    val eventId: String,
    val matchId: String,
    val kind: String,
    val payloadJson: String,
    val clientDeviceId: String,
    val clientCreatedAt: String,
    val clientSequence: Long,
    val sourceDevice: String = "WEAR_OS",
    val status: String = WEAR_MATCH_OPERATION_STATUS_PENDING,
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val lastAttemptAt: String? = null,
)

@Serializable
private data class WearPendingMatchOperationList(
    val operations: List<WearPendingMatchOperation> = emptyList(),
)

@Serializable
private data class WearMatchCache(
    val schedule: WearScheduleResponseDto? = null,
    val matches: Map<String, WearMatchDto> = emptyMap(),
)

internal data class WearMatchOperationStoreSnapshot(
    val deviceId: String? = null,
    val lastSequence: Long = 0L,
    val operationsJson: String? = null,
    val cacheJson: String? = null,
)

internal interface WearMatchOperationStorage {
    fun snapshot(): WearMatchOperationStoreSnapshot

    fun replace(snapshot: WearMatchOperationStoreSnapshot)

    fun clear()
}

private class SharedPreferencesWearMatchOperationStorage(
    private val preferences: SharedPreferences,
) : WearMatchOperationStorage {
    override fun snapshot(): WearMatchOperationStoreSnapshot = WearMatchOperationStoreSnapshot(
        deviceId = preferences.getString(KEY_DEVICE_ID, null),
        lastSequence = preferences.getLong(KEY_LAST_SEQUENCE, 0L),
        operationsJson = preferences.getString(KEY_OPERATIONS, null),
        cacheJson = preferences.getString(KEY_CACHE, null),
    )

    override fun replace(snapshot: WearMatchOperationStoreSnapshot) {
        val editor = preferences.edit()
        editor.putOrRemove(KEY_DEVICE_ID, snapshot.deviceId)
        editor.putLong(KEY_LAST_SEQUENCE, snapshot.lastSequence)
        editor.putOrRemove(KEY_OPERATIONS, snapshot.operationsJson)
        editor.putOrRemove(KEY_CACHE, snapshot.cacheJson)
        check(editor.commit()) { "Failed to persist Wear match operations." }
    }

    override fun clear() {
        check(preferences.edit().clear().commit()) { "Failed to clear Wear match operations." }
    }

    private fun SharedPreferences.Editor.putOrRemove(key: String, value: String?) {
        if (value == null) remove(key) else putString(key, value)
    }

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_LAST_SEQUENCE = "last_sequence"
        const val KEY_OPERATIONS = "operations"
        const val KEY_CACHE = "cache"
    }
}

class WearMatchOperationStore internal constructor(
    private val storage: WearMatchOperationStorage,
    private val json: Json = createWearJson(),
) {
    constructor(
        context: Context,
        json: Json = createWearJson(),
    ) : this(
        storage = SharedPreferencesWearMatchOperationStorage(
            context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE),
        ),
        json = json,
    )

    fun clear() = serialized {
        storage.clear()
    }

    fun deviceId(): String = serialized {
        val snapshot = storage.snapshot()
        snapshot.deviceId.normalizedId()?.let { return@serialized it }
        val generated = "wear-${UUID.randomUUID()}"
        storage.replace(snapshot.copy(deviceId = generated))
        generated
    }

    fun newOperation(
        eventId: String,
        matchId: String,
        kind: String,
        payloadJson: String,
    ): WearPendingMatchOperation = serialized {
        val snapshot = storage.snapshot()
        val sequence = (snapshot.lastSequence + 1L).coerceAtLeast(
            (decodeOperations(snapshot).maxOfOrNull { it.clientSequence } ?: 0L) + 1L,
        )
        val deviceId = snapshot.deviceId.normalizedId() ?: "wear-${UUID.randomUUID()}"
        storage.replace(snapshot.copy(deviceId = deviceId, lastSequence = sequence))
        WearPendingMatchOperation(
            id = "$deviceId:$matchId:$sequence",
            eventId = eventId,
            matchId = matchId,
            kind = kind,
            payloadJson = payloadJson,
            clientDeviceId = deviceId,
            clientCreatedAt = Instant.now().toString(),
            clientSequence = sequence,
        )
    }

    fun upsertOperation(operation: WearPendingMatchOperation) = serialized {
        val snapshot = storage.snapshot()
        val next = decodeOperations(snapshot)
            .filterNot { it.id == operation.id }
            .plus(operation)
            .sortedWith(compareBy<WearPendingMatchOperation> { it.clientSequence }.thenBy { it.clientCreatedAt })
        writeOperations(snapshot, next)
    }

    fun pendingOperations(matchId: String? = null): List<WearPendingMatchOperation> = serialized {
        val normalizedMatchId = matchId.normalizedId()
        val statuses = setOf(
            WEAR_MATCH_OPERATION_STATUS_PENDING,
            WEAR_MATCH_OPERATION_STATUS_FAILED,
            WEAR_MATCH_OPERATION_STATUS_SYNCING,
        )
        decodeOperations(storage.snapshot())
            .asSequence()
            .filter { it.sourceDevice.equals("WEAR_OS", ignoreCase = true) }
            .filter { it.status in statuses }
            .filter { normalizedMatchId == null || it.matchId.normalizedId() == normalizedMatchId }
            .sortedWith(compareBy<WearPendingMatchOperation> { it.clientSequence }.thenBy { it.clientCreatedAt })
            .toList()
    }

    fun localOverlayOperations(matchId: String? = null): List<WearPendingMatchOperation> = serialized {
        val normalizedMatchId = matchId.normalizedId()
        val statuses = setOf(
            WEAR_MATCH_OPERATION_STATUS_PENDING,
            WEAR_MATCH_OPERATION_STATUS_FAILED,
            WEAR_MATCH_OPERATION_STATUS_SYNCING,
            WEAR_MATCH_OPERATION_STATUS_IMPORTED,
        )
        decodeOperations(storage.snapshot())
            .asSequence()
            .filter { it.status in statuses }
            .filter { normalizedMatchId == null || it.matchId.normalizedId() == normalizedMatchId }
            .sortedWith(
                compareBy<WearPendingMatchOperation> { it.clientCreatedAt }
                    .thenBy { it.clientDeviceId }
                    .thenBy { it.clientSequence },
            )
            .toList()
    }

    fun markAttempting(operationId: String) {
        updateOperation(operationId) { operation ->
            operation.copy(
                status = WEAR_MATCH_OPERATION_STATUS_SYNCING,
                attemptCount = operation.attemptCount + 1,
                lastAttemptAt = Instant.now().toString(),
                lastError = null,
            )
        }
    }

    fun markFailed(operationId: String, error: String) {
        updateOperation(operationId) { operation ->
            operation.copy(
                status = WEAR_MATCH_OPERATION_STATUS_FAILED,
                lastAttemptAt = Instant.now().toString(),
                lastError = error,
            )
        }
    }

    fun markAcked(operationId: String) = serialized {
        val snapshot = storage.snapshot()
        writeOperations(snapshot, decodeOperations(snapshot).filterNot { it.id == operationId })
    }

    fun cacheSchedule(schedule: WearScheduleResponseDto) = serialized {
        val snapshot = storage.snapshot()
        writeCache(snapshot, decodeCache(snapshot).copy(schedule = schedule))
    }

    fun cachedSchedule(): WearScheduleResponseDto? = serialized {
        decodeCache(storage.snapshot()).schedule
    }

    fun cacheMatch(match: WearMatchDto) = serialized {
        val matchId = match.resolvedId() ?: return@serialized
        val snapshot = storage.snapshot()
        val current = decodeCache(snapshot)
        writeCache(snapshot, current.copy(matches = current.matches + (matchId to match)))
    }

    fun cachedMatches(): Map<String, WearMatchDto> = serialized {
        decodeCache(storage.snapshot()).matches
    }

    fun pruneCachedMatches(retainedMatchIds: Set<String>) = serialized {
        val snapshot = storage.snapshot()
        val current = decodeCache(snapshot)
        val retained = current.matches.filterKeys { matchId -> matchId in retainedMatchIds }
        if (retained.size != current.matches.size) {
            writeCache(snapshot, current.copy(matches = retained))
        }
    }

    private fun updateOperation(
        operationId: String,
        update: (WearPendingMatchOperation) -> WearPendingMatchOperation,
    ) = serialized {
        val snapshot = storage.snapshot()
        writeOperations(
            snapshot,
            decodeOperations(snapshot).map { operation ->
                if (operation.id == operationId) update(operation) else operation
            },
        )
    }

    private fun decodeOperations(snapshot: WearMatchOperationStoreSnapshot): List<WearPendingMatchOperation> {
        val raw = snapshot.operationsJson?.takeIf(String::isNotBlank) ?: return emptyList()
        return json.decodeFromString<WearPendingMatchOperationList>(raw).operations
    }

    private fun writeOperations(
        snapshot: WearMatchOperationStoreSnapshot,
        operations: List<WearPendingMatchOperation>,
    ) {
        storage.replace(
            snapshot.copy(
                operationsJson = json.encodeToString(WearPendingMatchOperationList(operations)),
            ),
        )
    }

    private fun decodeCache(snapshot: WearMatchOperationStoreSnapshot): WearMatchCache {
        val raw = snapshot.cacheJson?.takeIf(String::isNotBlank) ?: return WearMatchCache()
        return json.decodeFromString<WearMatchCache>(raw)
    }

    private fun writeCache(snapshot: WearMatchOperationStoreSnapshot, cache: WearMatchCache) {
        storage.replace(snapshot.copy(cacheJson = json.encodeToString(cache)))
    }

    private inline fun <T> serialized(block: () -> T): T = synchronized(STORE_LOCK, block)

    private companion object {
        const val PREFERENCES_NAME = "mvp_wear_match_operations"
        val STORE_LOCK = Any()
    }
}
