package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.BillingAddressDialog
import com.razumly.mvp.core.presentation.composables.DiscountCodeDialog
import com.razumly.mvp.core.presentation.composables.EmbeddedWebModal
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.getEventQrCodeUrl
import com.razumly.mvp.eventDetail.composables.MatchEditDialog
import com.razumly.mvp.eventDetail.composables.SendNotificationDialog
import com.razumly.mvp.eventDetail.composables.TeamSelectionDialog

internal data class EventDetailOverlayHostState(
    val showWithdrawTargetDialog: Boolean,
    val withdrawTargets: List<WithdrawTargetOption>,
    val showJoinOptionsSheet: Boolean,
    val joinSheetsState: EventDetailJoinSheetsState,
    val showTeamDialog: TeamSelectionDialogState?,
    val showMatchEditDialog: MatchEditDialogState?,
    val showTeamSelectionDialog: Boolean,
    val teamSelectionSportLabel: String,
    val validTeams: List<TeamWithPlayers>,
    val showEventTeamCheckInDialog: Boolean,
    val eventTeamCheckInSaving: Boolean,
    val eventTeamName: String,
    val joinChoiceDialog: JoinChoiceDialogState?,
    val childJoinSelectionDialog: ChildJoinSelectionDialogState?,
    val teamJoinQuestionDialog: TeamJoinQuestionDialogState?,
    val eventRegistrationQuestionDialog: EventRegistrationQuestionDialogState?,
    val paymentPlanPreviewDialog: PaymentPlanPreviewDialogState?,
    val showStandingsConfirmDialog: Boolean,
    val showBuildBracketConfirmDialog: Boolean,
    val showRebuildWithoutPlaceholdersConfirmDialog: Boolean,
    val showQrCodeDialog: Boolean,
    val canShowQrCode: Boolean,
    val eventName: String,
    val eventId: String,
    val showDeleteConfirmation: Boolean,
    val isTemplateEvent: Boolean,
    val hasAnyPaidDivision: Boolean,
    val showNotifyDialog: Boolean,
    val showInviteTeamDialog: Boolean,
    val inviteTeamSuggestions: List<Team>,
    val inviteTeamsLoading: Boolean,
    val selectedDivisionId: String?,
    val registrationDivisionOptions: List<EventDetailDivisionOption>,
    val showInvitePlayerDialog: Boolean,
    val suggestedUsers: List<UserData>,
    val existingParticipantIds: Set<String>,
    val showReportEventDialog: Boolean,
    val reportEventNotes: String,
    val showRefundReasonDialog: Boolean,
    val refundReason: String,
    val textSignaturePrompt: TextSignaturePromptState?,
    val webSignaturePrompt: WebSignaturePromptState?,
    val discountCodePrompt: DiscountCodePromptState?,
    val billingAddressPrompt: BillingAddressDraft?,
)

