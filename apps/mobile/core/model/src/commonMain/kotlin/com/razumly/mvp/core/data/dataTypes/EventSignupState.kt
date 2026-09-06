package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
data class EventSignupTeam(val id: String, val name: String, val sport: String? = null)

@Serializable
data class EventSignupDraft(
    val id: String,
    val eventId: String,
    val revision: Int,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val selectedTeamId: String? = null,
    val selectedDivisionId: String? = null,
    val selectedDivisionTypeKey: String? = null,
    val answers: Map<String, String> = emptyMap(),
    val step: String = "review",
    val completedSteps: List<String> = emptyList(),
    val registrationId: String? = null,
    val holdExpiresAt: String? = null,
    val teamCreationId: String? = null,
    val completedAt: String? = null,
    val updatedAt: String,
)

@Serializable
data class EventSignupState(
    val draft: EventSignupDraft? = null,
    val eligibleTeams: List<EventSignupTeam> = emptyList(),
    val selectedTeamId: String? = null,
    val selectionSource: String? = null,
    val available: Boolean,
    val unavailableReason: String? = null,
    val invalidations: List<String> = emptyList(),
)

@Entity(tableName = "event_signup_state")
data class EventSignupCacheEntry(
    @PrimaryKey val id: String,
    val accountId: String,
    val eventId: String,
    val payload: String,
)
