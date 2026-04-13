@file:OptIn(kotlin.experimental.ExperimentalObjCName::class)

package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
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
data class Organization(
    val id: String,
    val name: String,
    val location: String?,
    val address: String? = null,
    @property:ObjCName(swiftName = "organizationDescription")
    val description: String?,
    val logoId: String?,
    val ownerId: String,
    val hostIds: List<String> = emptyList(),
    val website: String?,
    val sports: List<String> = emptyList(),
    val officialIds: List<String>,
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
    val teamIds: List<String> = emptyList()
)

@Serializable
data class OrganizationDTO(
    val name: String,
    val location: String? = null,
    val address: String? = null,
    @property:ObjCName(swiftName = "organizationDescription")
    val description: String? = null,
    val logoId: String? = null,
    val ownerId: String,
    val hostIds: List<String> = emptyList(),
    val website: String? = null,
    val sports: List<String> = emptyList(),
    val officialIds: List<String> = emptyList(),
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
    val teamIds: List<String> = emptyList()
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
            hostIds = hostIds,
            website = website,
            sports = sports,
            officialIds = officialIds,
            hasStripeAccount = hasStripeAccount,
            verificationStatus = verificationStatus,
            verifiedAt = verifiedAt,
            verificationReviewStatus = verificationReviewStatus,
            verificationReviewNotes = verificationReviewNotes,
            verificationReviewUpdatedAt = verificationReviewUpdatedAt,
            coordinates = coordinates,
            fieldIds = fieldIds,
            productIds = productIds,
            teamIds = teamIds
        )
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
