package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Ignore
import androidx.room.Relation
import kotlinx.serialization.Serializable

@Serializable
data class RefundApprovalPaymentPreview(
    val paymentId: String,
    val billId: String,
    val refundableAmountCents: Int,
    val currency: String = "usd",
)

@Serializable
data class RefundApprovalOccurrencePreview(
    val slotId: String? = null,
    val occurrenceDate: String? = null,
)

@Serializable
data class RefundApprovalPreview(
    val paymentScope: List<RefundApprovalPaymentPreview> = emptyList(),
    val paymentCount: Int = 0,
    val billIds: List<String> = emptyList(),
    val paymentIds: List<String> = emptyList(),
    val refundableAmountCents: Int = 0,
    val currency: String = "usd",
    val occurrence: RefundApprovalOccurrencePreview? = null,
    val policyDecision: String? = null,
    val scopeVersion: Int = 0,
    val scopeHash: String? = null,
    val isValid: Boolean = false,
)

@Serializable
data class RefundRequestWithRelations(
    @Embedded val refundRequest: RefundRequest,

    @Relation(
        parentColumn = "userId",
        entityColumn = "id"
    )
    val user: UserData?,

    @Relation(
        parentColumn = "eventId",
        entityColumn = "id"
    )
    val event: Event?
) {
    /**
     * Server-only approval evidence. It is added after Room hydrates the stable request and
     * relations, so it never changes the RefundRequest table or offline cache contract.
     */
    @Ignore
    var approvalPreview: RefundApprovalPreview? = null
}
