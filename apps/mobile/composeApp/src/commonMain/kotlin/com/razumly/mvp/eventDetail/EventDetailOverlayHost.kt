package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.SportResourceLabels
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphMatchDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphOfficialAssignmentDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphTeamDto
import com.razumly.mvp.core.presentation.composables.BillingAddressDialog
import com.razumly.mvp.core.presentation.composables.DiscountCodeDialog
import com.razumly.mvp.core.presentation.composables.EmbeddedWebModal
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.presentation.util.getEventQrCodeUrl
import com.razumly.mvp.eventDetail.composables.MatchEditDialog
import com.razumly.mvp.eventDetail.composables.SendNotificationDialog
import com.razumly.mvp.eventDetail.composables.TeamSelectionDialog
import com.razumly.mvp.schedule.ScheduleDiagnosticsReview
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime

internal data class EventDetailOverlayHostState(
    val showWithdrawTargetDialog: Boolean,
    val withdrawTargets: List<WithdrawTargetOption>,
    val showJoinOptionsSheet: Boolean,
    val joinSheetsState: EventDetailJoinSheetsState,
    val showTeamDialog: TeamSelectionDialogState?,
    val showMatchEditDialog: MatchEditDialogState?,
    val resourceLabels: SportResourceLabels,
    val resourceLabelsByFieldId: Map<String, SportResourceLabels>,
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
    val eventTypeTransitionConfirmation: EventTypeTransitionConfirmation?,
    val scheduleMaintenanceReview: EventScheduleMaintenanceReview?,
    val buildScheduleIsRebuild: Boolean,
    val showBuildScheduleConfirmDialog: Boolean,
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
    val onAcceptScheduleMaintenanceProposal: () -> Unit,
    val onRejectScheduleMaintenanceProposal: () -> Unit,
    val onDismissScheduleMaintenanceReview: () -> Unit,
    val onRetryAcceptedScheduleSync: () -> Unit,
    val onRequestFreshScheduleMaintenanceProposal: () -> Unit,
    val onDismissEventTypeTransitionConfirmation: () -> Unit,
    val onConfirmEventTypeTransition: () -> Unit,
    val onDismissBuildScheduleConfirmation: () -> Unit,
    val onBuildSchedule: () -> Unit,
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

internal fun maintenanceUnscheduledMatchLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMaintenanceUnscheduledMatchDto,
): String =
    "${match.id} (match ${match.matchId ?: "pending"}, " +
        "phaseDivisionId ${match.phaseDivisionId}, " +
        "phase ${match.phase}, " +
        "sourceDivisionId ${match.sourceDivisionId ?: "none"})"
internal fun maintenanceMatchIdentityLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
): String {
    val matchNumber = match.matchId?.let { " (match $it)" }.orEmpty()
    return "Match: ${match.id}$matchNumber"
}

internal fun maintenanceMatchPlacementLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
    protectedMatchIds: Set<String>,
): String {
    val isProtected = match.locked ||
        match.id in protectedMatchIds ||
        match.matchId?.toString()?.let { it in protectedMatchIds } == true
    val placementState = match.placementState
        .trim()
        .ifBlank { "UNKNOWN" }
        .uppercase()
    return if (isProtected) {
        "Placement: $placementState · fixed/protected"
    } else {
        "Placement: $placementState"
    }
}

internal fun maintenanceEventTimeZone(
    event: EventApiDto,
    fallbackTimeZone: String? = null,
): TimeZone {
    fun parse(value: String?): TimeZone? = value
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { candidate -> runCatching { TimeZone.of(candidate) }.getOrNull() }

    return parse(fallbackTimeZone)
        ?: parse(event.timeZone)
        ?: TimeZone.UTC
}

@OptIn(ExperimentalTime::class)
internal fun maintenanceMatchTimingLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
    timeZone: TimeZone = TimeZone.UTC,
    canonicalMatch: EventEditorMaintenanceGraphMatchDto? = null,
): String {
    fun format(value: String?): String? = value
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { normalized ->
            runCatching { Instant.parse(normalized) }.getOrNull()
        }
        ?.toLocalDateTime(timeZone)
        ?.format(dateTimeFormat)

    val start = format(canonicalMatch?.start?.trim()?.takeIf(String::isNotBlank) ?: match.start)
        ?: "not scheduled"
    val end = format(canonicalMatch?.end?.trim()?.takeIf(String::isNotBlank) ?: match.end)
        ?: "not scheduled"
    return "Start: $start · End: $end"
}

