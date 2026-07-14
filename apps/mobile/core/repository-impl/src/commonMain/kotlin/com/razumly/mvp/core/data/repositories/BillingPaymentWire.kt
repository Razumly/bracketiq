package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.BillPayment
import com.razumly.mvp.core.data.dataTypes.BillingAddressProfile
import com.razumly.mvp.core.data.dataTypes.ManualPaymentProof
import com.razumly.mvp.core.network.dto.BillingEventRefDto
import com.razumly.mvp.core.network.dto.BillingAddressDto
import com.razumly.mvp.core.network.dto.BillingUserRefDto
import com.razumly.mvp.core.network.dto.PaginationResponseDto
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

private const val BOLD_SIGN_RATE_LIMIT_FRIENDLY_MESSAGE =
    "You opened the BoldSign document too many times. Please wait a minute before trying again."
private const val MAX_INCLUSIVE_PRICE_CENTS = 100_000_000
private const val CATALOG_RESOURCE_ORGANIZATIONS = "organizations"
private const val CATALOG_RESOURCE_PRODUCTS = "products"
private const val ORGANIZATION_PROJECTION_DETAIL = "detail"
private const val ORGANIZATION_PROJECTION_PUBLIC = "public"
private const val PRODUCT_PROJECTION_FULL = "full"
// The review mutation routes return getOrganizationReviewsPayload() with the backend's default 50.
private const val MUTATED_REVIEW_FIRST_PAGE_LIMIT = 50

/** The payment succeeded, but the server has rejected its idempotent rental booking mutation. */
@Serializable
internal data class BillsResponseDto(
    val bills: List<BillApiDto> = emptyList(),
    val pagination: PaginationResponseDto? = null,
)

@Serializable
internal data class BillPaymentsResponseDto(
    val payments: List<BillPaymentApiDto> = emptyList(),
)

@Serializable
internal data class SubscriptionStatusResponseDto(
    val cancelled: Boolean? = null,
    val restarted: Boolean? = null,
    val error: String? = null,
)

@Serializable
internal data class CreateBillingIntentRequestDto(
    val billId: String,
    val billPaymentId: String,
    val user: BillingUserRefDto? = null,
)

@Serializable
internal data class MarkBillPaymentProcessingRequestDto(
    val paymentIntent: String,
)

@Serializable
internal data class ManualPaymentProofSubmitRequestDto(
    val fileId: String,
)

@Serializable
internal data class ManualPaymentProofReviewRequestDto(
    val decision: String,
    val amountAcceptedCents: Int? = null,
    val reviewNote: String? = null,
)

@Serializable
internal data class ManualPaymentProofResponseDto(
    val proof: ManualPaymentProofApiDto? = null,
    val error: String? = null,
)

@Serializable
internal data class UpdateBillingAddressRequestDto(
    val billingAddress: BillingAddressDto,
)

@Serializable
internal data class BillingAddressResponseDto(
    val billingAddress: BillingAddressDto? = null,
    val email: String? = null,
) {
    fun toBillingAddressProfile(): BillingAddressProfile = BillingAddressProfile(
        billingAddress = billingAddress?.toBillingAddressDraft(),
        email = email?.trim()?.takeIf(String::isNotBlank),
    )
}

@Serializable
internal data class CreateBillRequestDto(
    val ownerType: String,
    val ownerId: String,
    val totalAmountCents: Int,
    val eventId: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val organizationId: String? = null,
    val installmentAmounts: List<Int>? = null,
    val installmentDueDates: List<String>? = null,
    val installmentDueRelativeDays: List<Int>? = null,
    val allowSplit: Boolean = false,
    val paymentPlanEnabled: Boolean = false,
    val event: BillingEventRefDto? = null,
    val user: BillingUserRefDto? = null,
)

@Serializable
internal data class EventTeamBillCreateRequestDto(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val allowSplit: Boolean = false,
    val label: String? = null,
)

@Serializable
internal data class EventTeamPaymentCheckoutRequestDto(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val divisionId: String? = null,
    val label: String? = null,
)

@Serializable
internal data class EventTeamPaymentCheckoutResponseDto(
    val checkoutUrl: String? = null,
    val qrCodeUrl: String? = null,
    val amountCents: Int? = null,
    val eventAmountCents: Int? = null,
    val billOwnerType: String? = null,
    val billOwnerId: String? = null,
    val payerUserId: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val checkoutSessionId: String? = null,
    val error: String? = null,
)

@Serializable
internal data class CreateBillResponseDto(
    val bill: BillApiDto? = null,
    val error: String? = null,
)

