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

class WearMatchOperationStore(
    context: Context,
    private val json: Json = createWearJson(),
) {
    private val preferences: SharedPreferences =
        context.getSharedPreferences("mvp_wear_match_operations", Context.MODE_PRIVATE)

    fun clear() {
        preferences.edit().clear().apply()
    }

    fun deviceId(): String {
        preferences.getString(KEY_DEVICE_ID, null).normalizedId()?.let { return it }
        val generated = "wear-${UUID.randomUUID()}"
        preferences.edit().putString(KEY_DEVICE_ID, generated).apply()
        return generated
    }

    fun newOperation(
        eventId: String,
        matchId: String,
        kind: String,
        payloadJson: String,
    ): WearPendingMatchOperation {
        val sequence = nextSequence()
        val deviceId = deviceId()
        return WearPendingMatchOperation(
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

    fun upsertOperation(operation: WearPendingMatchOperation) {
        val next = operations()
            .filterNot { it.id == operation.id }
            .plus(operation)
            .sortedWith(compareBy<WearPendingMatchOperation> { it.clientSequence }.thenBy { it.clientCreatedAt })
        writeOperations(next)
    }

    fun pendingOperations(matchId: String? = null): List<WearPendingMatchOperation> {
        val normalizedMatchId = matchId.normalizedId()
        val statuses = setOf(
            WEAR_MATCH_OPERATION_STATUS_PENDING,
            WEAR_MATCH_OPERATION_STATUS_FAILED,
            WEAR_MATCH_OPERATION_STATUS_SYNCING,
        )
        return operations()
            .asSequence()
            .filter { it.sourceDevice.equals("WEAR_OS", ignoreCase = true) }
            .filter { it.status in statuses }
            .filter { normalizedMatchId == null || it.matchId.normalizedId() == normalizedMatchId }
            .sortedWith(compareBy<WearPendingMatchOperation> { it.clientSequence }.thenBy { it.clientCreatedAt })
            .toList()
    }

    fun localOverlayOperations(matchId: String? = null): List<WearPendingMatchOperation> {
        val normalizedMatchId = matchId.normalizedId()
        val statuses = setOf(
            WEAR_MATCH_OPERATION_STATUS_PENDING,
            WEAR_MATCH_OPERATION_STATUS_FAILED,
            WEAR_MATCH_OPERATION_STATUS_SYNCING,
            WEAR_MATCH_OPERATION_STATUS_IMPORTED,
        )
        return operations()
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

    fun markAcked(operationId: String) {
        writeOperations(operations().filterNot { it.id == operationId })
    }

    fun cacheSchedule(schedule: WearScheduleResponseDto) {
        writeCache(cache().copy(schedule = schedule))
    }

    fun cachedSchedule(): WearScheduleResponseDto? = cache().schedule

    fun cacheMatch(match: WearMatchDto) {
        val matchId = match.resolvedId() ?: return
        val current = cache()
        writeCache(current.copy(matches = current.matches + (matchId to match)))
    }

    fun cachedMatches(): Map<String, WearMatchDto> = cache().matches

    fun pruneCachedMatches(retainedMatchIds: Set<String>) {
        val current = cache()
        val retained = current.matches.filterKeys { matchId -> matchId in retainedMatchIds }
        if (retained.size == current.matches.size) return
        writeCache(current.copy(matches = retained))
    }

    private fun nextSequence(): Long {
        val next = (preferences.getLong(KEY_LAST_SEQUENCE, 0L) + 1L).coerceAtLeast(
            (operations().maxOfOrNull { it.clientSequence } ?: 0L) + 1L,
        )
        preferences.edit().putLong(KEY_LAST_SEQUENCE, next).apply()
        return next
    }

    private fun operations(): List<WearPendingMatchOperation> =
        runCatching {
            json.decodeFromString<WearPendingMatchOperationList>(
                preferences.getString(KEY_OPERATIONS, null).orEmpty(),
            ).operations
        }.getOrDefault(emptyList())

    private fun writeOperations(operations: List<WearPendingMatchOperation>) {
        preferences.edit()
            .putString(KEY_OPERATIONS, json.encodeToString(WearPendingMatchOperationList(operations)))
            .apply()
    }

    private fun updateOperation(
        operationId: String,
        update: (WearPendingMatchOperation) -> WearPendingMatchOperation,
    ) {
        writeOperations(operations().map { operation ->
            if (operation.id == operationId) update(operation) else operation
        })
    }

    private fun cache(): WearMatchCache =
        runCatching {
            json.decodeFromString<WearMatchCache>(
                preferences.getString(KEY_CACHE, null).orEmpty(),
            )
        }.getOrDefault(WearMatchCache())

    private fun writeCache(cache: WearMatchCache) {
        preferences.edit()
            .putString(KEY_CACHE, json.encodeToString(cache))
            .apply()
    }

    companion object {
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_LAST_SEQUENCE = "last_sequence"
        private const val KEY_OPERATIONS = "operations"
        private const val KEY_CACHE = "cache"
    }
}
