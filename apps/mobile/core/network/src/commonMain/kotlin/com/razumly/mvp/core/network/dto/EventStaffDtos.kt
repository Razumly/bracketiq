package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Invite
import kotlinx.serialization.Serializable

const val EVENT_STAFF_CONTRACT_VERSION: Int = 1

@Serializable
data class EventStaffPendingInviteDto(
    val email: String,
    val firstName: String,
    val lastName: String,
    val roles: List<String>,
    val resolvedUserId: String? = null,
)

@Serializable
data class EventStaffPutRequestDto(
    val contractVersion: Int = EVENT_STAFF_CONTRACT_VERSION,
    val expectedRevision: String,
    val assistantHostIds: List<String>,
    val eventOfficials: List<EventOfficial>,
    val pendingInvites: List<EventStaffPendingInviteDto>,
)

@Serializable
data class EventStaffStateResponseDto(
    val contractVersion: Int = 0,
    val eventId: String = "",
    val revision: String = "",
    val assistantHostIds: List<String> = emptyList(),
    val officialPositions: List<EventOfficialPosition> = emptyList(),
    val eventOfficials: List<EventOfficial> = emptyList(),
    val officialIds: List<String> = emptyList(),
    val staffInvites: List<Invite> = emptyList(),
)
