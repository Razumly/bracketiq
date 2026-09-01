package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.BillDiscountSummary
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.ManualPaymentProof
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

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
class RentalOrderTerminalFailureException(message: String, cause: Throwable) : IllegalStateException(message, cause)

/** The original payer must sign back in before their prepared rental can be submitted. */
class RentalOrderPayerMismatchException(message: String) : IllegalStateException(message)

@Serializable
data class RepositoryPagination(
    val limit: Int,
    val offset: Int,
    val nextOffset: Int,
    val hasMore: Boolean,
)

data class RepositoryPage<T>(
    val items: List<T>,
    val pagination: RepositoryPagination,
)

enum class SignerContext(val apiValue: String) {
    PARTICIPANT("participant"),
    PARENT_GUARDIAN("parent_guardian"),
    CHILD("child"),
}

enum class ProfileDocumentStatus {
    UNSIGNED,
    SIGNED,
}

enum class ProfileDocumentType {
    PDF,
    TEXT,
}

data class ProfileDocumentCard(
    val id: String,
    val status: ProfileDocumentStatus,
    val eventId: String? = null,
    val eventName: String? = null,
    val teamId: String? = null,
    val teamName: String? = null,
    val organizationId: String? = null,
    val organizationName: String,
    val templateId: String,
    val title: String,
    val type: ProfileDocumentType,
    val requiredSignerType: String,
    val requiredSignerLabel: String,
    val signerContext: SignerContext,
    val signerContextLabel: String,
    val childUserId: String? = null,
    val childEmail: String? = null,
    val consentStatus: String? = null,
    val requiresChildEmail: Boolean = false,
    val statusNote: String? = null,
    val signedAt: String? = null,
    val signedDocumentRecordId: String? = null,
    val viewUrl: String? = null,
    val content: String? = null,
)

data class ProfileDocumentsBundle(
    val unsigned: List<ProfileDocumentCard> = emptyList(),
    val signed: List<ProfileDocumentCard> = emptyList(),
)

data class CreateBillRequest(
    val ownerType: String,
    val ownerId: String,
    val totalAmountCents: Int,
    val eventId: String? = null,
    val slotId: String? = null,
    val occurrenceDate: String? = null,
    val organizationId: String? = null,
    val installmentAmounts: List<Int> = emptyList(),
    val installmentDueDates: List<String> = emptyList(),
    val installmentDueRelativeDays: List<Int> = emptyList(),
    val allowSplit: Boolean = false,
    val paymentPlanEnabled: Boolean = false,
)

data class EventTeamBillingUserOption(
    val id: String,
    val displayName: String,
)

data class EventTeamBillingLineItem(
    val id: String? = null,
    val type: String? = null,
    val label: String? = null,
    val amountCents: Int? = null,
    val quantity: Int? = null,
)

data class EventTeamBillingPaymentSnapshot(
    val id: String,
    val billId: String,
    val sequence: Int,
    val status: String? = null,
    val amountCents: Int,
    val paidAmountCents: Int? = null,
    val refundedAmountCents: Int,
    val refundableAmountCents: Int,
    val paidAt: String? = null,
    val paymentIntentId: String? = null,
    val isRefundable: Boolean,
    val manualPaymentProofs: List<ManualPaymentProof> = emptyList(),
)

data class EventTeamBillingBillSnapshot(
    val id: String,
    val ownerType: String,
    val ownerId: String,
    val ownerName: String,
    val totalAmountCents: Int,
    val paidAmountCents: Int,
    val originalAmountCents: Int = totalAmountCents,
    val discountAmountCents: Int = 0,
    val discountedAmountCents: Int = totalAmountCents,
    val discounts: List<BillDiscountSummary> = emptyList(),
    val refundedAmountCents: Int,
    val refundableAmountCents: Int,
    val status: String? = null,
    val allowSplit: Boolean? = null,
    val lineItems: List<EventTeamBillingLineItem> = emptyList(),
    val payments: List<EventTeamBillingPaymentSnapshot> = emptyList(),
)

