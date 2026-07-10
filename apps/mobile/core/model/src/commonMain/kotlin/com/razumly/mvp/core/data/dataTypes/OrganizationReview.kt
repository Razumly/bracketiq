package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class OrganizationReviewReviewer(
    val id: String,
    val displayName: String,
    val profileImageUrl: String? = null,
)

@Serializable
data class OrganizationReview(
    val id: String,
    val organizationId: String,
    val reviewerUserId: String,
    val rating: Int,
    val body: String? = null,
    val status: String = "PUBLISHED",
    val createdAt: String,
    val updatedAt: String,
    val reviewer: OrganizationReviewReviewer,
)

@Serializable
data class OrganizationReviewSummary(
    val averageRating: Double? = null,
    val reviewCount: Int = 0,
    val ratingCounts: List<Int> = listOf(0, 0, 0, 0, 0),
) {
    fun countFor(rating: Int): Int = ratingCounts.getOrNull(rating - 1) ?: 0
}

@Serializable
data class OrganizationReviewsPayload(
    val summary: OrganizationReviewSummary = OrganizationReviewSummary(),
    val reviews: List<OrganizationReview> = emptyList(),
    val viewerReview: OrganizationReview? = null,
    val viewerIsAuthenticated: Boolean = false,
    val canReview: Boolean = false,
    val cannotReviewReason: String? = null,
)
