package com.razumly.mvp.organizationDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.OrganizationReview
import com.razumly.mvp.core.data.dataTypes.OrganizationReviewsPayload
import kotlin.math.roundToInt
import com.razumly.mvp.core.presentation.composables.NetworkAvatar

@Composable
internal fun OrganizationReviewRatingAction(
    payload: OrganizationReviewsPayload?,
    isLoading: Boolean,
    onClick: () -> Unit,
) {
    val reviewCount = payload?.summary?.reviewCount ?: 0
    val averageRating = payload?.summary?.averageRating
    TextButton(
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
    ) {
        if (isLoading && payload == null) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        } else {
            Icon(
                imageVector = if (reviewCount > 0) Icons.Filled.Star else Icons.Outlined.Star,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = if (reviewCount > 0 && averageRating != null) {
                    "${averageRating.reviewRatingLabel()} ($reviewCount)"
                } else {
                    "No reviews"
                },
            )
        }
    }
}

@Composable
internal fun OrganizationReviewsPreviewSection(
    payload: OrganizationReviewsPayload?,
    isLoading: Boolean,
    onViewReviews: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OrganizationOverviewSectionHeader(
            title = "Reviews",
            onMore = onViewReviews,
        )
        when {
            isLoading && payload == null -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text("Loading reviews...", modifier = Modifier.padding(start = 10.dp))
                }
            }

            payload == null || payload.summary.reviewCount == 0 -> {
                Text(
                    text = "No reviews yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = payload.summary.averageRating?.reviewRatingLabel() ?: "-",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(modifier = Modifier.size(8.dp))
                            ReviewStars(rating = payload.summary.averageRating ?: 0.0)
                        }
                        Text(
                            text = "${payload.summary.reviewCount} ${if (payload.summary.reviewCount == 1) "review" else "reviews"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(payload.reviews.take(4), key = OrganizationReview::id) { review ->
                        ReviewPreviewCard(review = review, onClick = onViewReviews)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewPreviewCard(
    review: OrganizationReview,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier.width(280.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NetworkAvatar(
                    displayName = review.reviewer.displayName,
                    imageRef = review.reviewer.profileImageUrl,
                    size = 36.dp,
                    contentDescription = null,
                )
                Column(modifier = Modifier.padding(start = 10.dp)) {
                    Text(
                        text = review.reviewer.displayName,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                    ReviewStars(rating = review.rating.toDouble(), iconSize = 15.dp)
                }
            }
            review.body?.takeIf(String::isNotBlank)?.let { body ->
                Text(
                    text = body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OrganizationReviewsTabContent(
    payload: OrganizationReviewsPayload?,
    isLoading: Boolean,
    isMutating: Boolean,
    bottomPadding: Dp,
    onRefresh: () -> Unit,
    onSave: (Int, String?) -> Unit,
    onDelete: (String) -> Unit,
    onReport: (String) -> Unit,
    onSignIn: () -> Unit,
) {
    var editorOpen by remember { mutableStateOf(false) }
    var draftRating by remember { mutableIntStateOf(0) }
    var draftBody by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<OrganizationReview?>(null) }
    var pendingReport by remember { mutableStateOf<OrganizationReview?>(null) }

    fun openEditor() {
        draftRating = payload?.viewerReview?.rating ?: 0
        draftBody = payload?.viewerReview?.body.orEmpty()
        editorOpen = true
    }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 16.dp + bottomPadding),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Reviews", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(
                            "Ratings and feedback from the BracketIQ community.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    when {
                        payload?.canReview == true -> {
                            Button(onClick = ::openEditor) {
                                Text(if (payload.viewerReview == null) "Write review" else "Edit review")
                            }
                        }

                        payload?.viewerIsAuthenticated == false -> {
                            Button(onClick = onSignIn) { Text("Sign in") }
                        }
                    }
                }
            }
        }

        if (isLoading && payload == null) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    Text("Loading reviews...", modifier = Modifier.padding(start = 12.dp))
                }
            }
        } else if (payload == null) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("Reviews are unavailable right now.")
                    TextButton(onClick = onRefresh) { Text("Try again") }
                }
            }
        } else {
            item {
                ReviewSummary(payload = payload)
            }

            val cannotReviewReason = payload.cannotReviewReason
            if (!payload.canReview && payload.viewerIsAuthenticated && !cannotReviewReason.isNullOrBlank()) {
                item {
                    Text(
                        text = cannotReviewReason,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (payload.viewerReview?.status == "HIDDEN") {
                item {
                    Text(
                        text = "Your review was removed from the public list by a moderator. Editing it will not republish it.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            if (payload.reviews.isEmpty()) {
                item {
                    Text(
                        text = "No reviews yet. Be the first to share your experience.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(payload.reviews, key = OrganizationReview::id) { review ->
                    ReviewCard(
                        review = review,
                        canEdit = payload.viewerReview?.id == review.id,
                        canReport = payload.viewerIsAuthenticated && payload.viewerReview?.id != review.id,
                        onEdit = ::openEditor,
                        onReport = { pendingReport = review },
                    )
                }
            }
        }
    }

    if (editorOpen && payload != null) {
        ModalBottomSheet(onDismissRequest = { if (!isMutating) editorOpen = false }) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Text(
                    text = if (payload.viewerReview == null) "Write a review" else "Edit your review",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Column {
                    Text("Your rating", style = MaterialTheme.typography.labelLarge)
                    RatingSelector(rating = draftRating, onRatingChange = { draftRating = it })
                    if (draftRating == 0) {
                        Text(
                            "Choose 1 to 5 stars.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                OutlinedTextField(
                    value = draftBody,
                    onValueChange = { value -> if (value.length <= 2000) draftBody = value },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Review (optional)") },
                    placeholder = { Text("Share what stood out about this organization.") },
                    minLines = 5,
                    supportingText = { Text("${draftBody.length}/2000") },
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (payload.viewerReview != null) {
                        TextButton(
                            enabled = !isMutating,
                            onClick = { pendingDelete = payload.viewerReview },
                        ) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                    } else {
                        Spacer(modifier = Modifier.size(1.dp))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(enabled = !isMutating, onClick = { editorOpen = false }) { Text("Cancel") }
                        Button(
                            enabled = draftRating in 1..5 && !isMutating,
                            onClick = {
                                onSave(draftRating, draftBody.trim().takeIf(String::isNotBlank))
                                editorOpen = false
                            },
                        ) {
                            if (isMutating) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Text("Publish")
                            }
                        }
                    }
                }
            }
        }
    }

    pendingDelete?.let { review ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete review?") },
            text = { Text("This removes your rating and written review from the organization.") },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("Cancel") } },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        editorOpen = false
                        onDelete(review.id)
                    },
                ) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
        )
    }

    pendingReport?.let { review ->
        AlertDialog(
            onDismissRequest = { pendingReport = null },
            title = { Text("Report this review?") },
            text = { Text("BracketIQ moderators will review it for inappropriate or misleading content.") },
            dismissButton = { TextButton(onClick = { pendingReport = null }) { Text("Cancel") } },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingReport = null
                        onReport(review.id)
                    },
                ) { Text("Report") }
            },
        )
    }
}

