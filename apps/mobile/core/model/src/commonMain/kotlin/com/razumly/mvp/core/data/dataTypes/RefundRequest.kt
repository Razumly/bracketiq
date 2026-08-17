package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class RefundRequest(
    @PrimaryKey override val id: String,
    val eventId: String,
    val userId: String,
    val hostId: String?,
    val reason: String,
    val organizationId: String? = null,
    val status: String? = null,
    val createdAt: String? = null,
    val requestedByUserId: String? = null,
    val teamId: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val billIds: List<String> = emptyList(),
    val paymentIds: List<String> = emptyList(),
    val requestedAmountCents: Int = 0,
    val currency: String = "usd",
    val policyDecision: String? = null,
    val scopeVersion: Int = 1,
    val scopeHash: String? = null,
) : MVPDocument
