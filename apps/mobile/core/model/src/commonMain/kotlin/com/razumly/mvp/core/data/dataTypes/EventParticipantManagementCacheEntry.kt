package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "event_participant_management_entries",
    primaryKeys = ["eventId", "cacheSlotId", "cacheOccurrenceDate", "section", "registrationId"],
    indices = [
        Index("eventId", "cacheSlotId", "cacheOccurrenceDate"),
        Index("registrantId"),
    ],
)
data class EventParticipantManagementCacheEntry(
    val eventId: String,
    val cacheSlotId: String,
    val cacheOccurrenceDate: String,
    val section: String,
    val registrationId: String,
    val sortOrder: Int,
    val registrantId: String,
    val registrantType: String,
    val rosterRole: String? = null,
    val status: String? = null,
    val parentId: String? = null,
    val divisionId: String? = null,
    val divisionTypeId: String? = null,
    val divisionTypeKey: String? = null,
    val consentDocumentId: String? = null,
    val consentStatus: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)
