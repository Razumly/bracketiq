package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "current_user_event_registrations")
data class EventRegistrationCacheEntry(
    @PrimaryKey val id: String,
    val eventId: String,
    val registrantId: String,
    val parentId: String? = null,
    val registrantType: String,
    val rosterRole: String? = null,
    val status: String? = null,
    val eventTeamId: String? = null,
    val sourceTeamRegistrationId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val jerseyNumber: String? = null,
    val position: String? = null,
    val isCaptain: Boolean? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)