internal fun maintenanceMatchFieldLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
    fieldLabelsById: Map<String, String>,
    canonicalFieldName: String? = null,
): String {
    val fieldId = match.fieldId?.trim()?.takeIf(String::isNotBlank)
        ?: return "Field: unassigned"
    val fieldLabel = canonicalFieldName?.trim()?.takeIf(String::isNotBlank)
        ?: fieldLabelsById[fieldId]?.trim()?.takeIf(String::isNotBlank)
    return if (fieldLabel == null || fieldLabel == fieldId) {
        "Field: $fieldId"
    } else {
        "Field: $fieldLabel ($fieldId)"
    }
}

internal fun maintenanceMatchContextLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
): String {
    val context = listOfNotNull(
        match.phase?.trim()?.takeIf(String::isNotBlank)?.let { "phase $it" },
        match.division?.trim()?.takeIf(String::isNotBlank)?.let { "division $it" },
        match.phaseDivisionId?.trim()?.takeIf(String::isNotBlank)?.let { "phaseDivisionId $it" },
        match.sourceDivisionId?.trim()?.takeIf(String::isNotBlank)?.let { "sourceDivisionId $it" },
    )
    return "Phase/division: ${context.ifEmpty { listOf("not specified") }.joinToString(" · ")}"
}

internal fun maintenanceMatchFieldLabelsById(
    fields: List<com.razumly.mvp.core.data.dataTypes.Field>,
): Map<String, String> = fields.associate { field ->
    field.id to (
        field.name?.trim()?.takeIf(String::isNotBlank)
            ?: "Field ${field.fieldNumber}"
        )
}

private fun maintenanceCanonicalMatch(
    graph: EventEditorMaintenanceGraphDto,
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
    index: Int,
): EventEditorMaintenanceGraphMatchDto? {
    val positionalMatch = graph.canonicalMatches.getOrNull(index)
    if (
        positionalMatch != null &&
        (
            positionalMatch.id == match.id ||
                positionalMatch.matchId != null && positionalMatch.matchId == match.matchId
            )
    ) {
        return positionalMatch
    }
    return graph.canonicalMatches.firstOrNull { canonicalMatch ->
        canonicalMatch.id == match.id ||
            canonicalMatch.matchId != null && canonicalMatch.matchId == match.matchId
    }
}

private fun maintenanceUserDisplayName(
    firstName: String,
    lastName: String,
    userName: String,
): String? = listOf(firstName, lastName)
    .map(String::trim)
    .filter(String::isNotBlank)
    .joinToString(" ")
    .takeIf(String::isNotBlank)
    ?: userName.trim().takeIf(String::isNotBlank)

private fun maintenanceTeamNames(graph: EventEditorMaintenanceGraphDto): Map<String, String> =
    buildMap {
        graph.event.teams.forEach { team ->
            val id = team.id?.trim()?.takeIf(String::isNotBlank)
            val name = team.name.trim().takeIf(String::isNotBlank)
            if (id != null && name != null) put(id, name)
        }
        graph.canonicalEvent?.teams.orEmpty().forEach { team ->
            val id = team.id.trim().takeIf(String::isNotBlank)
            val name = team.name.trim().takeIf(String::isNotBlank)
            if (id != null && name != null) put(id, name)
        }
    }

private fun maintenanceTeamLabel(
    teamId: String?,
    seed: Int?,
    canonicalTeam: EventEditorMaintenanceGraphTeamDto?,
    teamNames: Map<String, String>,
): String {
    val resolvedTeamId = teamId?.trim()?.takeIf(String::isNotBlank)
    val teamName = canonicalTeam?.name?.trim()?.takeIf(String::isNotBlank)
        ?: resolvedTeamId?.let(teamNames::get)
        ?: if (resolvedTeamId == null) "TBD" else "Team unavailable"
    return seed?.let { "$teamName (seed $it)" } ?: teamName
}

internal fun maintenanceMatchTeamsLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
    canonicalMatch: EventEditorMaintenanceGraphMatchDto?,
    teamNames: Map<String, String>,
): String {
    val team1 = maintenanceTeamLabel(
        teamId = canonicalMatch?.team1?.id ?: canonicalMatch?.team1Id ?: match.team1Id,
        seed = canonicalMatch?.team1Seed ?: match.team1Seed,
        canonicalTeam = canonicalMatch?.team1,
        teamNames = teamNames,
    )
    val team2 = maintenanceTeamLabel(
        teamId = canonicalMatch?.team2?.id ?: canonicalMatch?.team2Id ?: match.team2Id,
        seed = canonicalMatch?.team2Seed ?: match.team2Seed,
        canonicalTeam = canonicalMatch?.team2,
        teamNames = teamNames,
    )
    return "Teams: $team1 vs $team2"
}

