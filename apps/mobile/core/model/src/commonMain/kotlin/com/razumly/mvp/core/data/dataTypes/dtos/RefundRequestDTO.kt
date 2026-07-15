package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.RefundRequest
import com.razumly.mvp.core.data.dataTypes.RefundApprovalPreview
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RefundRequestDTO(
    val id: String = "",
    @SerialName("\$id") val legacyId: String? = null,
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
    val approvalPreview: RefundApprovalPreview? = null,
) {
    fun toRefundRequest(refundId: String = id.ifBlank { legacyId.orEmpty() }): RefundRequest {
        return RefundRequest(
            id = refundId,
            eventId = eventId,
            userId = userId,
            hostId = hostId,
            reason = reason,
            organizationId = organizationId,
            status = status,
            createdAt = createdAt,
            requestedByUserId = requestedByUserId,
            teamId = teamId,
            slotId = slotId,
            occurrenceDate = occurrenceDate,
            billIds = billIds,
            paymentIds = paymentIds,
            requestedAmountCents = requestedAmountCents,
            currency = currency,
            policyDecision = policyDecision,
            scopeVersion = scopeVersion,
            scopeHash = scopeHash,
        )
    }
}
