package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.EventSignupDraft
import com.razumly.mvp.core.data.dataTypes.EventSignupState
import com.razumly.mvp.core.data.dataTypes.EventSignupTeam
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class EventRegistrationScopeDto(
    val eventId: String,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
)

@Serializable
data class EventTeamCreationContextDto(
    val eventId: String,
    val baseRevision: Int,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
)

@Serializable
data class EventRegistrationDraftSaveDto(
    val version: Int = 1,
    val baseRevision: Int,
    val patch: JsonObject,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
)

@Serializable
data class EventRegistrationDraftResponseDto(
    val version: Int,
    val draft: EventSignupDraft? = null,
    val eligibleTeams: List<EventSignupTeam>,
    val selectedTeamId: String? = null,
    val selectionSource: String? = null,
    val available: Boolean,
    val unavailableReason: String? = null,
    val invalidations: List<String>,
) {
    fun toModel(): EventSignupState {
        require(version == 1) { "Update the app to continue this registration." }
        return EventSignupState(draft, eligibleTeams, selectedTeamId, selectionSource, available, unavailableReason, invalidations)
    }
}
