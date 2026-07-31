@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.native.ObjCName

@Serializable
enum class OrganizationVerificationStatus {
    UNVERIFIED,
    LEGACY_CONNECTED,
    PENDING,
    ACTION_REQUIRED,
    VERIFIED,
}

@Serializable
enum class OrganizationVerificationReviewStatus {
    NONE,
    OPEN,
    IN_PROGRESS,
    RESOLVED,
}

@Serializable
enum class OrganizationOriginType {
    FIRST_PARTY,
    AFFILIATE_IMPORTED,
}

@Serializable
enum class OrganizationOwnershipStatus {
    UNCLAIMED,
    CLAIM_PENDING,
    CLAIMED,
    REVIEW_REQUIRED,
    DISPUTED,
    SUSPENDED,
}

@Serializable
enum class OrganizationClaimVerificationLevel {
    NONE,
    AFFILIATION,
    SITE_CONTROL,
    MANUAL_REVIEW,
}

@Serializable
enum class OrganizationOwnershipAction {
    CLAIM,
    VIEW_PENDING_CLAIM,
    REPORT_OWNERSHIP_ISSUE,
    CONTACT_SUPPORT,
    NONE,
}

enum class OrganizationOwnershipBadgeTone {
    NEUTRAL,
    INFO,
    WARNING,
    ERROR,
}

@Serializable
data class OrganizationDivisionSummary(
    val count: Int = 0,
    val minPrice: Int? = null,
    val maxPrice: Int? = null,
)

@Serializable
enum class OrganizationFeature {
    CLUB_TEAMS,
    FACILITIES_RENTALS,
    EVENT_MANAGEMENT,
}

@Serializable
data class Organization(
    val id: String,
    val name: String,
    val location: String?,
    val address: String? = null,
    @property:ObjCName(swiftName = "organizationDescription")
    val description: String?,
    val logoId: String?,
    val logoUrl: String? = null,
    val imageUrl: String? = null,
    val ownerId: String,
    val website: String?,
    val sports: List<String> = emptyList(),
    val enabledFeatures: List<OrganizationFeature> = emptyList(),
    val divisions: List<DivisionDetail> = emptyList(),
    val hasStripeAccount: Boolean,
    val verificationStatus: OrganizationVerificationStatus = if (hasStripeAccount) {
        OrganizationVerificationStatus.LEGACY_CONNECTED
    } else {
        OrganizationVerificationStatus.UNVERIFIED
    },
    val verifiedAt: String? = null,
    val verificationReviewStatus: OrganizationVerificationReviewStatus =
        OrganizationVerificationReviewStatus.NONE,
    val verificationReviewNotes: String? = null,
    val verificationReviewUpdatedAt: String? = null,
    val coordinates: List<Double>?,
    /** Client-enriched rental field IDs; this is not part of the organization API contract. */
    @Transient val fieldIds: List<String> = emptyList(),
    val productIds: List<String> = emptyList(),
    val publicSlug: String? = null,
    val publicPageEnabled: Boolean = false,
    val staffMembers: List<OrganizationStaffMember> = emptyList(),
    val staffInvites: List<Invite> = emptyList(),
    val staffEmailsByUserId: Map<String, String> = emptyMap(),
    val viewerPermissions: List<String> = emptyList(),
    val facilities: List<Facility> = emptyList(),
    val divisionSummary: OrganizationDivisionSummary = OrganizationDivisionSummary(),
    val originType: OrganizationOriginType = OrganizationOriginType.FIRST_PARTY,
    val ownershipStatus: OrganizationOwnershipStatus = OrganizationOwnershipStatus.CLAIMED,
    val claimVerificationLevel: OrganizationClaimVerificationLevel =
        OrganizationClaimVerificationLevel.NONE,
    val claimable: Boolean = ownershipStatus == OrganizationOwnershipStatus.UNCLAIMED,
    val claimUrl: String? = null,
    val ownershipAction: OrganizationOwnershipAction =
        organizationOwnershipActionFor(ownershipStatus),
) {
    val ownershipBadgeLabel: String
        get() = when (ownershipStatus) {
            OrganizationOwnershipStatus.UNCLAIMED -> "Unclaimed profile"
            OrganizationOwnershipStatus.CLAIM_PENDING -> "Claim pending"
            OrganizationOwnershipStatus.CLAIMED -> "Claimed profile"
            OrganizationOwnershipStatus.REVIEW_REQUIRED,
            OrganizationOwnershipStatus.DISPUTED,
            -> "Ownership under review"
            OrganizationOwnershipStatus.SUSPENDED -> "Ownership restricted"
        }

    val ownershipBadgeTone: OrganizationOwnershipBadgeTone
        get() = when (ownershipStatus) {
            OrganizationOwnershipStatus.UNCLAIMED -> OrganizationOwnershipBadgeTone.NEUTRAL
            OrganizationOwnershipStatus.CLAIMED -> OrganizationOwnershipBadgeTone.INFO
            OrganizationOwnershipStatus.CLAIM_PENDING,
            OrganizationOwnershipStatus.REVIEW_REQUIRED,
            OrganizationOwnershipStatus.DISPUTED,
            -> OrganizationOwnershipBadgeTone.WARNING
            OrganizationOwnershipStatus.SUSPENDED -> OrganizationOwnershipBadgeTone.ERROR
        }

    val showsWebsiteVerifiedBadge: Boolean
        get() = ownershipStatus == OrganizationOwnershipStatus.CLAIMED &&
            claimVerificationLevel == OrganizationClaimVerificationLevel.SITE_CONTROL

    val canClaimProfile: Boolean
        get() = claimable && ownershipAction == OrganizationOwnershipAction.CLAIM
}