@Serializable
internal data class EventTeamBillRefundRequestDto(
    val billPaymentId: String,
    val amountCents: Int,
)

@Serializable
internal data class EventTeamBillRefundResponseDto(
    val error: String? = null,
)

@Serializable
internal data class EventTeamBillingSnapshotResponseDto(
    val team: EventTeamBillingTeamDto? = null,
    val users: List<EventTeamBillingUserDto> = emptyList(),
    val bills: List<EventTeamBillingBillDto> = emptyList(),
    val totals: EventTeamBillingTotalsDto? = null,
    val error: String? = null,
)

@Serializable
internal data class EventTeamBillingTeamDto(
    val id: String? = null,
    val name: String? = null,
    val playerIds: List<String> = emptyList(),
)

@Serializable
internal data class EventTeamBillingUserDto(
    val id: String? = null,
    val displayName: String? = null,
)

@Serializable
internal data class EventTeamBillingLineItemDto(
    val id: String? = null,
    val type: String? = null,
    val label: String? = null,
    val amountCents: Int? = null,
    val quantity: Int? = null,
)

@Serializable
internal data class ManualPaymentProofApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val status: String? = null,
    val fileId: String? = null,
    val fileUrl: String? = null,
    val amountAcceptedCents: Int? = null,
) {
    fun toManualPaymentProofOrNull(): ManualPaymentProof? {
        val resolvedId = id?.trim()?.takeIf(String::isNotBlank)
            ?: legacyId?.trim()?.takeIf(String::isNotBlank)
            ?: return null
        val resolvedFileId = fileId?.trim()?.takeIf(String::isNotBlank) ?: return null
        return ManualPaymentProof(
            id = resolvedId,
            status = status?.trim()?.takeIf(String::isNotBlank),
            fileId = resolvedFileId,
            fileUrl = fileUrl?.trim()?.takeIf(String::isNotBlank),
            amountAcceptedCents = amountAcceptedCents,
        )
    }
}

@Serializable
internal data class EventTeamBillingPaymentDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val billId: String? = null,
    val sequence: Int? = null,
    val status: String? = null,
    val amountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val refundedAmountCents: Int? = null,
    val refundableAmountCents: Int? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val isRefundable: Boolean? = null,
    val manualPaymentProofs: List<ManualPaymentProofApiDto> = emptyList(),
)

@Serializable
internal data class BillDiscountSummaryDto(
    val id: String? = null,
    val discountId: String? = null,
    val discountCodeId: String? = null,
    val code: String? = null,
    val name: String? = null,
    val originalAmountCents: Int? = null,
    val discountedAmountCents: Int? = null,
    val discountAmountCents: Int? = null,
    val paymentIntentId: String? = null,
    val registrationId: String? = null,
)

@Serializable
internal data class EventTeamBillingBillDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val ownerType: String? = null,
    val ownerId: String? = null,
    val ownerName: String? = null,
    val totalAmountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val originalAmountCents: Int? = null,
    val discountAmountCents: Int? = null,
    val discountedAmountCents: Int? = null,
    val discounts: List<BillDiscountSummaryDto> = emptyList(),
    val refundedAmountCents: Int? = null,
    val refundableAmountCents: Int? = null,
    val status: String? = null,
    val allowSplit: Boolean? = null,
    val lineItems: List<EventTeamBillingLineItemDto> = emptyList(),
    val payments: List<EventTeamBillingPaymentDto> = emptyList(),
)

@Serializable
internal data class EventTeamBillingTotalsDto(
    val paidAmountCents: Int? = null,
    val refundedAmountCents: Int? = null,
    val refundableAmountCents: Int? = null,
)

@Serializable
internal data class CreateProductSubscriptionRequestDto(
    val organizationId: String? = null,
    val priceCents: Int? = null,
    val startDate: String? = null,
)