data class EventTeamBillingTotals(
    val paidAmountCents: Int,
    val refundedAmountCents: Int,
    val refundableAmountCents: Int,
)

data class EventTeamBillingSnapshot(
    val teamId: String,
    val teamName: String? = null,
    val playerIds: List<String> = emptyList(),
    val users: List<EventTeamBillingUserOption> = emptyList(),
    val bills: List<EventTeamBillingBillSnapshot> = emptyList(),
    val totals: EventTeamBillingTotals = EventTeamBillingTotals(
        paidAmountCents = 0,
        refundedAmountCents = 0,
        refundableAmountCents = 0,
    ),
)

data class EventTeamBillCreateRequest(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val allowSplit: Boolean = false,
    val label: String? = null,
)

data class EventTeamPaymentCheckoutRequest(
    val ownerType: String,
    val ownerId: String? = null,
    val eventAmountCents: Int,
    val taxAmountCents: Int = 0,
    val divisionId: String? = null,
    val label: String? = null,
)

data class EventTeamPaymentCheckout(
    val checkoutUrl: String,
    val qrCodeUrl: String,
    val amountCents: Int,
    val eventAmountCents: Int,
    val billOwnerType: String,
    val billOwnerId: String,
    val payerUserId: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val checkoutSessionId: String? = null,
)

data class PurchaseIntentTimeSlotContext(
    val id: String? = null,
    val priceCents: Int? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val rentalSelections: List<RentalOrderSelectionRequest> = emptyList(),
)

@Serializable
data class RentalOrderSelectionRequest(
    val key: String? = null,
    val scheduledFieldIds: List<String>,
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int> = emptyList(),
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val endDate: String,
    val timeZone: String? = null,
    val repeating: Boolean = false,
)

data class RentalOrderItem(
    val id: String,
    val fieldId: String,
    val start: String,
    val end: String,
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
)

data class RentalOrderResult(
    val bookingId: String,
    val billId: String? = null,
    val eventId: String? = null,
    val totalCents: Int,
    val items: List<RentalOrderItem> = emptyList(),
    val createEventUrl: String? = null,
)

data class RentalResourceOption(
    val id: String,
    val bookingId: String,
    val bookingItemId: String,
    val organizationId: String,
    val organizationName: String? = null,
    val renterOrganizationId: String? = null,
    val field: Field,
    val start: Instant,
    val end: Instant,
    val timeZone: String,
    val priceCents: Int,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val eventId: String? = null,
    val eventTimeSlotId: String? = null,
)

data class RecordSignatureResult(
    val operationId: String? = null,
    val syncStatus: String? = null,
)

data class BoldSignOperationStatus(
    val operationId: String,
    val operationType: String? = null,
    val status: String,
    val error: String? = null,
    val templateDocumentId: String? = null,
    val signedDocumentRecordId: String? = null,
    val templateId: String? = null,
    val documentId: String? = null,
    val updatedAt: String? = null,
) {
    fun isConfirmed(): Boolean = status.trim().equals("CONFIRMED", ignoreCase = true)

    fun isFailed(): Boolean {
        val normalized = status.trim().uppercase()
        return normalized == "FAILED" || normalized == "FAILED_RETRYABLE" || normalized == "TIMED_OUT"
    }
}

data class DiscountCode(
    val id: String,
    val discountId: String,
    val code: String,
    val usageLimit: Int? = null,
    val usedCount: Int = 0,
    val status: String = "ACTIVE",
)

data class DiscountOffer(
    val id: String,
    val ownerType: String,
    val ownerId: String,
    val name: String,
    val description: String? = null,
    val status: String = "ACTIVE",
    val targetType: String,
    val targetId: String,
    val originalPriceCents: Int,
    val discountedPriceCents: Int,
    val codes: List<DiscountCode> = emptyList(),
)

data class DiscountTarget(
    val id: String,
    val label: String,
    val description: String? = null,
    val priceCents: Int,
    val itemType: String,
    val targetType: String,
)

