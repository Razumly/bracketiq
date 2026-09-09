package com.razumly.mvp.schedule

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

enum class ScheduleProposalReviewPhase {
    NONE, PROPOSED, CONFIRMING_PARTIAL, REFRESHING, ACCEPTING, REJECTING, STALE, FAILED, REJECTED, ACCEPTED_SYNC_PENDING;

    val isBusy: Boolean
        get() = this == REFRESHING || this == ACCEPTING || this == REJECTING
}

// Proposals stay outside Room until the organizer accepts them.
data class ScheduleProposalReview<T>(
    val proposal: T? = null,
    val phase: ScheduleProposalReviewPhase = ScheduleProposalReviewPhase.PROPOSED,
    val message: String? = null,
    val acceptanceOperationId: String = "",
    val includePlaceholderTeams: Boolean? = null,
    val eventTimeZone: String = "UTC",
    val isVisible: Boolean = true,
) {
    fun requestAcceptanceConfirmation(isPartial: Boolean): ScheduleProposalReview<T> =
        if (isPartial && phase == ScheduleProposalReviewPhase.PROPOSED) {
            copy(phase = ScheduleProposalReviewPhase.CONFIRMING_PARTIAL)
        } else this

    fun cancelConfirmation(): ScheduleProposalReview<T> =
        if (phase == ScheduleProposalReviewPhase.CONFIRMING_PARTIAL) {
            copy(phase = ScheduleProposalReviewPhase.PROPOSED)
        } else this
}

@Composable
internal fun PartialScheduleConfirmation(
    unscheduledMatchCount: Int,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Accept this Partial Schedule?") },
        text = {
            Text("$unscheduledMatchCount matches will remain unscheduled. " +
                "Accept the placements in this reviewed proposal?")
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Accept partial schedule") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Back to proposal") }
        },
    )
}

@Composable
internal fun ScheduleProposalFailureDialog(
    message: String,
    isBusy: Boolean = false,
    onRetry: () -> Unit,
    onReturnToSetup: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isBusy) onReturnToSetup() },
        title = { Text("Schedule proposal unavailable") },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onRetry, enabled = !isBusy) { Text("Retry proposal") }
        },
        dismissButton = {
            TextButton(onClick = onReturnToSetup, enabled = !isBusy) { Text("Return to setup") }
        },
    )
}