internal data class EventDetailOverlayHostActions(
    val joinSheetsActions: EventDetailJoinSheetsActions,
    val onDismissWithdrawTargetDialog: () -> Unit,
    val onWithdrawTargetSelected: (WithdrawTargetOption) -> Unit,
    val onMatchTeamSelected: (String, TeamPosition, String?) -> Unit,
    val onDismissMatchTeamSelection: () -> Unit,
    val onDismissMatchEdit: () -> Unit,
    val onConfirmMatchEdit: (com.razumly.mvp.core.data.dataTypes.MatchWithRelations) -> Unit,
    val onDeleteMatch: (String) -> Unit,
    val onJoinTeamSelected: (TeamWithPlayers) -> Unit,
    val onDismissJoinTeamSelection: () -> Unit,
    val onCreateTeam: () -> Unit,
    val onDismissEventTeamCheckIn: () -> Unit,
    val onConfirmEventTeamCheckIn: () -> Unit,
    val onDismissJoinChoice: () -> Unit,
    val onConfirmJoinAsSelf: () -> Unit,
    val onShowChildJoinSelection: () -> Unit,
    val onDismissChildJoinSelection: () -> Unit,
    val onChildSelected: (String) -> Unit,
    val onDismissTeamJoinQuestions: () -> Unit,
    val onSubmitTeamJoinQuestions: (Map<String, String>) -> Unit,
    val onDismissRegistrationQuestions: () -> Unit,
    val onSubmitRegistrationQuestions: (Map<String, String>) -> Unit,
    val onContinuePaymentPlan: () -> Unit,
    val onCancelPaymentPlan: () -> Unit,
    val onDismissStandingsConfirmation: () -> Unit,
    val onConfirmStandings: (Boolean) -> Unit,
    val onDismissBuildBracketConfirmation: () -> Unit,
    val onBuildBrackets: () -> Unit,
    val onDismissRebuildWithoutPlaceholdersConfirmation: () -> Unit,
    val onRebuildWithoutPlaceholders: () -> Unit,
    val onDismissQrCode: () -> Unit,
    val onShareQrCode: () -> Unit,
    val onDismissDeleteConfirmation: () -> Unit,
    val onDeleteEvent: () -> Unit,
    val onSendNotification: suspend (String, String) -> Result<Unit>,
    val onDismissNotification: () -> Unit,
    val onSearchInviteTeams: (String) -> Unit,
    val onInviteTeamDivisionSelected: (String) -> Unit,
    val onInviteTeamSelected: (Team) -> Unit,
    val onDismissInviteTeam: () -> Unit,
    val onSearchUsers: (String) -> Unit,
    val onInvitePlayerSelected: (UserData) -> Unit,
    val onInvitePlayerByEmail: (String, String, String) -> Unit,
    val onDismissInvitePlayer: () -> Unit,
    val onReportNotesChanged: (String) -> Unit,
    val onSubmitReport: () -> Unit,
    val onRequestDismissReport: () -> Unit,
    val onDismissReport: () -> Unit,
    val onRefundReasonChanged: (String) -> Unit,
    val onConfirmRefundRequest: () -> Unit,
    val onDismissRefundRequest: () -> Unit,
    val onConfirmTextSignature: () -> Unit,
    val onDismissTextSignature: () -> Unit,
    val onDismissWebSignature: () -> Unit,
    val onApplyDiscountCode: (String) -> Unit,
    val onDiscountCodeChanged: () -> Unit,
    val onContinueDiscountCode: (String?) -> Unit,
    val onDismissDiscountCode: () -> Unit,
    val onSubmitBillingAddress: (BillingAddressDraft) -> Unit,
    val onDismissBillingAddress: () -> Unit,
)

internal fun eventDeleteConfirmationMessage(
    isTemplateEvent: Boolean,
    hasAnyPaidDivision: Boolean,
): String = when {
    isTemplateEvent -> "Are you sure you want to delete this template? This action cannot be undone."
    hasAnyPaidDivision ->
        "Are you sure you want to delete this event? All participants will receive a full refund. " +
            "This action cannot be undone."
    else -> "Are you sure you want to delete this event? This action cannot be undone."
}

