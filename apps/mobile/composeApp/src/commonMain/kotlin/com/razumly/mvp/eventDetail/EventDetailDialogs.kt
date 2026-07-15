package com.razumly.mvp.eventDetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.composables.TeamCard
import kotlin.math.round
import kotlinx.datetime.LocalDate

@Composable
internal fun EventQrCodeDialog(
    eventName: String,
    qrImageUrl: String,
    onDismiss: () -> Unit,
    onShareQrCode: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Event QR Code") },
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f),
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        AsyncImage(
                            model = qrImageUrl,
                            contentDescription = "QR code for $eventName",
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(4.dp),
                            contentScale = ContentScale.Fit,
                        )
                    }
                }
                Text(
                    text = eventName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onShareQrCode) {
                Text("Share QR Code")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

@Composable
fun TeamSelectionDialog(
    eventSportLabel: String,
    teams: List<TeamWithPlayers>,
    onTeamSelected: (TeamWithPlayers) -> Unit,
    onDismiss: () -> Unit,
    onCreateTeam: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select a team for $eventSportLabel") },
        text = {
            LazyColumn {
                items(teams) { team ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onTeamSelected(team) }
                            .padding(8.dp)
                    ) {
                        TeamCard(team)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onCreateTeam) {
                Text("Manage Teams")
            }
        })
}

private fun WithdrawTargetMembership.displayName(): String = when (this) {
    WithdrawTargetMembership.PARTICIPANT -> "Registered"
    WithdrawTargetMembership.WAITLIST -> "Waitlist"
    WithdrawTargetMembership.FREE_AGENT -> "Free Agent"
}