@Composable
private fun ReviewSummary(payload: OrganizationReviewsPayload) {
    val summary = payload.summary
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = summary.averageRating?.reviewRatingLabel() ?: "-",
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
            )
            Column(modifier = Modifier.padding(start = 14.dp)) {
                ReviewStars(rating = summary.averageRating ?: 0.0)
                Text(
                    "${summary.reviewCount} ${if (summary.reviewCount == 1) "review" else "reviews"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (rating in 5 downTo 1) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("$rating", style = MaterialTheme.typography.labelSmall, modifier = Modifier.size(width = 20.dp, height = 18.dp))
                    LinearProgressIndicator(
                        progress = {
                            if (summary.reviewCount == 0) 0f
                            else summary.countFor(rating).toFloat() / summary.reviewCount.toFloat()
                        },
                        modifier = Modifier.weight(1f).height(8.dp),
                    )
                    Text(
                        text = summary.countFor(rating).toString(),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
        HorizontalDivider()
    }
}

private fun Double.reviewRatingLabel(): String {
    val tenths = (this * 10).roundToInt()
    return "${tenths / 10}.${tenths % 10}"
}

@Composable
private fun ReviewCard(
    review: OrganizationReview,
    canEdit: Boolean,
    canReport: Boolean,
    onEdit: () -> Unit,
    onReport: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    NetworkAvatar(
                        displayName = review.reviewer.displayName,
                        imageRef = review.reviewer.profileImageUrl,
                        size = 42.dp,
                        contentDescription = null,
                    )
                    Column(modifier = Modifier.padding(start = 10.dp)) {
                        Text(review.reviewer.displayName, fontWeight = FontWeight.SemiBold)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ReviewStars(rating = review.rating.toDouble(), iconSize = 16.dp)
                            Text(
                                text = review.updatedAt.take(10),
                                modifier = Modifier.padding(start = 8.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                when {
                    canEdit -> TextButton(onClick = onEdit) { Text("Edit") }
                    canReport -> TextButton(onClick = onReport) { Text("Report") }
                }
            }
            review.body?.takeIf(String::isNotBlank)?.let { body ->
                Text(body, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun RatingSelector(rating: Int, onRatingChange: (Int) -> Unit) {
    Row {
        for (star in 1..5) {
            IconButton(onClick = { onRatingChange(star) }) {
                Icon(
                    imageVector = if (star <= rating) Icons.Filled.Star else Icons.Outlined.Star,
                    contentDescription = "$star stars",
                    tint = if (star <= rating) Color(0xFFF5A623) else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ReviewStars(rating: Double, iconSize: Dp = 18.dp) {
    Row {
        for (star in 1..5) {
            Icon(
                imageVector = if (star <= rating) Icons.Filled.Star else Icons.Outlined.Star,
                contentDescription = null,
                modifier = Modifier.size(iconSize),
                tint = if (star <= rating) Color(0xFFF5A623) else MaterialTheme.colorScheme.outline,
            )
        }
    }
}
