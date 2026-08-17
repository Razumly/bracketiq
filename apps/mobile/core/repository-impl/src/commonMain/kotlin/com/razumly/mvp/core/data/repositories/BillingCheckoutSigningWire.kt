package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.network.dto.BillingTeamRefDto
import com.razumly.mvp.core.network.dto.RegistrationQuestionAnswerDto
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
internal fun toFriendlyBoldSignMessage(rawMessage: String?): String? {
    val normalized = rawMessage?.trim()?.takeIf(String::isNotBlank) ?: return null
    val lowercase = normalized.lowercase()
    val looksLikeBoldSignRateLimit = lowercase.contains("boldsign")
        && (
            lowercase.contains("429")
                || lowercase.contains("too many requests")
                || lowercase.contains("rate limit")
            )

    return if (looksLikeBoldSignRateLimit) {
        BOLD_SIGN_RATE_LIMIT_FRIENDLY_MESSAGE
    } else {
        normalized
    }
}

internal fun Throwable.withFriendlyBoldSignMessage(): Throwable {
    val friendlyMessage = toFriendlyBoldSignMessage(message) ?: return this
    if (friendlyMessage == message) {
        return this
    }
    return Exception(friendlyMessage, this)
}

internal fun Map<String, String>.toBillingRegistrationQuestionAnswerDtos(): List<RegistrationQuestionAnswerDto> =
    mapNotNull { (questionId, answer) ->
        val normalizedQuestionId = questionId.trim().takeIf(String::isNotBlank) ?: return@mapNotNull null
        RegistrationQuestionAnswerDto(
            questionId = normalizedQuestionId,
            answer = answer,
        )
    }

internal fun buildEmbeddedSigningRedirectUrl(eventId: String): String? {
    val normalizedEventId = eventId.trim().takeIf(String::isNotBlank) ?: return null
    return "https://bracket-iq.com/events/$normalizedEventId"
}

@Serializable
internal data class StripeOnboardingLinkResponseDto(
    val onboardingUrl: String,
    val expiresAt: Long? = null,
)

@Serializable
internal data class EventSignLinksRequestDto(
    val userId: String? = null,
    val userEmail: String? = null,
    val signerContext: String? = null,
    val childUserId: String? = null,
    val childEmail: String? = null,
    val redirectUrl: String? = null,
)

@Serializable
internal data class RentalSignLinksRequestDto(
    val userId: String? = null,
    val userEmail: String? = null,
    val eventId: String? = null,
    val organizationId: String? = null,
    val templateIds: List<String> = emptyList(),
    val redirectUrl: String? = null,
)

@Serializable
internal data class EventSignLinksResponseDto(
    val signLinks: List<SignStep> = emptyList(),
    val error: String? = null,
)

@Serializable
internal data class ProfileDocumentsResponseDto(
    val unsigned: List<ProfileDocumentCardDto> = emptyList(),
    val signed: List<ProfileDocumentCardDto> = emptyList(),
    val error: String? = null,
)

@Serializable
internal data class ProfileDocumentCardDto(
    val id: String? = null,
    val status: String? = null,
    val eventId: String? = null,
    val eventName: String? = null,
    val teamId: String? = null,
    val teamName: String? = null,
    val organizationId: String? = null,
    val organizationName: String? = null,
    val templateId: String? = null,
    val title: String? = null,
    val type: String? = null,
    val requiredSignerType: String? = null,
    val requiredSignerLabel: String? = null,
    val signerContext: String? = null,
    val signerContextLabel: String? = null,
    val childUserId: String? = null,
    val childEmail: String? = null,
    val consentStatus: String? = null,
    val requiresChildEmail: Boolean? = null,
    val statusNote: String? = null,
    val signedAt: String? = null,
    val signedDocumentRecordId: String? = null,
    val viewUrl: String? = null,
    val content: String? = null,
)

