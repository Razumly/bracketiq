package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

const val MATCH_OPERATION_STATUS_PENDING = "PENDING"
const val MATCH_OPERATION_STATUS_SYNCING = "SYNCING"
const val MATCH_OPERATION_STATUS_ACKED = "ACKED"
const val MATCH_OPERATION_STATUS_FAILED = "FAILED"
const val MATCH_OPERATION_STATUS_REJECTED = "REJECTED"
/** The server rejected the write; only a remote read may reconcile this operation. */
const val MATCH_OPERATION_STATUS_RECONCILING = "RECONCILING"

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
