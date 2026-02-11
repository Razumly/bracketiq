package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class Bill(
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
    @Transient
    override val id: String = "",
) : MVPDocument

@Serializable
data class BillPayment(
    val billId: String,
    val sequence: Int,
    val dueDate: String,
    val amountCents: Int,
    val status: String? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val payerUserId: String? = null,
    @Transient
    override val id: String = "",
) : MVPDocument