private fun maintenanceOfficialNames(graph: EventEditorMaintenanceGraphDto): Map<String, String> {
    val names = buildMap {
        graph.event.officials.forEach { user ->
            maintenanceUserDisplayName(user.firstName, user.lastName, user.userName)?.let { name ->
                user.id.trim().takeIf(String::isNotBlank)?.let { put(it, name) }
            }
        }
        graph.event.teams.forEach { team ->
            team.players.orEmpty().forEach { user ->
                maintenanceUserDisplayName(user.firstName, user.lastName, user.userName)?.let { name ->
                    user.id.trim().takeIf(String::isNotBlank)?.let { put(it, name) }
                }
            }
        }
        graph.canonicalEvent?.officials.orEmpty().forEach { user ->
            maintenanceUserDisplayName(user.firstName, user.lastName, user.userName)?.let { name ->
                put(user.id, name)
            }
        }
        graph.canonicalEvent?.teams.orEmpty().forEach { team ->
            team.players.forEach { user ->
                maintenanceUserDisplayName(user.firstName, user.lastName, user.userName)?.let { name ->
                    put(user.id, name)
                }
            }
        }
    }
    val eventOfficialNames = buildMap {
        graph.event.eventOfficials.orEmpty().forEach { official ->
            names[official.userId]?.let { put(official.id, it) }
        }
        graph.canonicalEvent?.eventOfficials.orEmpty().forEach { official ->
            names[official.userId]?.let { put(official.id, it) }
        }
    }
    return names + eventOfficialNames
}

private fun maintenanceOfficialPositionNames(graph: EventEditorMaintenanceGraphDto): Map<String, String> =
    buildMap {
        graph.event.officialPositions.orEmpty().forEach { position ->
            position.id.trim().takeIf(String::isNotBlank)?.let { id ->
                position.name.trim().takeIf(String::isNotBlank)?.let { put(id, it) }
            }
        }
        graph.event.divisionDetails.orEmpty()
            .plus(graph.event.playoffDivisionDetails.orEmpty())
            .flatMap { division -> division.phaseSettings.values }
            .flatMap { settings -> settings.officialPositions.orEmpty() }
            .forEach { position ->
                position.id.trim().takeIf(String::isNotBlank)?.let { id ->
                    position.name.trim().takeIf(String::isNotBlank)?.let { put(id, it) }
                }
            }
        graph.canonicalEvent?.officialPositions.orEmpty().forEach { position ->
            position.id.trim().takeIf(String::isNotBlank)?.let { id ->
                position.name.trim().takeIf(String::isNotBlank)?.let { put(id, it) }
            }
        }
        graph.canonicalEvent?.divisionDetails.orEmpty()
            .plus(graph.canonicalEvent?.playoffDivisionDetails.orEmpty())
            .flatMap { division -> division.phaseSettings.values }
            .flatMap { settings -> settings.officialPositions.orEmpty() }
            .forEach { position ->
                position.id.trim().takeIf(String::isNotBlank)?.let { id ->
                    position.name.trim().takeIf(String::isNotBlank)?.let { put(id, it) }
                }
            }
    }

private fun maintenanceMatchLabels(graph: EventEditorMaintenanceGraphDto): Map<String, String> =
    buildMap {
        graph.matches.forEachIndexed { index, match ->
            val label = "Match ${index + 1}"
            listOfNotNull(match.id, match.matchId?.toString()).forEach { put(it, label) }
        }
        graph.canonicalMatches.forEachIndexed { index, match ->
            val label = "Match ${index + 1}"
            listOfNotNull(match.id, match.matchId?.toString()).forEach { put(it, label) }
        }
    }