@Serializable
data class SignStep(
    val templateId: String,
    val type: String = "TEXT",
    val title: String? = null,
    val content: String? = null,
    val signOnce: Boolean = false,
    val requiredSignerType: String? = null,
    val requiredSignerLabel: String? = null,
    val url: String? = null,
    val signingUrl: String? = null,
    val boldSignUrl: String? = null,
    val documentSigningUrl: String? = null,
    val documentId: String? = null,
    @SerialName("documentID") val legacyDocumentId: String? = null,
    val operationId: String? = null,
    val syncStatus: String? = null,
) {
    fun isTextStep(): Boolean {
        return type.equals("TEXT", ignoreCase = true) || resolvedSigningUrl().isNullOrBlank()
    }

    fun resolvedSigningUrl(): String? = listOf(
        url,
        signingUrl,
        boldSignUrl,
        documentSigningUrl,
    ).firstOrNull { !it.isNullOrBlank() }

    fun resolvedDocumentId(): String? = listOf(
        documentId,
        legacyDocumentId,
    ).firstOrNull { !it.isNullOrBlank() }
}

@Serializable
data class PurchaseIntent(
    val paymentIntent: String? = null,
    val ephemeralKey: String? = null,
    val customer: String? = null,
    val publishableKey: String? = null,
    val checkoutMode: String? = null,
    val checkoutUrl: String? = null,
    val checkoutSessionId: String? = null,
    val registrationId: String? = null,
    val registrationHoldExpiresAt: String? = null,
    val registrationHoldTtlSeconds: Int? = null,
    val taxCalculationId: String? = null,
    val taxCategory: String? = null,
    val taxMode: String? = null,
    val taxReasonCode: String? = null,
    val taxJurisdictionState: String? = null,
    val feeBreakdown: FeeBreakdown? = null,
    val billId: String? = null,
    val billPaymentId: String? = null,
    val boldSignUrl: String? = null,
    val boldsignUrl: String? = null,
    val documentSigningUrl: String? = null,
    val documentSignUrl: String? = null,
    val signingUrl: String? = null,
    val signatureUrl: String? = null,
    val requiresSignature: Boolean? = null,
    val signatureRequired: Boolean? = null,
    val documentSigningRequired: Boolean? = null,
    val documentSigned: Boolean? = null,
    val signatureCompleted: Boolean? = null,
    val signed: Boolean? = null,
    val error: String? = null,
) {
    fun resolvedSigningUrl(): String? = listOf(
        boldSignUrl,
        boldsignUrl,
        documentSigningUrl,
        documentSignUrl,
        signingUrl,
        signatureUrl,
    ).firstOrNull { !it.isNullOrBlank() }

    fun isSignatureRequired(): Boolean {
        return requiresSignature
            ?: signatureRequired
            ?: documentSigningRequired
            ?: !resolvedSigningUrl().isNullOrBlank()
    }

    fun isSignatureCompleted(): Boolean {
        return documentSigned
            ?: signatureCompleted
            ?: signed
            ?: false
    }
}

@Serializable
data class DiscountPreview(
    val code: String? = null,
    val applied: Boolean = false,
    val originalAmountCents: Int = 0,
    val discountAmountCents: Int = 0,
    val discountedAmountCents: Int = 0,
    val discountId: String? = null,
    val discountCodeId: String? = null,
    val error: String? = null,
)

@Serializable
data class FeeBreakdown(
    val eventPrice: Int,
    val stripeFee: Int,
    val stripeProcessingFee: Int? = null,
    val stripeTaxServiceFee: Int? = null,
    val processingFee: Int,
    val mvpFee: Int? = null,
    val taxAmount: Int? = null,
    val purchaseType: String? = null,
    val totalCharge: Int,
    val hostReceives: Int,
    val feePercentage: Float,
)

@Serializable
@OptIn(ExperimentalTime::class)
data class RefundResponse(
    val refundId: String? = null,
    val success: Boolean? = null,
    val emailSent: Boolean? = null,
    val message: String? = null,
    val amount: Int? = null,
    val reason: String? = null,
    val error: String? = null,
)