fun Organization.activeAffiliateRentalFacilities(): List<Facility> =
    facilities.filter { facility -> facility.isActiveAffiliateRental() }

fun Organization.resolvedLogoRef(): String? =
    logoId?.trim()?.takeIf { it.isNotBlank() }
        ?: logoUrl?.trim()?.takeIf { it.isNotBlank() }
        ?: imageUrl?.trim()?.takeIf { it.isNotBlank() }

fun Organization.normalizedAffiliateRentalUrl(): String? =
    activeAffiliateRentalFacilities().firstNotNullOfOrNull { facility -> facility.normalizedAffiliateUrl() }

@Serializable
data class OrganizationStaffMember(
    val id: String,
    val organizationId: String = "",
    val userId: String = "",
    val types: List<String> = emptyList(),
    val roleId: String? = null,
) {
    val resolvedId: String get() = id
}

private const val ORGANIZATION_EVENTS_MANAGE_PERMISSION = "events.manage"

private fun String.normalizedOrganizationToken(): String = trim()

private fun Iterable<String>.normalizedOrganizationTokens(): List<String> =
    map(String::normalizedOrganizationToken)
        .filter(String::isNotBlank)
        .distinct()

private fun OrganizationStaffMember.hasStaffType(type: String): Boolean {
    val normalizedType = type.trim().uppercase()
    return types.any { staffType -> staffType.trim().uppercase() == normalizedType }
}

private fun Invite.blocksStaffMember(organizationId: String, userId: String): Boolean {
    val inviteOrganizationId = this.organizationId?.normalizedOrganizationToken().orEmpty()
    val inviteUserId = this.userId?.normalizedOrganizationToken().orEmpty()
    if (inviteOrganizationId != organizationId || inviteUserId != userId) {
        return false
    }
    return type.trim().uppercase() == "STAFF"
}

private fun Organization.activeStaffIdsForType(type: String): List<String> {
    val normalizedOrganizationId = id.normalizedOrganizationToken()
    return staffMembers
        .filter { staffMember ->
            val memberOrganizationId = staffMember.organizationId.normalizedOrganizationToken()
            val memberUserId = staffMember.userId.normalizedOrganizationToken()
            memberOrganizationId == normalizedOrganizationId &&
                memberUserId.isNotBlank() &&
                staffMember.hasStaffType(type) &&
                staffInvites.none { invite -> invite.blocksStaffMember(memberOrganizationId, memberUserId) }
        }
        .map(OrganizationStaffMember::userId)
        .normalizedOrganizationTokens()
}

fun Organization.activeHostIds(): List<String> =
    (listOf(ownerId) + activeStaffIdsForType("HOST")).normalizedOrganizationTokens()

fun Organization.activeOfficialIds(): List<String> =
    activeStaffIdsForType("OFFICIAL")