internal fun ProfileDocumentCardDto.toProfileDocumentCardOrNull(
    defaultStatus: ProfileDocumentStatus,
): ProfileDocumentCard? {
    val resolvedId = id?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedTemplateId = templateId?.trim()?.takeIf(String::isNotBlank) ?: return null
    val resolvedSignerType = requiredSignerType?.trim()?.takeIf(String::isNotBlank) ?: "PARTICIPANT"
    val resolvedSignerLabel = requiredSignerLabel?.trim()?.takeIf(String::isNotBlank) ?: resolvedSignerType

    return ProfileDocumentCard(
        id = resolvedId,
        status = parseProfileDocumentStatus(status, defaultStatus),
        eventId = eventId?.trim()?.takeIf(String::isNotBlank),
        eventName = eventName?.trim()?.takeIf(String::isNotBlank),
        teamId = teamId?.trim()?.takeIf(String::isNotBlank),
        teamName = teamName?.trim()?.takeIf(String::isNotBlank),
        organizationId = organizationId?.trim()?.takeIf(String::isNotBlank),
        organizationName = organizationName?.trim()?.takeIf(String::isNotBlank) ?: "Organization",
        templateId = resolvedTemplateId,
        title = title?.trim()?.takeIf(String::isNotBlank) ?: "Document",
        type = parseProfileDocumentType(type),
        requiredSignerType = resolvedSignerType,
        requiredSignerLabel = resolvedSignerLabel,
        signerContext = parseSignerContext(signerContext),
        signerContextLabel = signerContextLabel?.trim()?.takeIf(String::isNotBlank) ?: resolvedSignerLabel,
        childUserId = childUserId?.trim()?.takeIf(String::isNotBlank),
        childEmail = childEmail?.trim()?.takeIf(String::isNotBlank),
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
        requiresChildEmail = requiresChildEmail ?: false,
        statusNote = statusNote?.trim()?.takeIf(String::isNotBlank),
        signedAt = signedAt?.trim()?.takeIf(String::isNotBlank),
        signedDocumentRecordId = signedDocumentRecordId?.trim()?.takeIf(String::isNotBlank),
        viewUrl = viewUrl?.trim()?.takeIf(String::isNotBlank),
        content = content?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun parseProfileDocumentStatus(
    raw: String?,
    defaultStatus: ProfileDocumentStatus,
): ProfileDocumentStatus {
    return when (raw?.trim()?.uppercase()) {
        "UNSIGNED" -> ProfileDocumentStatus.UNSIGNED
        "SIGNED" -> ProfileDocumentStatus.SIGNED
        else -> defaultStatus
    }
}

internal fun parseProfileDocumentType(raw: String?): ProfileDocumentType {
    return when (raw?.trim()?.uppercase()) {
        "TEXT" -> ProfileDocumentType.TEXT
        else -> ProfileDocumentType.PDF
    }
}

internal fun parseSignerContext(raw: String?): SignerContext {
    return when (raw?.trim()?.lowercase()) {
        "parent_guardian" -> SignerContext.PARENT_GUARDIAN
        "child" -> SignerContext.CHILD
        else -> SignerContext.PARTICIPANT
    }
}

@Serializable
internal data class RecordSignatureRequestDto(
    val templateId: String,
    val documentId: String,
    val eventId: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val type: String? = null,
    val signerContext: String? = null,
    val childUserId: String? = null,
)

@Serializable
internal data class RecordSignatureResponseDto(
    val ok: Boolean? = null,
    val operationId: String? = null,
    val syncStatus: String? = null,
    val error: String? = null,
)

@Serializable
internal data class BoldSignOperationStatusDto(
    val operationId: String? = null,
    val operationType: String? = null,
    val status: String? = null,
    val error: String? = null,
    val templateDocumentId: String? = null,
    val signedDocumentRecordId: String? = null,
    val templateId: String? = null,
    val documentId: String? = null,
    val updatedAt: String? = null,
)

internal fun BoldSignOperationStatusDto.toOperationStatus(): BoldSignOperationStatus {
    val normalizedOperationId = operationId?.trim()?.takeIf(String::isNotBlank)
        ?: throw Exception("Operation status response is missing operationId.")
    val normalizedStatus = status?.trim()?.takeIf(String::isNotBlank) ?: "PENDING_WEBHOOK"

    return BoldSignOperationStatus(
        operationId = normalizedOperationId,
        operationType = operationType?.trim()?.takeIf(String::isNotBlank),
        status = normalizedStatus,
        error = error?.trim()?.takeIf(String::isNotBlank),
        templateDocumentId = templateDocumentId?.trim()?.takeIf(String::isNotBlank),
        signedDocumentRecordId = signedDocumentRecordId?.trim()?.takeIf(String::isNotBlank),
        templateId = templateId?.trim()?.takeIf(String::isNotBlank),
        documentId = documentId?.trim()?.takeIf(String::isNotBlank),
        updatedAt = updatedAt?.trim()?.takeIf(String::isNotBlank),
    )
}

internal fun TeamPlayerRegistration.toTeamRegistrationCheckoutTarget(teamId: String): BillingTeamRefDto {
    val normalizedTeamId = teamId.trim().takeIf(String::isNotBlank) ?: teamId
    return BillingTeamRefDto(
        teamId = normalizedTeamId,
        registrantId = registrantId.trim().takeIf(String::isNotBlank) ?: userId.trim().takeIf(String::isNotBlank),
        userId = userId.trim().takeIf(String::isNotBlank),
        parentId = parentId?.trim()?.takeIf(String::isNotBlank),
        registrantType = registrantType.trim().takeIf(String::isNotBlank),
        rosterRole = rosterRole?.trim()?.takeIf(String::isNotBlank),
        consentDocumentId = consentDocumentId?.trim()?.takeIf(String::isNotBlank),
        consentStatus = consentStatus?.trim()?.takeIf(String::isNotBlank),
    )
}
