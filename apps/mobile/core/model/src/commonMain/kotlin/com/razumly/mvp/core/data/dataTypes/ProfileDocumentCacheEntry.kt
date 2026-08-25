package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "profile_document_cache",
    primaryKeys = ["viewerKey", "id"],
    indices = [
        Index("viewerKey"),
        Index(value = ["viewerKey", "status"]),
    ],
)
data class ProfileDocumentCacheEntry(
    val viewerKey: String,
    val id: String,
    val sortOrder: Int,
    val status: String,
    val eventId: String?,
    val eventName: String?,
    val teamId: String?,
    val teamName: String?,
    val organizationId: String?,
    val organizationName: String,
    val templateId: String,
    val documentRequirementTitle: String?,
    val versionSequence: Int?,
    val title: String,
    val type: String,
    val provenance: String?,
    val scopeType: String?,
    val scopeId: String?,
    val historicalSigningDate: String?,
    val requiredSignerType: String,
    val requiredSignerLabel: String,
    val signerContext: String,
    val signerContextLabel: String,
    val childUserId: String?,
    val childEmail: String?,
    val consentStatus: String?,
    val requiresChildEmail: Boolean,
    val statusNote: String?,
    val signedAt: String?,
    val signedDocumentRecordId: String?,
    val viewUrl: String?,
    val content: String?,
)