fun Organization.canManageEventsForViewer(userId: String): Boolean {
    val normalizedUserId = userId.normalizedOrganizationToken()
    if (normalizedUserId.isBlank()) {
        return false
    }
    return ownerId.normalizedOrganizationToken() == normalizedUserId ||
        viewerPermissions.any { permission ->
            permission.trim().equals(ORGANIZATION_EVENTS_MANAGE_PERMISSION, ignoreCase = true)
        } ||
        activeHostIds().any { hostId -> hostId == normalizedUserId }
}

fun resolveOrganizationVerificationStatus(
    verificationStatus: String?,
    hasStripeAccount: Boolean?,
): OrganizationVerificationStatus {
    return when (verificationStatus?.trim()?.uppercase()) {
        OrganizationVerificationStatus.UNVERIFIED.name -> OrganizationVerificationStatus.UNVERIFIED
        OrganizationVerificationStatus.LEGACY_CONNECTED.name -> OrganizationVerificationStatus.LEGACY_CONNECTED
        OrganizationVerificationStatus.PENDING.name -> OrganizationVerificationStatus.PENDING
        OrganizationVerificationStatus.ACTION_REQUIRED.name -> OrganizationVerificationStatus.ACTION_REQUIRED
        OrganizationVerificationStatus.VERIFIED.name -> OrganizationVerificationStatus.VERIFIED
        else -> if (hasStripeAccount == true) {
            OrganizationVerificationStatus.LEGACY_CONNECTED
        } else {
            OrganizationVerificationStatus.UNVERIFIED
        }
    }
}

fun resolveOrganizationVerificationReviewStatus(
    reviewStatus: String?,
): OrganizationVerificationReviewStatus {
    return when (reviewStatus?.trim()?.uppercase()) {
        OrganizationVerificationReviewStatus.OPEN.name -> OrganizationVerificationReviewStatus.OPEN
        OrganizationVerificationReviewStatus.IN_PROGRESS.name -> OrganizationVerificationReviewStatus.IN_PROGRESS
        OrganizationVerificationReviewStatus.RESOLVED.name -> OrganizationVerificationReviewStatus.RESOLVED
        else -> OrganizationVerificationReviewStatus.NONE
    }
}

fun resolveOrganizationOriginType(originType: String?): OrganizationOriginType {
    return when (originType?.trim()?.uppercase()) {
        OrganizationOriginType.AFFILIATE_IMPORTED.name -> OrganizationOriginType.AFFILIATE_IMPORTED
        else -> OrganizationOriginType.FIRST_PARTY
    }
}

fun resolveOrganizationOwnershipStatus(ownershipStatus: String?): OrganizationOwnershipStatus {
    return when (ownershipStatus?.trim()?.uppercase()) {
        OrganizationOwnershipStatus.UNCLAIMED.name -> OrganizationOwnershipStatus.UNCLAIMED
        OrganizationOwnershipStatus.CLAIM_PENDING.name -> OrganizationOwnershipStatus.CLAIM_PENDING
        OrganizationOwnershipStatus.REVIEW_REQUIRED.name -> OrganizationOwnershipStatus.REVIEW_REQUIRED
        OrganizationOwnershipStatus.DISPUTED.name -> OrganizationOwnershipStatus.DISPUTED
        OrganizationOwnershipStatus.SUSPENDED.name -> OrganizationOwnershipStatus.SUSPENDED
        else -> OrganizationOwnershipStatus.CLAIMED
    }
}

fun resolveOrganizationClaimVerificationLevel(
    verificationLevel: String?,
): OrganizationClaimVerificationLevel {
    return when (verificationLevel?.trim()?.uppercase()) {
        OrganizationClaimVerificationLevel.AFFILIATION.name ->
            OrganizationClaimVerificationLevel.AFFILIATION
        OrganizationClaimVerificationLevel.SITE_CONTROL.name ->
            OrganizationClaimVerificationLevel.SITE_CONTROL
        OrganizationClaimVerificationLevel.MANUAL_REVIEW.name ->
            OrganizationClaimVerificationLevel.MANUAL_REVIEW
        else -> OrganizationClaimVerificationLevel.NONE
    }
}