private fun maintenanceOfficialAssignmentLabel(
    assignment: EventEditorMaintenanceGraphOfficialAssignmentDto,
    canonicalMatch: EventEditorMaintenanceGraphMatchDto?,
    officialNames: Map<String, String>,
    officialPositionNames: Map<String, String>,
): String {
    val canonicalPlayerNames = buildMap {
        listOfNotNull(canonicalMatch?.team1, canonicalMatch?.team2).forEach { team ->
            team.players.forEach { user ->
                maintenanceUserDisplayName(user.firstName, user.lastName, user.userName)?.let { put(user.id, it) }
            }
        }
    }
    val holderId = assignment.userId?.trim()?.takeIf(String::isNotBlank)
        ?: assignment.eventOfficialId?.trim()?.takeIf(String::isNotBlank)
    val holderName = holderId?.let { id ->
        officialNames[id]
            ?: canonicalPlayerNames[id]
            ?: canonicalMatch?.official
                ?.takeIf { official -> official.id == id }
                ?.let { official ->
                    maintenanceUserDisplayName(official.firstName, official.lastName, official.userName)
                }
            ?: canonicalMatch?.teamOfficial
                ?.takeIf { team -> team.id == id }
                ?.name
                ?.trim()
                ?.takeIf(String::isNotBlank)
    } ?: when (assignment.holderType.trim().uppercase()) {
        "OFFICIAL" -> canonicalMatch?.official?.let {
            maintenanceUserDisplayName(it.firstName, it.lastName, it.userName)
        }
        "PLAYER" -> canonicalMatch?.teamOfficial?.name?.trim()?.takeIf(String::isNotBlank)
        else -> null
    }
        ?: "Unassigned"
    val positionName = officialPositionNames[assignment.positionId]
        ?: assignment.positionId.trim().takeIf(String::isNotBlank)
        ?: "Official"
    return "$positionName (slot ${assignment.slotIndex}): $holderName"
}

internal fun maintenanceMatchOfficialsLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
    canonicalMatch: EventEditorMaintenanceGraphMatchDto?,
    teamNames: Map<String, String>,
    officialNames: Map<String, String>,
    officialPositionNames: Map<String, String>,
): String? {
    val assignments = canonicalMatch?.officialAssignments.orEmpty()
        .ifEmpty { canonicalMatch?.officialIds.orEmpty() }
    val labels = buildList {
        assignments.forEach { assignment ->
            add(
                maintenanceOfficialAssignmentLabel(
                    assignment = assignment,
                    canonicalMatch = canonicalMatch,
                    officialNames = officialNames,
                    officialPositionNames = officialPositionNames,
                ),
            )
        }
        if (assignments.isEmpty()) {
            match.officialId?.trim()?.takeIf(String::isNotBlank)?.let { officialId ->
                add("Official: ${officialNames[officialId] ?: officialId}")
            }
            match.teamOfficialId?.trim()?.takeIf(String::isNotBlank)?.let { teamId ->
                add("Team official: ${teamNames[teamId] ?: teamId}")
            }
            canonicalMatch?.official?.let { official ->
                maintenanceUserDisplayName(official.firstName, official.lastName, official.userName)
                    ?.let { add("Official: $it") }
            }
            canonicalMatch?.teamOfficial?.name?.trim()?.takeIf(String::isNotBlank)?.let {
                add("Team official: $it")
            }
        }
    }
    return labels.joinToString(", ").takeIf(String::isNotBlank)
}

internal fun maintenanceMatchDependencyLabel(
    match: com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto,
    canonicalMatch: EventEditorMaintenanceGraphMatchDto?,
    matchLabels: Map<String, String>,
): String? {
    fun matchLabel(matchId: String): String = matchLabels[matchId] ?: matchId
    val dependencies = buildList {
        (canonicalMatch?.previousLeftId ?: match.previousLeftId)?.let {
            add("after ${matchLabel(it)}")
        }
        (canonicalMatch?.previousRightId ?: match.previousRightId)?.let {
            add("after ${matchLabel(it)}")
        }
        (canonicalMatch?.winnerNextMatchId ?: match.winnerNextMatchId)?.let {
            add("winner -> ${matchLabel(it)}")
        }
        (canonicalMatch?.loserNextMatchId ?: match.loserNextMatchId)?.let {
            add("loser -> ${matchLabel(it)}")
        }
    }
    return dependencies.joinToString(", ").takeIf(String::isNotBlank)
        ?.let { "Depends on: $it" }
}



