package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.network.dto.EVENT_STAFF_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventStaffStateResponseDto

enum class EventStaffAssignmentRole {
    OFFICIAL,
    ASSISTANT_HOST,
}

data class EventStaffInviteInput(
    val email: String,
    val firstName: String,
    val lastName: String,
    val roles: Set<EventStaffAssignmentRole>,
    val resolvedUserId: String? = null,
)

data class EventStaffState(
    val event: Event,
    val staffInvites: List<Invite>,
    val revision: String,
)

internal fun EventStaffStateResponseDto.toEventStaffState(baseEvent: Event): EventStaffState {
    require(contractVersion == EVENT_STAFF_CONTRACT_VERSION) {
        "Unsupported event staff contract version $contractVersion."
    }
    val normalizedEventId = eventId.trim()
    require(normalizedEventId.isNotEmpty() && normalizedEventId == baseEvent.id.trim()) {
        "Event staff response did not match the requested event."
    }
    val normalizedRevision = revision.trim()
    require(normalizedRevision.isNotEmpty()) {
        "Event staff response was missing its revision."
    }

    val normalizedAssistantHostIds = assistantHostIds
        .map(String::trim)
        .filter(String::isNotBlank)
        .filterNot { userId -> userId == baseEvent.hostId.trim() }
        .distinct()
    val normalizedOfficials = eventOfficials
        .map { official ->
            official.copy(
                id = official.id.trim(),
                userId = official.userId.trim(),
                positionIds = official.positionIds.map(String::trim).filter(String::isNotBlank).distinct(),
                fieldIds = official.fieldIds.map(String::trim).filter(String::isNotBlank).distinct(),
            )
        }
        .onEach { official ->
            require(official.id.isNotEmpty() && official.userId.isNotEmpty()) {
                "Event staff response included an invalid official."
            }
        }
        .distinctBy { official -> official.userId }
    val normalizedOfficialIds = officialIds
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
    require(normalizedOfficialIds == normalizedOfficials.map { official -> official.userId }) {
        "Event staff response official IDs did not match its official records."
    }
    val normalizedInvites = staffInvites.onEach { invite ->
        require(invite.id.trim().isNotEmpty()) {
            "Event staff response included an invite without an ID."
        }
        require(invite.type.equals("STAFF", ignoreCase = true) && invite.eventId?.trim() == normalizedEventId) {
            "Event staff response included an invite outside the requested event."
        }
    }
    val mergedEvent = baseEvent.copy(
        assistantHostIds = normalizedAssistantHostIds,
        officialPositions = officialPositions,
        eventOfficials = normalizedOfficials,
        officialIds = normalizedOfficialIds,
    ).syncOfficialStaffing()

    return EventStaffState(
        event = mergedEvent,
        staffInvites = normalizedInvites,
        revision = normalizedRevision,
    )
}
