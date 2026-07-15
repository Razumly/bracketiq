@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
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
data class OrganizationDivisionSummary(
    val count: Int = 0,
    val minPrice: Int? = null,
    val maxPrice: Int? = null,
)

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
    val fieldIds: List<String>,
    val productIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    val publicSlug: String? = null,
    val publicPageEnabled: Boolean = false,
    val staffMembers: List<OrganizationStaffMember> = emptyList(),
    val staffInvites: List<Invite> = emptyList(),
    val staffEmailsByUserId: Map<String, String> = emptyMap(),
    val viewerPermissions: List<String> = emptyList(),
    val facilities: List<Facility> = emptyList(),
    val divisionSummary: OrganizationDivisionSummary = OrganizationDivisionSummary(),
)

fun Organization.activeAffiliateRentalFacilities(): List<Facility> =
    facilities.filter { facility -> facility.isActiveAffiliateRental() }

fun Organization.resolvedLogoRef(): String? =
    logoUrl?.trim()?.takeIf { it.isNotBlank() }
        ?: imageUrl?.trim()?.takeIf { it.isNotBlank() }
        ?: logoId?.trim()?.takeIf { it.isNotBlank() }

fun Organization.normalizedAffiliateRentalUrl(): String? =
    activeAffiliateRentalFacilities().firstNotNullOfOrNull { facility -> facility.normalizedAffiliateUrl() }

@Serializable
data class OrganizationStaffMember(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val organizationId: String = "",
    val userId: String = "",
    val types: List<String> = emptyList(),
    val roleId: String? = null,
) {
    val resolvedId: String get() = id ?: legacyId ?: ""
}

@Serializable
data class OrganizationDTO(
    val name: String,
    val location: String? = null,
    val address: String? = null,
    @property:ObjCName(swiftName = "organizationDescription")
    val description: String? = null,
    val logoId: String? = null,
    val ownerId: String,
    val website: String? = null,
    val sports: List<String> = emptyList(),
    val hasStripeAccount: Boolean = false,
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
    val coordinates: List<Double>? = null,
    val fieldIds: List<String> = emptyList(),
    val productIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    val publicSlug: String? = null,
    val publicPageEnabled: Boolean = false,
    val staffMembers: List<OrganizationStaffMember> = emptyList(),
    val staffInvites: List<Invite> = emptyList(),
    val staffEmailsByUserId: Map<String, String> = emptyMap(),
    val viewerPermissions: List<String> = emptyList(),
    val facilities: List<Facility> = emptyList(),
    val divisionSummary: OrganizationDivisionSummary = OrganizationDivisionSummary(),
) {
    fun toOrganization(id: String): Organization =
        Organization(
            id = id,
            name = name,
            location = location,
            address = address,
            description = description,
            logoId = logoId,
            ownerId = ownerId,
            website = website,
            sports = sports,
            hasStripeAccount = hasStripeAccount,
            verificationStatus = verificationStatus,
            verifiedAt = verifiedAt,
            verificationReviewStatus = verificationReviewStatus,
            verificationReviewNotes = verificationReviewNotes,
            verificationReviewUpdatedAt = verificationReviewUpdatedAt,
            coordinates = coordinates,
            fieldIds = fieldIds,
            productIds = productIds,
            teamIds = teamIds,
            publicSlug = publicSlug,
            publicPageEnabled = publicPageEnabled,
            staffMembers = staffMembers,
            staffInvites = staffInvites,
            staffEmailsByUserId = staffEmailsByUserId,
            viewerPermissions = viewerPermissions,
            facilities = facilities,
            divisionSummary = divisionSummary,
        )
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