internal fun webSignatureDescription(prompt: WebSignaturePromptState): String {
    val signerLabel = prompt.step?.requiredSignerLabel
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { label -> "Required signer: $label" }
    val progressLabel = if (prompt.totalSteps > 1) {
        "Document ${prompt.currentStep} of ${prompt.totalSteps}"
    } else {
        null
    }
    return listOfNotNull(progressLabel, signerLabel).joinToString(" - ")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EventDetailOverlayHost(
    state: EventDetailOverlayHostState,
    actions: EventDetailOverlayHostActions,
) {
    if (state.showWithdrawTargetDialog && state.withdrawTargets.isNotEmpty()) {
        WithdrawTargetDialog(
            targets = state.withdrawTargets,
            onDismiss = actions.onDismissWithdrawTargetDialog,
            onTargetSelected = actions.onWithdrawTargetSelected,
        )
    }

    if (state.showJoinOptionsSheet &&
        (state.joinSheetsState.isWeeklyParentEvent || state.joinSheetsState.options.isNotEmpty())
    ) {
        ModalBottomSheet(onDismissRequest = actions.joinSheetsActions.onDismiss) {
            JoinOptionsSheet(
                state = state.joinSheetsState,
                actions = actions.joinSheetsActions,
            )
        }
    }

    state.showTeamDialog?.let { dialogState ->
        TeamSelectionDialog(
            dialogState = dialogState,
            onTeamSelected = { teamId ->
                actions.onMatchTeamSelected(dialogState.matchId, dialogState.position, teamId)
            },
            onDismiss = actions.onDismissMatchTeamSelection,
        )
    }
    state.showMatchEditDialog?.let { dialogState ->
        MatchEditDialog(
            match = dialogState.match,
            teams = dialogState.teams,
            fields = dialogState.fields,
            allMatches = dialogState.allMatches,
            eventOfficials = dialogState.eventOfficials,
            officialPositions = dialogState.officialPositions,
            users = dialogState.players,
            eventType = dialogState.eventType,
            isCreateMode = dialogState.isCreateMode,
            creationContext = dialogState.creationContext,
            onDismissRequest = actions.onDismissMatchEdit,
            onConfirm = actions.onConfirmMatchEdit,
            onDelete = actions.onDeleteMatch,
        )
    }
    if (state.showTeamSelectionDialog) {
        TeamSelectionDialog(
            eventSportLabel = state.teamSelectionSportLabel,
            teams = state.validTeams,
            onTeamSelected = actions.onJoinTeamSelected,
            onDismiss = actions.onDismissJoinTeamSelection,
            onCreateTeam = actions.onCreateTeam,
        )
    }
    if (state.showEventTeamCheckInDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!state.eventTeamCheckInSaving) actions.onDismissEventTeamCheckIn()
            },
            title = { Text("Check in for event?") },
            text = { Text("Check in ${state.eventTeamName} for this event.") },
            confirmButton = {
                Button(
                    onClick = actions.onConfirmEventTeamCheckIn,
                    enabled = !state.eventTeamCheckInSaving,
                ) {
                    Text(if (state.eventTeamCheckInSaving) "Saving..." else "Check in")
                }
            },
            dismissButton = {
                Button(
                    onClick = actions.onDismissEventTeamCheckIn,
                    enabled = !state.eventTeamCheckInSaving,
                ) {
                    Text("Not now")
                }
            },
        )
    }
    state.joinChoiceDialog?.let {
        AlertDialog(
            onDismissRequest = actions.onDismissJoinChoice,
            title = { Text("Join Event") },
            text = { Text("You have linked children. Do you want to join yourself or register a child instead?") },
            confirmButton = {
                Button(onClick = actions.onConfirmJoinAsSelf) { Text("Join Myself") }
            },
            dismissButton = {
                Button(onClick = actions.onShowChildJoinSelection) { Text("Register Child") }
            },
        )
    }
    state.childJoinSelectionDialog?.let { dialogState ->
        ChildJoinSelectionDialog(
            dialogState = dialogState,
            onDismiss = actions.onDismissChildJoinSelection,
            onChildSelected = actions.onChildSelected,
        )
    }
    state.teamJoinQuestionDialog?.let { dialogState ->
        TeamJoinQuestionsDialog(
            dialogState = dialogState,
            onDismiss = actions.onDismissTeamJoinQuestions,
            onSubmit = actions.onSubmitTeamJoinQuestions,
        )
    }
    state.eventRegistrationQuestionDialog?.let { dialogState ->
        EventRegistrationQuestionsDialog(
            dialogState = dialogState,
            onDismiss = actions.onDismissRegistrationQuestions,
            onSubmit = actions.onSubmitRegistrationQuestions,
        )
    }
    state.paymentPlanPreviewDialog?.let { dialogState ->
        PaymentPlanPreviewDialog(
            dialogState = dialogState,
            onContinue = actions.onContinuePaymentPlan,
            onCancel = actions.onCancelPaymentPlan,
        )
    }
    if (state.showStandingsConfirmDialog) {
        AlertDialog(
            onDismissRequest = actions.onDismissStandingsConfirmation,
            title = { Text("Confirm Results") },
            text = { Text("Update playoff assignments based on these results?") },
            confirmButton = {
                TextButton(onClick = { actions.onConfirmStandings(true) }) { Text("Yes") }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { actions.onConfirmStandings(false) }) { Text("No") }
                    TextButton(onClick = actions.onDismissStandingsConfirmation) { Text("Cancel") }
                }
            },
        )
    }
    if (state.showBuildBracketConfirmDialog) {
        AlertDialog(
            onDismissRequest = actions.onDismissBuildBracketConfirmation,
            title = { Text("Rebuild Bracket(s)") },
            text = {
                Text(
                    "This rebuilds playoff/tournament bracket(s) from max participant count. " +
                        "It will reset the bracket and any playoff/tournament match results.",
                )
            },
            confirmButton = {
                TextButton(onClick = actions.onBuildBrackets) { Text("Rebuild") }
            },
            dismissButton = {
                TextButton(onClick = actions.onDismissBuildBracketConfirmation) { Text("Cancel") }
            },
        )
    }
    if (state.showRebuildWithoutPlaceholdersConfirmDialog) {
        AlertDialog(
            onDismissRequest = actions.onDismissRebuildWithoutPlaceholdersConfirmation,
            title = { Text("Rebuild Without Placeholders") },
            text = { Text("This removes empty placeholder teams and rebuilds matches from registered teams only.") },
            confirmButton = {
                TextButton(onClick = actions.onRebuildWithoutPlaceholders) { Text("Rebuild") }
            },
            dismissButton = {
                TextButton(onClick = actions.onDismissRebuildWithoutPlaceholdersConfirmation) { Text("Cancel") }
            },
        )
    }
    if (state.showQrCodeDialog && state.canShowQrCode) {
        EventQrCodeDialog(
            eventName = state.eventName,
            qrImageUrl = getEventQrCodeUrl(state.eventId),
            onDismiss = actions.onDismissQrCode,
            onShareQrCode = actions.onShareQrCode,
        )
    }
    if (state.showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = actions.onDismissDeleteConfirmation,
            title = { Text(if (state.isTemplateEvent) "Delete Template" else "Delete Event") },
            text = {
                Text(eventDeleteConfirmationMessage(state.isTemplateEvent, state.hasAnyPaidDivision))
            },
            confirmButton = {
                Button(
                    onClick = actions.onDeleteEvent,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                Button(onClick = actions.onDismissDeleteConfirmation) { Text("Cancel") }
            },
        )
    }
    if (state.showNotifyDialog) {
        SendNotificationDialog(
            onSend = actions.onSendNotification,
            onSent = actions.onDismissNotification,
            onDismiss = actions.onDismissNotification,
        )
    }
    if (state.showInviteTeamDialog) {
        EventTeamInviteDialog(
            teams = state.inviteTeamSuggestions,
            isLoading = state.inviteTeamsLoading,
            selectedDivisionId = state.selectedDivisionId,
            divisionOptions = state.registrationDivisionOptions,
            onSearch = actions.onSearchInviteTeams,
            onDivisionSelected = actions.onInviteTeamDivisionSelected,
            onTeamSelected = actions.onInviteTeamSelected,
            onDismiss = actions.onDismissInviteTeam,
        )
    }
    if (state.showInvitePlayerDialog) {
        EventPlayerInviteDialog(
            eventName = state.eventName,
            suggestions = state.suggestedUsers,
            existingParticipantIds = state.existingParticipantIds,
            onSearch = actions.onSearchUsers,
            onPlayerSelected = actions.onInvitePlayerSelected,
            onInviteByEmail = actions.onInvitePlayerByEmail,
            onDismiss = actions.onDismissInvitePlayer,
        )
    }
    if (state.showReportEventDialog) {
        AlertDialog(
            onDismissRequest = actions.onRequestDismissReport,
            title = { Text("Report event") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Report objectionable content or abusive behavior tied to this event.")
                    StandardTextField(
                        value = state.reportEventNotes,
                        onValueChange = actions.onReportNotesChanged,
                        modifier = Modifier.fillMaxWidth(),
                        label = "Notes (optional)",
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = actions.onSubmitReport) { Text("Report") }
            },
            dismissButton = {
                TextButton(onClick = actions.onDismissReport) { Text("Cancel") }
            },
        )
    }
    if (state.showRefundReasonDialog) {
        RefundReasonDialog(
            currentReason = state.refundReason,
            onReasonChange = actions.onRefundReasonChanged,
            onConfirm = actions.onConfirmRefundRequest,
            onDismiss = actions.onDismissRefundRequest,
        )
    }
    state.textSignaturePrompt?.let { prompt ->
        TextSignatureDialog(
            prompt = prompt,
            onConfirm = actions.onConfirmTextSignature,
            onDismiss = actions.onDismissTextSignature,
        )
    }
    state.webSignaturePrompt?.let { prompt ->
        EmbeddedWebModal(
            title = prompt.step?.title ?: "Sign required document",
            url = prompt.url,
            description = webSignatureDescription(prompt),
            onDismiss = actions.onDismissWebSignature,
        )
    }
    state.discountCodePrompt?.let { prompt ->
        DiscountCodeDialog(
            title = prompt.title,
            description = prompt.description,
            initialCode = prompt.initialCode,
            originalAmountCents = prompt.originalAmountCents,
            preview = prompt.preview,
            error = prompt.error,
            loading = prompt.loading,
            onApply = actions.onApplyDiscountCode,
            onCodeChange = { actions.onDiscountCodeChanged() },
            onContinue = actions.onContinueDiscountCode,
            onDismiss = actions.onDismissDiscountCode,
        )
    }
    state.billingAddressPrompt?.let { address ->
        BillingAddressDialog(
            initialAddress = address,
            onConfirm = actions.onSubmitBillingAddress,
            onDismiss = actions.onDismissBillingAddress,
        )
    }
}
