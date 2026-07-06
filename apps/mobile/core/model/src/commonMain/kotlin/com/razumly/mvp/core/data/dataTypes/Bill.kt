package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class BillDiscountSummary(
    val id: String,
    val discountId: String,
    val discountCodeId: String,
    val code: String,
    val name: String? = null,
    val originalAmountCents: Int,
    val discountedAmountCents: Int,
    val discountAmountCents: Int,
    val paymentIntentId: String? = null,
    val registrationId: String? = null,
)

@Serializable
data class Bill(
    val ownerType: String,
    val ownerId: String,
    val organizationId: String? = null,
    val eventId: String? = null,
    val totalAmountCents: Int,
    val paidAmountCents: Int? = null,
    val originalAmountCents: Int? = null,
    val discountAmountCents: Int? = null,
    val discountedAmountCents: Int? = null,
    val discounts: List<BillDiscountSummary> = emptyList(),
    val nextPaymentDue: String? = null,
    val nextPaymentAmountCents: Int? = null,
    val parentBillId: String? = null,
    val allowSplit: Boolean? = null,
    val status: String? = null,
    val paymentPlanEnabled: Boolean? = null,
    val createdBy: String? = null,
    @Transient
    override val id: String = "",
) : MVPDocument

@Serializable
data class ManualPaymentProof(
    val id: String,
    val status: String? = null,
    val fileId: String,
    val fileUrl: String? = null,
    val amountAcceptedCents: Int? = null,
)

@Serializable
data class BillPayment(
    val billId: String,
    val sequence: Int,
    val dueDate: String,
    val amountCents: Int,
    val paidAmountCents: Int? = null,
    val status: String? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val payerUserId: String? = null,
    val manualPaymentProofs: List<ManualPaymentProof> = emptyList(),
    @Transient
    override val id: String = "",
) : MVPDocument