@Serializable
internal data class BillApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val ownerType: String? = null,
    val ownerId: String? = null,
    val organizationId: String? = null,
    val eventId: String? = null,
    val totalAmountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val originalAmountCents: Int? = null,
    val discountAmountCents: Int? = null,
    val discountedAmountCents: Int? = null,
    val discounts: List<BillDiscountSummaryDto> = emptyList(),
    val nextPaymentDue: String? = null,
    val nextPaymentAmountCents: Int? = null,
    val parentBillId: String? = null,
    val allowSplit: Boolean? = null,
    val status: String? = null,
    val paymentPlanEnabled: Boolean? = null,
    val createdBy: String? = null,
) {
    fun toBillOrNull(): Bill? {
        val resolvedId = id ?: legacyId
        val resolvedOwnerType = ownerType
        val resolvedOwnerId = ownerId
        val resolvedTotal = totalAmountCents
        if (resolvedId.isNullOrBlank() || resolvedOwnerType.isNullOrBlank() || resolvedOwnerId.isNullOrBlank() || resolvedTotal == null) {
            return null
        }

        return Bill(
            id = resolvedId,
            ownerType = resolvedOwnerType,
            ownerId = resolvedOwnerId,
            organizationId = organizationId,
            eventId = eventId,
            totalAmountCents = resolvedTotal,
            paidAmountCents = paidAmountCents,
            originalAmountCents = originalAmountCents,
            discountAmountCents = discountAmountCents,
            discountedAmountCents = discountedAmountCents,
            discounts = discounts.mapNotNull { discount -> discount.toBillDiscountSummaryOrNull() },
            nextPaymentDue = nextPaymentDue,
            nextPaymentAmountCents = nextPaymentAmountCents,
            parentBillId = parentBillId,
            allowSplit = allowSplit,
            status = status,
            paymentPlanEnabled = paymentPlanEnabled,
            createdBy = createdBy,
        )
    }
}

internal fun EventTeamBillingSnapshotResponseDto.toSnapshotOrNull(): EventTeamBillingSnapshot? {
    val teamDto = team ?: return null
    val resolvedTeamId = teamDto.id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val bills = bills.mapNotNull { bill -> bill.toBillOrNull() }
    val totalsDto = totals
    val totals = EventTeamBillingTotals(
        paidAmountCents = totalsDto?.paidAmountCents ?: 0,
        refundedAmountCents = totalsDto?.refundedAmountCents ?: 0,
        refundableAmountCents = totalsDto?.refundableAmountCents ?: 0,
    )
    return EventTeamBillingSnapshot(
        teamId = resolvedTeamId,
        teamName = teamDto.name?.trim()?.takeIf(String::isNotBlank),
        playerIds = teamDto.playerIds.mapNotNull { id -> id.trim().takeIf(String::isNotBlank) },
        users = users.mapNotNull { user -> user.toUserOptionOrNull() },
        bills = bills,
        totals = totals,
    )
}

internal fun EventTeamPaymentCheckoutResponseDto.toPaymentCheckoutOrNull(): EventTeamPaymentCheckout? {
    val resolvedCheckoutUrl = checkoutUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedQrCodeUrl = qrCodeUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedAmountCents = amountCents ?: return null
    val resolvedEventAmountCents = eventAmountCents ?: resolvedAmountCents
    val resolvedBillOwnerType = billOwnerType?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedBillOwnerId = billOwnerId?.trim()?.takeIf(String::isNotBlank) ?: return null
    return EventTeamPaymentCheckout(
        checkoutUrl = resolvedCheckoutUrl,
        qrCodeUrl = resolvedQrCodeUrl,
        amountCents = resolvedAmountCents,
        eventAmountCents = resolvedEventAmountCents,
        billOwnerType = resolvedBillOwnerType,
        billOwnerId = resolvedBillOwnerId,
        payerUserId = payerUserId?.trim()?.takeIf(String::isNotBlank),
        feeBreakdown = feeBreakdown,
        checkoutSessionId = checkoutSessionId?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun List<String>.normalizeStringList(): List<String> =
    map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

internal fun EventTeamBillingUserDto.toUserOptionOrNull(): EventTeamBillingUserOption? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDisplayName = displayName?.trim()?.takeIf(String::isNotBlank) ?: resolvedId
    return EventTeamBillingUserOption(
        id = resolvedId,
        displayName = resolvedDisplayName,
    )
}

internal fun EventTeamBillingBillDto.toBillOrNull(): EventTeamBillingBillSnapshot? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank)
        ?: legacyId?.trim()?.takeIf(String::isNotBlank)
        ?: return null
    val resolvedOwnerType = ownerType?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOwnerId = ownerId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOwnerName = ownerName?.trim()?.takeIf(String::isNotBlank) ?: resolvedOwnerId
    val resolvedTotalAmount = totalAmountCents ?: return null
    val resolvedPaid = paidAmountCents ?: 0
    val resolvedRefunded = refundedAmountCents ?: 0
    val resolvedRefundable = refundableAmountCents ?: 0

    return EventTeamBillingBillSnapshot(
        id = resolvedId,
        ownerType = resolvedOwnerType,
        ownerId = resolvedOwnerId,
        ownerName = resolvedOwnerName,
        totalAmountCents = resolvedTotalAmount,
        paidAmountCents = resolvedPaid,
        originalAmountCents = originalAmountCents ?: resolvedTotalAmount,
        discountAmountCents = discountAmountCents ?: 0,
        discountedAmountCents = discountedAmountCents ?: resolvedTotalAmount,
        discounts = discounts.mapNotNull { discount -> discount.toBillDiscountSummaryOrNull() },
        refundedAmountCents = resolvedRefunded,
        refundableAmountCents = resolvedRefundable,
        status = status?.trim()?.takeIf(String::isNotBlank),
        allowSplit = allowSplit,
        lineItems = lineItems.map { lineItem ->
            EventTeamBillingLineItem(
                id = lineItem.id?.trim()?.takeIf(String::isNotBlank),
                type = lineItem.type?.trim()?.takeIf(String::isNotBlank),
                label = lineItem.label?.trim()?.takeIf(String::isNotBlank),
                amountCents = lineItem.amountCents,
                quantity = lineItem.quantity,
            )
        },
        payments = payments.mapNotNull { payment -> payment.toPaymentOrNull() },
    )
}