@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EventScheduleMaintenanceReviewDialog(
    review: EventScheduleMaintenanceReview,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onDismiss: () -> Unit,
    onRequestFreshProposal: () -> Unit,
    onRetryAcceptedScheduleSync: () -> Unit = {},
) {
    val proposal = review.proposal
    val outcome = proposal.scheduleOutcome
    val isAcceptedSyncPending =
        review.phase == EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING
    val isBusy = review.phase == EventScheduleMaintenanceReviewPhase.ACCEPTING ||
        review.phase == EventScheduleMaintenanceReviewPhase.REJECTING
    val reviewMessage = review.message
        ?.trim()
        ?.takeIf(String::isNotBlank)
    val reviewBanner = reviewMessage ?: if (isAcceptedSyncPending) {
        "Schedule accepted. Retry sync to refresh the current schedule."
    } else {
        null
    }
    val operationLabel = when (proposal.operation) {
        com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation.BUILD -> "Build"
        com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation.COMPLETE -> "Complete"
        com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation.REBUILD -> "Rebuild"
    }
    val protectedMatchIds = proposal.protectedMatchIds.toSet()
    val eventTimeZone = maintenanceEventTimeZone(
        event = proposal.graph.event,
        fallbackTimeZone = review.eventTimeZone,
    )
    val fieldLabelsById = maintenanceMatchFieldLabelsById(proposal.graph.event.fields) +
        proposal.graph.canonicalEvent?.fields.orEmpty().associate { field ->
            field.id to field.name
        }
    val teamNames = maintenanceTeamNames(proposal.graph)
    val officialNames = maintenanceOfficialNames(proposal.graph)
    val officialPositionNames = maintenanceOfficialPositionNames(proposal.graph)
    val matchLabels = maintenanceMatchLabels(proposal.graph)

    AlertDialog(
        onDismissRequest = {
            if (!isBusy && !isAcceptedSyncPending) onDismiss()
        },
        title = {
            Text(
                if (isAcceptedSyncPending) {
                    "Schedule accepted — sync required"
                } else {
                    "$operationLabel schedule proposal"
                },
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                reviewBanner?.let { message ->
                    Text(
                        text = message,
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Polite
                        },
                        color = if (reviewMessage != null) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
                Column(
                    modifier = Modifier
                        .heightIn(max = 440.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        if (outcome.isComplete) {
                            "Complete: ${outcome.placedMatchCount} placed matches."
                        } else {
                            "Incomplete: ${outcome.placedMatchCount} placed, " +
                                "${outcome.unplacedMatchCount} unplaced matches."
                        },
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Graph summary")
                        Text("Proposed matches (${proposal.graph.matches.size}):")
                        proposal.graph.matches.take(8).forEachIndexed { index, match ->
                            val canonicalMatch = maintenanceCanonicalMatch(
                                graph = proposal.graph,
                                match = match,
                                index = index,
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(maintenanceMatchIdentityLabel(match))
                                Text(maintenanceMatchPlacementLabel(match, protectedMatchIds))
                                Text(
                                    maintenanceMatchTeamsLabel(
                                        match = match,
                                        canonicalMatch = canonicalMatch,
                                        teamNames = teamNames,
                                    ),
                                )
                                Text(
                                    maintenanceMatchTimingLabel(
                                        match = match,
                                        timeZone = eventTimeZone,
                                        canonicalMatch = canonicalMatch,
                                    ),
                                )
                                Text(
                                    maintenanceMatchFieldLabel(
                                        match = match,
                                        fieldLabelsById = fieldLabelsById,
                                        canonicalFieldName = canonicalMatch?.field?.name,
                                    ),
                                )
                                Text(maintenanceMatchContextLabel(match))
                                maintenanceMatchDependencyLabel(
                                    match = match,
                                    canonicalMatch = canonicalMatch,
                                    matchLabels = matchLabels,
                                )?.let { dependencyLabel ->
                                    Text(dependencyLabel)
                                }
                                maintenanceMatchOfficialsLabel(
                                    match = match,
                                    canonicalMatch = canonicalMatch,
                                    teamNames = teamNames,
                                    officialNames = officialNames,
                                    officialPositionNames = officialPositionNames,
                                )?.let { officialLabel ->
                                    Text("Officials: $officialLabel")
                                }
                            }
                        }
                        if (proposal.graph.matches.size > 8) {
                            Text("…and ${proposal.graph.matches.size - 8} more proposed matches.")
                        }
                        Text("Protected matches (${proposal.protectedMatchIds.size}):")
                        proposal.protectedMatchIds.take(8).forEach { matchId ->
                            Text(matchId)
                        }
                        if (proposal.protectedMatchIds.size > 8) {
                            Text("…and ${proposal.protectedMatchIds.size - 8} more protected matches.")
                        }
                    }
                    if (outcome.unscheduledMatches.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Unscheduled matches")
                            Text("${outcome.unscheduledMatches.size} matches remain unscheduled.")
                            outcome.unscheduledMatches.forEach { match ->
                                Text(maintenanceUnscheduledMatchLabel(match))
                            }
                        }
                    }
                    if (outcome.affectedCompetitionPhases.isNotEmpty()) {
                        Text(
                            "Affected phases: " +
                                outcome.affectedCompetitionPhases.joinToString { phase -> phase.name },
                        )
                    }
                    ScheduleDiagnosticsReview(outcome.diagnostics)
                    outcome.warnings.forEach { warning ->
                        Text("Warning: ${warning.message}")
                    }
                }
            }
        },
        confirmButton = {
            when {
                review.phase == EventScheduleMaintenanceReviewPhase.PROPOSED -> Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    TextButton(onClick = onAccept) {
                        Text("Accept")
                    }
                    TextButton(onClick = onReject) {
                        Text("Reject")
                    }
                }
                review.phase == EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING -> {
                    TextButton(onClick = onRetryAcceptedScheduleSync) {
                        Text("Retry sync")
                    }
                }
                isBusy -> Text(
                    if (review.phase == EventScheduleMaintenanceReviewPhase.ACCEPTING) {
                        "Accepting..."
                    } else {
                        "Rejecting..."
                    },
                )
                else -> TextButton(onClick = onRequestFreshProposal) {
                    Text("Request new proposal")
                }
            }
        },
        dismissButton = if (isBusy || isAcceptedSyncPending) {
            null
        } else {
            {
                TextButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        },
    )
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
        EventCheckoutDialog(
            onDismissRequest = actions.joinSheetsActions.onDismiss,
            title = { Text("How would you like to register?") },
            confirmButton = {},
            text = { JoinOptionsSheet(
                state = state.joinSheetsState,
                actions = actions.joinSheetsActions,
            ) },
        )
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
            resourceLabels = state.resourceLabels,
            resourceLabelsByFieldId = state.resourceLabelsByFieldId,
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
        EventCheckoutDialog(
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
    state.eventTypeTransitionConfirmation?.let { confirmation ->
        AlertDialog(
            onDismissRequest = actions.onDismissEventTypeTransitionConfirmation,
            title = { Text("Change event type and update schedule?") },
            text = { Text(confirmation.message) },
            confirmButton = {
                TextButton(onClick = actions.onConfirmEventTypeTransition) {
                    Text(confirmation.actionLabel)
                }
            },
            dismissButton = {
                TextButton(onClick = actions.onDismissEventTypeTransitionConfirmation) {
                    Text("Cancel")
                }
            },
        )
    }
    state.scheduleMaintenanceReview?.let { review ->
        EventScheduleMaintenanceReviewDialog(
            review = review,
            onAccept = actions.onAcceptScheduleMaintenanceProposal,
            onReject = actions.onRejectScheduleMaintenanceProposal,
            onDismiss = actions.onDismissScheduleMaintenanceReview,
            onRequestFreshProposal = actions.onRequestFreshScheduleMaintenanceProposal,
            onRetryAcceptedScheduleSync = actions.onRetryAcceptedScheduleSync,
        )
    }
    if (state.showBuildScheduleConfirmDialog) {
        val isRebuild = state.buildScheduleIsRebuild
        AlertDialog(
            onDismissRequest = actions.onDismissBuildScheduleConfirmation,
            title = { Text(if (isRebuild) "Rebuild Schedule" else "Build Schedule") },
            text = {
                Text(
                    if (isRebuild) {
                        "This proposes replacement placements only for mutable matches. Completed, in-progress, locked, " +
                            "and other protected placements stay fixed. Match times, ${state.resourceLabels.plural.lowercase()}, " +
                            "seeds, and official assignments can change."
                    } else {
                        "Build a schedule from the current event settings and registered teams?"
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = actions.onBuildSchedule) {
                    Text(if (isRebuild) "Rebuild Schedule" else "Build Schedule")
                }
            },
            dismissButton = {
                TextButton(onClick = actions.onDismissBuildScheduleConfirmation) { Text("Cancel") }
            },
        )
    }
    if (state.showRebuildWithoutPlaceholdersConfirmDialog) {
        AlertDialog(
            onDismissRequest = actions.onDismissRebuildWithoutPlaceholdersConfirmation,
            title = { Text("Rebuild Schedule Without Placeholders") },
            text = {
                Text(
                    "This removes empty placeholder teams and proposes replacement placements only for mutable matches. " +
                        "Completed, in-progress, locked, and other protected placements stay fixed. " +
                        "Mutable matches use registered teams only.",
                )
            },
            confirmButton = {
                TextButton(onClick = actions.onRebuildWithoutPlaceholders) { Text("Rebuild Schedule") }
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
