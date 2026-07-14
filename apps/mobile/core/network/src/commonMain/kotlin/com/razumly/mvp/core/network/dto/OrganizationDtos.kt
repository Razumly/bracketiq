package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationStaffMember
import com.razumly.mvp.core.data.dataTypes.resolveOrganizationVerificationReviewStatus
import com.razumly.mvp.core.data.dataTypes.resolveOrganizationVerificationStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class OrganizationsResponseDto(
    val organizations: List<OrganizationApiDto>,
    val pagination: PaginationResponseDto? = null,
)

@Serializable
data class PaginationResponseDto(
    val limit: Int? = null,
    val offset: Int? = null,
    val nextOffset: Int? = null,
    val hasMore: Boolean? = null,
)

/** The single mobile mapping for the current mvp-site organization response contract. */
@Serializable
data class OrganizationApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val description: String? = null,
    val logoId: String? = null,
    val logoUrl: String? = null,
    val imageUrl: String? = null,
    val ownerId: String? = null,
    val website: String? = null,
    val sports: List<String>? = null,
    val hasStripeAccount: Boolean? = null,
    val verificationStatus: String? = null,
    val verifiedAt: String? = null,
    val verificationReviewStatus: String? = null,
    val verificationReviewNotes: String? = null,
    val verificationReviewUpdatedAt: String? = null,
    val coordinates: List<Double>? = null,
    val productIds: List<String>? = null,
    val publicSlug: String? = null,
    val publicPageEnabled: Boolean? = null,
    val staffMembers: List<OrganizationStaffMember>? = null,
    val staffInvites: List<Invite>? = null,
    val staffEmailsByUserId: Map<String, String>? = null,
    val viewerPermissions: List<String>? = null,
    val facilities: List<OrganizationFacilityApiDto>? = null,
) {
    fun toOrganizationOrNull(): Organization? {
        val resolvedId = (id ?: legacyId)?.trim()?.takeIf(String::isNotBlank) ?: return null
        val resolvedName = name?.trim()?.takeIf(String::isNotBlank) ?: return null
        return Organization(
            id = resolvedId,
            name = resolvedName,
            location = location,
            address = address,
            description = description,
            logoId = logoId,
            logoUrl = logoUrl,
            imageUrl = imageUrl,
            ownerId = ownerId?.trim().orEmpty(),
            website = website,
            sports = sports.orEmpty().map(String::trim).filter(String::isNotBlank).distinct(),
            hasStripeAccount = hasStripeAccount ?: false,
            verificationStatus = resolveOrganizationVerificationStatus(
                verificationStatus = verificationStatus,
                hasStripeAccount = hasStripeAccount,
            ),
            verifiedAt = verifiedAt?.trim()?.takeIf(String::isNotBlank),
            verificationReviewStatus = resolveOrganizationVerificationReviewStatus(
                reviewStatus = verificationReviewStatus,
            ),
            verificationReviewNotes = verificationReviewNotes?.trim()?.takeIf(String::isNotBlank),
            verificationReviewUpdatedAt = verificationReviewUpdatedAt?.trim()?.takeIf(String::isNotBlank),
            coordinates = coordinates,
            productIds = productIds.orEmpty().map(String::trim).filter(String::isNotBlank).distinct(),
            publicSlug = publicSlug?.trim()?.takeIf(String::isNotBlank),
            publicPageEnabled = publicPageEnabled ?: false,
            staffMembers = staffMembers.orEmpty(),
            staffInvites = staffInvites.orEmpty(),
            staffEmailsByUserId = staffEmailsByUserId.orEmpty(),
            viewerPermissions = viewerPermissions.orEmpty()
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct(),
            facilities = facilities.orEmpty().mapNotNull(OrganizationFacilityApiDto::toFacilityOrNull),
        )
    }
}

@Serializable
data class OrganizationFacilityApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val coordinates: List<Double>? = null,
    val status: String? = null,
    val affiliateUrl: String? = null,
) {
    fun toFacilityOrNull(): Facility? {
        val resolvedId = (id ?: legacyId)?.trim().orEmpty()
        val resolvedName = name?.trim()?.takeIf(String::isNotBlank)
        val resolvedLocation = location?.trim()?.takeIf(String::isNotBlank)
        val resolvedAddress = address?.trim()?.takeIf(String::isNotBlank)
        val resolvedStatus = status?.trim()?.takeIf(String::isNotBlank)
        val resolvedAffiliateUrl = affiliateUrl?.trim()?.takeIf(String::isNotBlank)
        if (
            resolvedId.isBlank() &&
            resolvedName == null &&
            resolvedLocation == null &&
            resolvedAddress == null &&
            coordinates.isNullOrEmpty() &&
            resolvedAffiliateUrl == null
        ) {
            return null
        }
        return Facility(
            id = resolvedId,
            legacyId = legacyId?.trim()?.takeIf(String::isNotBlank),
            name = resolvedName,
            location = resolvedLocation,
            address = resolvedAddress,
            coordinates = coordinates,
            status = resolvedStatus,
            affiliateUrl = resolvedAffiliateUrl,
        )
    }
}
