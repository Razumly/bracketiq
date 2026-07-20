package com.razumly.mvp.eventDetail

import androidx.compose.ui.unit.Dp
import com.razumly.mvp.core.data.repositories.EventParticipantsSummary
import com.razumly.mvp.core.presentation.IPaymentProcessor
import kotlin.time.Instant

internal data class EventDetailOverviewState(
    val eventWithRelations: EventWithFullRelations,
    val teamsAndParticipantsLoading: Boolean,
    val matchesLoading: Boolean,
    val showFullnessSummary: Boolean,
    val selectedWeeklyOccurrenceLabel: String?,
    val selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary?,
    val overviewParticipantSummary: EventParticipantsSummary?,
    val showOpenDetailsAction: Boolean,
)

internal data class EventDetailOverviewActions(
    val onOpenDetails: () -> Unit,
)

internal data class EventDetailJoinSheetsState(
    val options: List<JoinOption>,
    val paymentProcessor: IPaymentProcessor,
    val registrationHoldExpiresAt: String?,
    val isWeeklyParentEvent: Boolean,
    val weeklySessionOptions: List<WeeklySessionOption>,
    val weeklyOccurrenceSummaries: Map<String, WeeklyOccurrenceSummary>,
    val selectedWeeklyOccurrenceLabel: String?,
    val selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary?,
    val selectedWeeklyOccurrenceJoined: Boolean,
    val selectedWeeklyOccurrenceStarted: Boolean,
    val selectedDivisionId: String?,
    val divisionOptions: List<BracketDivisionOption>,
)

internal data class EventDetailJoinSheetsActions(
    val onDivisionSelected: (String) -> Unit,
    val onDismiss: () -> Unit,
    val onSelectOption: (JoinOption) -> Unit,
    val onSelectWeeklySession: (WeeklySessionOption) -> Unit,
    val onRegistrationHoldExpired: () -> Unit,
)

internal data class EventDetailStandingsState(
    val standings: List<TeamStanding>,
    val standingsDivisionKey: String,
    val showDrawColumn: Boolean,
    val topContentPadding: Dp,
    val standingsConfirmedAt: Instant?,
    val validationMessages: List<String>,
    val isLoading: Boolean,
    val isConfirming: Boolean,
    val canConfirmStandings: Boolean,
    val isEditingPoints: Boolean = false,
    val draftPoints: Map<String, Double> = emptyMap(),
    val isSavingPoints: Boolean = false,
)

internal data class EventDetailStandingsActions(
    val showFab: (Boolean) -> Unit,
    val adjustPoints: (teamId: String, delta: Double) -> Unit = { _, _ -> },
)
