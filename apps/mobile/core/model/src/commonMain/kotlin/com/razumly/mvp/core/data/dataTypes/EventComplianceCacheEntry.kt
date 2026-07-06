package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "event_team_compliance_summaries",
    primaryKeys = ["eventId", "cacheSlotId", "cacheOccurrenceDate", "teamId"],
    indices = [
        Index("eventId", "cacheSlotId", "cacheOccurrenceDate"),
        Index("teamId"),
    ],
)
data class EventTeamComplianceCacheEntry(
    val eventId: String,
    val cacheSlotId: String,
    val cacheOccurrenceDate: String,
    val teamId: String,
    val teamName: String,
    val paymentHasBill: Boolean = false,
    val paymentBillId: String? = null,
    val paymentTotalAmountCents: Int = 0,
    val paymentPaidAmountCents: Int = 0,
    val paymentOriginalAmountCents: Int = 0,
    val paymentDiscountAmountCents: Int = 0,
    val paymentDiscountedAmountCents: Int = 0,
    val paymentDiscountsJson: String = "[]",
    val paymentStatus: String? = null,
    val paymentIsPaidInFull: Boolean = false,
    val paymentPending: Boolean = false,
    val paymentInheritedFromTeamBill: Boolean = false,
    val manualPaymentProofStatus: String? = null,
    val manualPaymentProofCount: Int = 0,
    val documentsSignedCount: Int = 0,
    val documentsRequiredCount: Int = 0,
    val registrationAnswersJson: String = "[]",
)

@Entity(
    tableName = "event_user_compliance_summaries",
    primaryKeys = ["eventId", "cacheSlotId", "cacheOccurrenceDate", "parentTeamId", "userId"],
    indices = [
        Index("eventId", "cacheSlotId", "cacheOccurrenceDate"),
        Index("parentTeamId"),
        Index("userId"),
    ],
)
data class EventUserComplianceCacheEntry(
    val eventId: String,
    val cacheSlotId: String,
    val cacheOccurrenceDate: String,
    val parentTeamId: String,
    val userId: String,
    val fullName: String,
    val userName: String? = null,
    val isMinorAtEvent: Boolean = false,
    val registrationType: String = "ADULT",
    val paymentHasBill: Boolean = false,
    val paymentBillId: String? = null,
    val paymentTotalAmountCents: Int = 0,
    val paymentPaidAmountCents: Int = 0,
    val paymentOriginalAmountCents: Int = 0,
    val paymentDiscountAmountCents: Int = 0,
    val paymentDiscountedAmountCents: Int = 0,
    val paymentDiscountsJson: String = "[]",
    val paymentStatus: String? = null,
    val paymentIsPaidInFull: Boolean = false,
    val paymentPending: Boolean = false,
    val paymentInheritedFromTeamBill: Boolean = false,
    val manualPaymentProofStatus: String? = null,
    val manualPaymentProofCount: Int = 0,
    val documentsSignedCount: Int = 0,
    val documentsRequiredCount: Int = 0,
    val requiredDocumentsJson: String = "[]",
    val registrationAnswersJson: String = "[]",
)
