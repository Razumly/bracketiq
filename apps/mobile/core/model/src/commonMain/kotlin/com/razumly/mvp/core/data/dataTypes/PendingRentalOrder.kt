package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

const val PENDING_RENTAL_ORDER_STATUS_PENDING = "PENDING"
const val PENDING_RENTAL_ORDER_STATUS_AWAITING_PAYMENT = "AWAITING_PAYMENT"
const val PENDING_RENTAL_ORDER_STATUS_REJECTED = "REJECTED"
const val PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID = "__legacy_unknown_payer__"

/**
 * A rental order that must survive the payment-sheet and booking boundary. `AWAITING_PAYMENT`
 * rows are rechecked with the server after process death; `PENDING` rows have completed local
 * checkout and still need the server booking mutation. The payer scope prevents another account
 * on a shared device from retrying somebody else's purchase intent.
 */
@Entity(
    indices = [
        Index(value = ["status"]),
        Index(value = ["createdAt"]),
    ],
)
data class PendingRentalOrder(
    @PrimaryKey val id: String,
    val publicSlug: String,
    val eventId: String,
    val selectionsJson: String,
    val paymentIntentId: String? = null,
    val payerUserId: String,
    val renterOrganizationId: String? = null,
    val sportId: String? = null,
    val status: String = PENDING_RENTAL_ORDER_STATUS_PENDING,
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val createdAt: String,
    val lastAttemptAt: String? = null,
)