fun organizationOwnershipActionFor(
    ownershipStatus: OrganizationOwnershipStatus,
): OrganizationOwnershipAction {
    return when (ownershipStatus) {
        OrganizationOwnershipStatus.UNCLAIMED -> OrganizationOwnershipAction.CLAIM
        OrganizationOwnershipStatus.CLAIM_PENDING -> OrganizationOwnershipAction.VIEW_PENDING_CLAIM
        OrganizationOwnershipStatus.CLAIMED -> OrganizationOwnershipAction.REPORT_OWNERSHIP_ISSUE
        OrganizationOwnershipStatus.REVIEW_REQUIRED,
        OrganizationOwnershipStatus.DISPUTED,
        OrganizationOwnershipStatus.SUSPENDED,
        -> OrganizationOwnershipAction.CONTACT_SUPPORT
    }
}

fun resolveOrganizationOwnershipAction(
    ownershipAction: String?,
    ownershipStatus: OrganizationOwnershipStatus,
): OrganizationOwnershipAction {
    return when (ownershipAction?.trim()?.uppercase()) {
        OrganizationOwnershipAction.CLAIM.name -> OrganizationOwnershipAction.CLAIM
        OrganizationOwnershipAction.VIEW_PENDING_CLAIM.name ->
            OrganizationOwnershipAction.VIEW_PENDING_CLAIM
        OrganizationOwnershipAction.REPORT_OWNERSHIP_ISSUE.name ->
            OrganizationOwnershipAction.REPORT_OWNERSHIP_ISSUE
        OrganizationOwnershipAction.CONTACT_SUPPORT.name ->
            OrganizationOwnershipAction.CONTACT_SUPPORT
        OrganizationOwnershipAction.NONE.name -> OrganizationOwnershipAction.NONE
        else -> organizationOwnershipActionFor(ownershipStatus)
    }
}

private const val CANONICAL_ORGANIZATION_CLAIM_ORIGIN = "https://bracket-iq.com"

fun resolveOrganizationClaimUrl(
    rawUrl: String?,
    webBaseUrl: String,
): String? {
    val url = rawUrl?.trim()?.takeIf(String::isNotBlank) ?: return null
    if (url.any { it.isWhitespace() || it.code < 0x20 || it.code == 0x7f } || url.contains('\\')) {
        return null
    }

    fun isClaimPath(value: String): Boolean {
        if (!value.startsWith('/') || value.startsWith("//") || value.contains("//")) return false
        val path = value.substringBefore('?').substringBefore('#')
        val segments = path.removePrefix("/").split('/')
        return segments.size == 3 &&
            segments[0] == "organizations" &&
            segments[1].isNotBlank() &&
            segments[1] != "." &&
            segments[1] != ".." &&
            segments[2] == "claim"
    }

    val normalizedBase = webBaseUrl.trim().trimEnd('/')
    if (
        normalizedBase.any { it.isWhitespace() || it.code < 0x20 || it.code == 0x7f } ||
        normalizedBase.contains('\\') ||
        (!normalizedBase.startsWith("https://") && !normalizedBase.startsWith("http://"))
    ) {
        return null
    }

    if (url.startsWith('/')) {
        return if (isClaimPath(url)) "$normalizedBase$url" else null
    }

    val allowedOrigins = listOf(normalizedBase, CANONICAL_ORGANIZATION_CLAIM_ORIGIN).distinct()
    val matchingOrigin = allowedOrigins.firstOrNull { origin ->
        url.startsWith("$origin/", ignoreCase = true)
    } ?: return null
    val suffix = url.substring(matchingOrigin.length)
    return if (isClaimPath(suffix)) "$matchingOrigin$suffix" else null
}

fun Organization.isVerified(): Boolean = verificationStatus == OrganizationVerificationStatus.VERIFIED

fun Organization.canUsePaidBilling(): Boolean {
    return verificationStatus == OrganizationVerificationStatus.VERIFIED
        || verificationStatus == OrganizationVerificationStatus.LEGACY_CONNECTED
}

fun organizationVerificationStatusLabel(status: OrganizationVerificationStatus): String {
    return when (status) {
        OrganizationVerificationStatus.VERIFIED -> "Verified"
        OrganizationVerificationStatus.ACTION_REQUIRED -> "Action required"
        OrganizationVerificationStatus.PENDING -> "Pending verification"
        OrganizationVerificationStatus.LEGACY_CONNECTED -> "Connected"
        OrganizationVerificationStatus.UNVERIFIED -> "Unverified"
    }
}