internal fun BillDiscountSummaryDto.toBillDiscountSummaryOrNull(): BillDiscountSummary? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountId = discountId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedDiscountCodeId = discountCodeId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedCode = code?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedOriginal = originalAmountCents ?: return null
    val resolvedDiscounted = discountedAmountCents ?: return null
    return BillDiscountSummary(
        id = resolvedId,
        discountId = resolvedDiscountId,
        discountCodeId = resolvedDiscountCodeId,
        code = resolvedCode,
        name = name?.trim()?.takeIf(String::isNotBlank),
        originalAmountCents = resolvedOriginal.coerceAtLeast(0),
        discountedAmountCents = resolvedDiscounted.coerceAtLeast(0),
        discountAmountCents = (discountAmountCents ?: (resolvedOriginal - resolvedDiscounted)).coerceAtLeast(0),
        paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
        registrationId = registrationId?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun EventTeamBillingPaymentDto.toPaymentOrNull(): EventTeamBillingPaymentSnapshot? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank)
        ?: legacyId?.trim()?.takeIf(String::isNotBlank)
        ?: return null
    val resolvedBillId = billId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedSequence = sequence ?: return null
    val resolvedAmountCents = amountCents ?: return null
    val resolvedRefunded = refundedAmountCents ?: 0
    val resolvedRefundable = refundableAmountCents ?: 0
    return EventTeamBillingPaymentSnapshot(
        id = resolvedId,
        billId = resolvedBillId,
        sequence = resolvedSequence,
        status = status?.trim()?.takeIf(String::isNotBlank),
        amountCents = resolvedAmountCents,
        paidAmountCents = paidAmountCents,
        refundedAmountCents = resolvedRefunded,
        refundableAmountCents = resolvedRefundable,
        paidAt = paidAt?.trim()?.takeIf(String::isNotBlank),
        paymentIntentId = paymentIntentId?.trim()?.takeIf(String::isNotBlank),
        isRefundable = isRefundable ?: false,
        manualPaymentProofs = manualPaymentProofs.mapNotNull { proof -> proof.toManualPaymentProofOrNull() },
    )
}

@Serializable
internal data class BillPaymentApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val billId: String? = null,
    val sequence: Int? = null,
    val dueDate: String? = null,
    val amountCents: Int? = null,
    val paidAmountCents: Int? = null,
    val status: String? = null,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val payerUserId: String? = null,
    val manualPaymentProofs: List<ManualPaymentProofApiDto> = emptyList(),
) {
    fun toBillPaymentOrNull(): BillPayment? {
        val resolvedId = id ?: legacyId
        val resolvedBillId = billId
        val resolvedSequence = sequence
        val resolvedDueDate = dueDate
        val resolvedAmount = amountCents
        if (
            resolvedId.isNullOrBlank() ||
            resolvedBillId.isNullOrBlank() ||
            resolvedSequence == null ||
            resolvedDueDate.isNullOrBlank() ||
            resolvedAmount == null
        ) {
            return null
        }

        return BillPayment(
            id = resolvedId,
            billId = resolvedBillId,
            sequence = resolvedSequence,
            dueDate = resolvedDueDate,
            amountCents = resolvedAmount,
            paidAmountCents = paidAmountCents,
            status = status,
            paidAt = paidAt,
            paymentIntentId = paymentIntentId,
            payerUserId = payerUserId,
            manualPaymentProofs = manualPaymentProofs.mapNotNull { proof -> proof.toManualPaymentProofOrNull() },
        )
    }
}
