package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillPayment
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class BillDTO(
    val ownerType: String,
    val ownerId: String,
    val organizationId: String? = null,
    val eventId: String? = null,
    val totalAmountCents: Int,
    val paidAmountCents: Int? = null,
    val nextPaymentDue: String? = null,
    val nextPaymentAmountCents: Int? = null,
    val parentBillId: String? = null,
    val allowSplit: Boolean? = null,
    val status: String? = null,
    val paymentPlanEnabled: Boolean? = null,
    val createdBy: String? = null,
    @Transient val id: String = "",
) {
    fun toBill(id: String): Bill =
        Bill(
            ownerType = ownerType,
            ownerId = ownerId,
            organizationId = organizationId,
            eventId = eventId,
            totalAmountCents = totalAmountCents,
            paidAmountCents = paidAmountCents,
            nextPaymentDue = nextPaymentDue,
            nextPaymentAmountCents = nextPaymentAmountCents,
            parentBillId = parentBillId,
            allowSplit = allowSplit,
            status = status,
            paymentPlanEnabled = paymentPlanEnabled,
            createdBy = createdBy,
            id = id
        )
}

@Serializable
data class BillPaymentDTO(
    val billId: String,
    val sequence: Int,
    val dueDate: String,
    val amountCents: Int,
    val status: String? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val payerUserId: String? = null,
    @Transient val id: String = "",
) {
    fun toBillPayment(id: String): BillPayment =
        BillPayment(
            billId = billId,
            sequence = sequence,
            dueDate = dueDate,
            amountCents = amountCents,
            status = status,
            paidAt = paidAt,
            paymentIntentId = paymentIntentId,
            payerUserId = payerUserId,
            id = id
        )
}