@Composable
internal fun WithdrawTargetDialog(
    targets: List<WithdrawTargetOption>,
    onDismiss: () -> Unit,
    onTargetSelected: (WithdrawTargetOption) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Withdraw Profile") },
        text = {
            LazyColumn {
                items(targets, key = { it.userId }) { target ->
                    val title = if (target.isSelf) "My Registration" else target.fullName
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onTargetSelected(target) }
                            .padding(vertical = 8.dp),
                    ) {
                        Text(
                            text = title.ifBlank { "Registration" },
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            text = target.membership.displayName(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    HorizontalDivider()
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

@Composable
fun TextSignatureDialog(
    prompt: TextSignaturePromptState,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    progressMessage: String? = null,
) {
    var accepted by remember(prompt.step.templateId) { mutableStateOf(false) }
    val isSyncing = !progressMessage.isNullOrBlank()

    AlertDialog(
        onDismissRequest = { if (!isSyncing) onDismiss() },
        title = { Text(prompt.step.title ?: "Required Document Signature") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Document ${prompt.currentStep} of ${prompt.totalSteps}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                prompt.step.requiredSignerLabel?.let { signerLabel ->
                    Text(
                        text = "Required signer: $signerLabel",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = prompt.step.content ?: "No document text was provided.",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp, max = 320.dp)
                        .verticalScroll(rememberScrollState())
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = accepted,
                        onCheckedChange = { accepted = it },
                        enabled = !isSyncing,
                    )
                    Text("I have read and agree to this document.")
                }
                progressMessage
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                    ?.let { message ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Text(
                                text = message,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = accepted && !isSyncing,
            ) {
                Text("Accept and Continue")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss, enabled = !isSyncing) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun RefundReasonDialog(
    currentReason: String,
    onReasonChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Refund Request") }, text = {
        Column {
            Text(
                "Please provide a reason for your refund request:",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            StandardTextField(
                value = currentReason,
                onValueChange = onReasonChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = "Enter reason...",
            )
        }
    }, confirmButton = {
        Button(
            onClick = onConfirm, enabled = currentReason.isNotBlank()
        ) {
            Text("Submit Refund Request")
        }
    }, dismissButton = {
        Button(onClick = onDismiss) {
            Text("Cancel")
        }
    })
}

private fun Int.centsToDollars(): String {
    val dollars = this / 100.0
    val rounded = round(dollars * 100) / 100
    val wholePart = rounded.toInt()
    val decimalPart = ((rounded - wholePart) * 100).toInt()
    return if (decimalPart == 0) {
        "$wholePart.00"
    } else if (decimalPart < 10) {
        "$wholePart.0$decimalPart"
    } else {
        "$wholePart.$decimalPart"
    }
}

@Composable
internal fun PaymentPlanPreviewDialog(
    dialogState: PaymentPlanPreviewDialogState,
    onContinue: () -> Unit,
    onCancel: () -> Unit,
) {
    val installmentRows = remember(
        dialogState.installmentAmounts,
        dialogState.installmentDueDates,
        dialogState.installmentDueRelativeDays,
    ) {
        val usesRelativeDueDates = dialogState.installmentDueRelativeDays.isNotEmpty()
        val rowCount = maxOf(
            dialogState.installmentAmounts.size,
            if (usesRelativeDueDates) {
                dialogState.installmentDueRelativeDays.size
            } else {
                dialogState.installmentDueDates.size
            },
        )
        List(rowCount) { index ->
            val amountCents = dialogState.installmentAmounts.getOrNull(index)?.coerceAtLeast(0) ?: 0
            val dueDate = if (usesRelativeDueDates) {
                formatPaymentPlanRelativeDueDay(dialogState.installmentDueRelativeDays.getOrNull(index) ?: 0)
            } else {
                formatPaymentPlanFixedDueDate(dialogState.installmentDueDates.getOrNull(index))
            }
            Triple(index + 1, amountCents, dueDate)
        }
    }
    val ownerSubject = if (dialogState.ownerLabel.equals("You", ignoreCase = true)) {
        "you"
    } else {
        dialogState.ownerLabel
    }

    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Payment plan preview") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Continuing will join this event and start a payment plan for $ownerSubject.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                dialogState.divisionLabel
                    ?.takeIf(String::isNotBlank)
                    ?.let { divisionLabel ->
                        Text(
                            text = "Division: $divisionLabel",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                HorizontalDivider()

                FeeRow(
                    label = "Plan total",
                    amount = dialogState.totalAmountCents.toPaymentPlanPreviewAmount(),
                    isTotal = true,
                )

                if (installmentRows.isNotEmpty()) {
                    HorizontalDivider()
                    installmentRows.forEach { (sequence, amountCents, dueDate) ->
                        PaymentPlanInstallmentRow(
                            installmentNumber = sequence,
                            dueDateLabel = dueDate,
                            amount = amountCents.toPaymentPlanPreviewAmount(),
                        )
                    }
                } else {
                    Text(
                        text = "Installment schedule will be generated after joining.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = onContinue) {
                Text("Continue")
            }
        },
        dismissButton = {
            Button(onClick = onCancel) {
                Text("Cancel")
            }
        },
    )
}

private fun Int.toPaymentPlanPreviewAmount(): String = "$${coerceAtLeast(0).centsToDollars()} + fees"

private fun formatPaymentPlanFixedDueDate(value: String?): String {
    val rawValue = value
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: "TBD"
    val parsed = runCatching { LocalDate.parse(rawValue) }.getOrNull()
    return parsed?.let(::formatPaymentPlanDueDate) ?: rawValue
}

private fun formatPaymentPlanRelativeDueDay(offsetDays: Int): String {
    if (offsetDays == 0) return "Session day"
    val absDays = kotlin.math.abs(offsetDays)
    val unit = if (absDays == 1) "day" else "days"
    return if (offsetDays > 0) {
        "$absDays $unit after session"
    } else {
        "$absDays $unit before session"
    }
}

private fun formatPaymentPlanDueDate(date: LocalDate): String {
    val month = date.month.name.take(3).lowercase().replaceFirstChar { char ->
        if (char.isLowerCase()) char.titlecase() else char.toString()
    }
    return "$month ${date.day}, ${date.year}"
}

@Composable
private fun PaymentPlanInstallmentRow(
    installmentNumber: Int,
    dueDateLabel: String,
    amount: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "Installment $installmentNumber",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = "Due $dueDateLabel",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = amount,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun FeeRow(
    label: String,
    amount: String,
    isTotal: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f),
            style = if (isTotal) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal
        )
        Text(
            text = amount,
            modifier = Modifier.weight(1f),
            style = if (isTotal) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (isTotal) FontWeight.Bold else FontWeight.Normal,
            textAlign = TextAlign.End,
        )
    }
}
