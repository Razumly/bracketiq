package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

const val MATCH_OPERATION_STATUS_PENDING = "PENDING"
const val MATCH_OPERATION_STATUS_SYNCING = "SYNCING"
const val MATCH_OPERATION_STATUS_ACKED = "ACKED"
/**
 * A transport or server availability failure. The operation remains an optimistic overlay and
 * can be retried with the same client-operation receipt metadata.
 */
const val MATCH_OPERATION_STATUS_RETRYABLE = "RETRYABLE"

/**
 * A request the authoritative server rejected. It is retained for diagnostics, but must never
 * be retried or re-applied over a fresh server match.
 */
const val MATCH_OPERATION_STATUS_TERMINAL = "TERMINAL"

/**
 * Legacy state written before retryable and terminal failures were distinguished. Existing rows
 * are recovered into RETRYABLE when the outbox next drains.
 */
const val MATCH_OPERATION_STATUS_FAILED = "FAILED"

const val MATCH_OPERATION_KIND_UPDATE = "MATCH_UPDATE"
const val MATCH_OPERATION_KIND_SCORE_SET = "SCORE_SET"
const val MATCH_OPERATION_KIND_INCIDENT_CREATE = "INCIDENT_CREATE"

@Entity(
    indices = [
        Index(value = ["eventId", "matchId"]),
        Index(value = ["status"]),
        Index(value = ["clientSequence"]),
    ],
)
@Serializable
data class MatchOperationOutboxEntry(
    @PrimaryKey val id: String,
    val eventId: String,
    val matchId: String,
    val operationKind: String,
    val payloadJson: String,
    val status: String = MATCH_OPERATION_STATUS_PENDING,
    val sourceDevice: String,
    val clientDeviceId: String,
    val clientSequence: Long,
    val clientCreatedAt: String,
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val lastAttemptAt: String? = null,
    val ackedAt: String? = null,
)
