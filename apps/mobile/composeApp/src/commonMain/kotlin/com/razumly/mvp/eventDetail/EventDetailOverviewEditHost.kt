package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateDp
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Announcement
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.materialkolor.scheme.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.presentation.IPaymentProcessor
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.presentation.guides.EventGuideTargets
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.presentation.util.buttonTransitionSpec
import com.razumly.mvp.eventMap.MapComponent
import io.github.ismoy.imagepickerkmp.domain.models.GalleryPhotoResult

internal data class EventDetailOverviewEditHostState(
    val paymentProcessor: IPaymentProcessor,
    val mapComponent: MapComponent,
    val hostHasAccount: Boolean,
    val eventWithRelations: EventWithFullRelations,
    val editEvent: Event,
    val navPadding: PaddingValues,
    val topInset: Dp,
    val editView: Boolean,
    val showOfficialsPanel: Boolean,
    val showMap: Boolean,
    val imageScheme: DynamicScheme,
    val imageIds: List<String>,
    val eventRegistrationQuestions: List<TeamJoinQuestion>,
    val eventRegistrationQuestionAnswers: Map<String, String>,
    val eventRegistrationQuestionsExpanded: Boolean,
    val availableRentalResources: List<RentalResourceOption>,
    val selectedRentalResourceIds: Set<String>,
    val registrationHoldExpiresAt: String?,
    val sports: List<Sport>,
    val eventTagOptions: List<EventTag>,
    val divisionTypeParameters: DivisionTypeParameters,
    val editableFields: List<Field>,
    val leagueTimeSlots: List<TimeSlot>,
    val leagueScoringConfig: LeagueScoringConfigDTO,
    val currentUserForHostActions: UserData,
    val organizationTemplates: List<OrganizationTemplateDocument>,
    val organizationTemplatesLoading: Boolean,
    val organizationTemplatesError: String?,
    val pendingStaffInvites: List<PendingStaffInviteDraft>,
    val userSuggestions: List<UserData>,
    val canEditEventDetails: Boolean,
    val canCreateTemplateFromCurrentEvent: Boolean,
    val canShowQrCode: Boolean,
    val canRequestLeaveOrRefund: Boolean,
    val leaveOrRefundActionLabel: String,
    val canDeleteEvent: Boolean,
    val showHostJoinAction: Boolean,
    val isAffiliateEvent: Boolean,
    val isHost: Boolean,
    val showOptionsDropdown: Boolean,
    val showEventStateDropdown: Boolean,
    val teamsAndParticipantsLoading: Boolean,
    val matchesLoading: Boolean,
    val showFullnessSummary: Boolean,
    val selectedWeeklyOccurrenceLabel: String?,
    val selectedWeeklyOccurrenceSummary: WeeklyOccurrenceSummary?,
    val overviewParticipantSummary: com.razumly.mvp.core.data.repositories.EventParticipantsSummary?,
    val showOpenDetailsAction: Boolean,
)

internal data class EventDetailOverviewEditHostActions(
    val onOpenLocationMap: () -> Unit,
    val onRentalResourceSelectionChange: (String, Boolean) -> Unit,
    val onToggleEventRegistrationQuestions: () -> Unit,
    val onEventRegistrationQuestionAnswerChange: (String, String) -> Unit,
    val onRegistrationHoldExpired: () -> Unit,
    val onHostCreateAccount: () -> Unit,
    val onPlaceSelected: (MVPPlace?) -> Unit,
    val onEditEvent: (Event.() -> Event) -> Unit,
    val onEditTournament: (Event.() -> Event) -> Unit,
    val onEventTypeSelected: (EventType) -> Unit,
    val quoteInclusivePrice: suspend (InclusivePriceQuoteDirection, Int, String?) -> Result<InclusivePriceQuote>,
    val onSportSelected: (String) -> Unit,
    val onUpdateDoTeamsOfficiate: (Boolean) -> Unit,
    val onUpdateTeamOfficialsMaySwap: (Boolean) -> Unit,
    val onUpdateTeamCheckInMode: (TeamCheckInMode) -> Unit,
    val onUpdateTeamCheckInOpenMinutesBefore: (Int) -> Unit,
    val onUpdateAllowMatchRosterEdits: (Boolean) -> Unit,
    val onUpdateAllowTemporaryMatchPlayers: (Boolean) -> Unit,
    val onUpdateOfficialSchedulingMode: (OfficialSchedulingMode) -> Unit,
    val onLoadOfficialPositionDefaults: () -> Unit,
    val onAddOfficialPosition: () -> Unit,
    val onUpdateOfficialPositionName: (String, String) -> Unit,
    val onUpdateOfficialPositionCount: (String, Int) -> Unit,
    val onRemoveOfficialPosition: (String) -> Unit,
    val onUpdateOfficialUserPositions: (String, List<String>) -> Unit,
    val onAddLeagueTimeSlot: () -> Unit,
    val onUpdateLeagueTimeSlot: (Int, TimeSlot) -> Unit,
    val onRemoveLeagueTimeSlot: (Int) -> Unit,
    val onSelectFieldCount: (Int) -> Unit,
    val onUpdateLocalFieldName: (Int, String) -> Unit,
    val onLeagueScoringConfigChange: (LeagueScoringConfigDTO) -> Unit,
    val onUploadSelected: (GalleryPhotoResult, () -> Unit) -> Unit,
    val onDeleteImage: (String, () -> Unit) -> Unit,
    val onHostMessageUser: (UserData) -> Unit,
    val onHostSendFriendRequest: (UserData) -> Unit,
    val onHostFollowUser: (UserData) -> Unit,
    val onHostUnfollowUser: (UserData) -> Unit,
    val onHostBlockUser: (UserData, Boolean) -> Unit,
    val onHostUnblockUser: (UserData) -> Unit,
    val onMapRevealCenterChange: (Offset) -> Unit,
    val onFloatingDockVisibilityChange: (Boolean) -> Unit,
    val onSearchUsers: (String) -> Unit,
    val onAddPendingStaffInvite: suspend (String, String, String, Set<EventStaffRole>) -> Result<Unit>,
    val onRemovePendingStaffInvite: (String, EventStaffRole?) -> Unit,
    val onUpdateAssistantHostIds: (List<String>) -> Unit,
    val onAddOfficialId: (String) -> Unit,
    val onRemoveOfficialId: (String) -> Unit,
    val onBack: () -> Unit,
    val onOptionsDropdownChanged: (Boolean) -> Unit,
    val onStartEditing: () -> Unit,
    val onCreateTemplate: () -> Unit,
    val onHostJoinAction: () -> Unit,
    val onShare: () -> Unit,
    val onShowQrCode: () -> Unit,
    val onReportEvent: () -> Unit,
    val onLeaveOrRefund: () -> Unit,
    val onNotifyPlayers: () -> Unit,
    val onDelete: () -> Unit,
    val onConfirmEdit: () -> Unit,
    val onCancelEdit: () -> Unit,
    val onEventStateDropdownChanged: (Boolean) -> Unit,
    val onLifecycleStateSelected: (EditableLifecycleState) -> Unit,
    val onRescheduleEvent: () -> Unit,
    val onBuildBrackets: () -> Unit,
    val onRebuildWithoutPlaceholders: () -> Unit,
    val onOpenDetails: () -> Unit,
)

internal data class EventEditActionAvailability(
    val canReschedule: Boolean,
    val canBuildBrackets: Boolean,
    val eventActionEnabled: Boolean,
    val canCreateTemplate: Boolean,
)

internal data class EventDetailOverviewStickyActionState(
    val visible: Boolean,
    val isAffiliateEvent: Boolean,
    val isRegistrationPaymentPending: Boolean,
    val isRegistrationPaymentFailed: Boolean,
    val joinBlockedByStart: Boolean,
    val isWeeklyParentEvent: Boolean,
    val shouldShowViewSchedulePrimaryAction: Boolean,
    val isUserInEvent: Boolean,
    val directionsEnabled: Boolean,
    val selectedWeeklyOccurrenceLabel: String?,
)

internal data class EventDetailOverviewStickyActionActions(
    val onAffiliateJoin: () -> Unit,
    val onOpenJoinOptions: () -> Unit,
    val onViewEvent: () -> Unit,
    val onMapClick: () -> Unit,
    val onDirectionsClick: () -> Unit,
    val onMapButtonPositioned: (Offset) -> Unit,
    val onShareClick: () -> Unit,
    val onClearSelectedWeeklyOccurrence: () -> Unit,
)

internal enum class EventDetailStickyPrimaryIntent {
    AFFILIATE_JOIN,
    OPEN_JOIN_OPTIONS,
    VIEW_EVENT,
    NONE,
}

internal data class EventDetailStickyPrimaryAction(
    val label: String,
    val enabled: Boolean,
    val intent: EventDetailStickyPrimaryIntent,
)

internal fun resolveEventDetailStickyPrimaryAction(
    isAffiliateEvent: Boolean,
    isRegistrationPaymentPending: Boolean,
    isRegistrationPaymentFailed: Boolean,
    joinBlockedByStart: Boolean,
    isWeeklyParentEvent: Boolean,
    shouldShowViewSchedulePrimaryAction: Boolean,
    isUserInEvent: Boolean,
): EventDetailStickyPrimaryAction {
    val label = when {
        isAffiliateEvent -> "Register on website"
        isRegistrationPaymentPending -> "Payment pending"
        isRegistrationPaymentFailed && !joinBlockedByStart -> "Complete payment"
        isWeeklyParentEvent && !joinBlockedByStart -> "Join Event"
        shouldShowViewSchedulePrimaryAction -> "View Schedule and Participants"
        !isUserInEvent && !joinBlockedByStart -> "Join options"
        joinBlockedByStart && isWeeklyParentEvent -> "Occurrence Started"
        joinBlockedByStart -> "Event Started"
        else -> "Joined with Team"
    }
    val enabled = if (isAffiliateEvent) {
        true
    } else if (isWeeklyParentEvent) {
        !isRegistrationPaymentPending && !joinBlockedByStart
    } else {
        !isRegistrationPaymentPending &&
            (
                (isRegistrationPaymentFailed && !joinBlockedByStart) ||
                    shouldShowViewSchedulePrimaryAction ||
                    (!isUserInEvent && !joinBlockedByStart)
                )
    }
    val intent = when {
        isAffiliateEvent -> EventDetailStickyPrimaryIntent.AFFILIATE_JOIN
        isRegistrationPaymentPending -> EventDetailStickyPrimaryIntent.NONE
        isRegistrationPaymentFailed && !joinBlockedByStart ->
            EventDetailStickyPrimaryIntent.OPEN_JOIN_OPTIONS
        isWeeklyParentEvent && !joinBlockedByStart ->
            EventDetailStickyPrimaryIntent.OPEN_JOIN_OPTIONS
        shouldShowViewSchedulePrimaryAction -> EventDetailStickyPrimaryIntent.VIEW_EVENT
        !isUserInEvent && !joinBlockedByStart -> EventDetailStickyPrimaryIntent.OPEN_JOIN_OPTIONS
        else -> EventDetailStickyPrimaryIntent.NONE
    }
    return EventDetailStickyPrimaryAction(label = label, enabled = enabled, intent = intent)
}

internal fun eventEditActionAvailability(
    event: Event,
    isHost: Boolean,
): EventEditActionAvailability {
    val isTemplate = event.state.equals("TEMPLATE", ignoreCase = true)
    val canReschedule = event.eventType == EventType.LEAGUE || event.eventType == EventType.TOURNAMENT
    return EventEditActionAvailability(
        canReschedule = canReschedule,
        canBuildBrackets = event.eventType == EventType.TOURNAMENT ||
            (event.eventType == EventType.LEAGUE && event.includePlayoffs),
        eventActionEnabled = !isTemplate,
        canCreateTemplate = isHost && !isTemplate && event.organizationId.isNullOrBlank(),
    )
}

@Composable
internal fun EventDetailOverviewEditHost(
    state: EventDetailOverviewEditHostState,
    actions: EventDetailOverviewEditHostActions,
    modifier: Modifier = Modifier,
) {
    EventDetails(
        paymentProcessor = state.paymentProcessor,
        mapComponent = state.mapComponent,
        hostHasAccount = state.hostHasAccount,
        eventWithRelations = state.eventWithRelations,
        editEvent = state.editEvent,
        navPadding = state.navPadding,
        topInset = state.topInset,
        editView = state.editView,
        showOfficialsPanel = state.showOfficialsPanel,
        isNewEvent = false,
        onOpenLocationMap = actions.onOpenLocationMap,
        onAddCurrentUser = {},
        imageScheme = state.imageScheme,
        imageIds = state.imageIds,
        eventRegistrationQuestions = state.eventRegistrationQuestions,
        eventRegistrationQuestionAnswers = state.eventRegistrationQuestionAnswers,
        eventRegistrationQuestionsExpanded = state.eventRegistrationQuestionsExpanded,
        availableRentalResources = state.availableRentalResources,
        selectedRentalResourceIds = state.selectedRentalResourceIds,
        onRentalResourceSelectionChange = actions.onRentalResourceSelectionChange,
        registrationHoldExpiresAt = state.registrationHoldExpiresAt,
        onToggleEventRegistrationQuestions = actions.onToggleEventRegistrationQuestions,
        onEventRegistrationQuestionAnswerChange = actions.onEventRegistrationQuestionAnswerChange,
        onRegistrationHoldExpired = actions.onRegistrationHoldExpired,
        onHostCreateAccount = actions.onHostCreateAccount,
        onPlaceSelected = actions.onPlaceSelected,
        onEditEvent = actions.onEditEvent,
        onEditTournament = actions.onEditTournament,
        onEventTypeSelected = actions.onEventTypeSelected,
        quoteInclusivePrice = actions.quoteInclusivePrice,
        onSportSelected = actions.onSportSelected,
        sports = state.sports,
        eventTagOptions = state.eventTagOptions,
        divisionTypeParameters = state.divisionTypeParameters,
        onUpdateDoTeamsOfficiate = actions.onUpdateDoTeamsOfficiate,
        onUpdateTeamOfficialsMaySwap = actions.onUpdateTeamOfficialsMaySwap,
        onUpdateTeamCheckInMode = actions.onUpdateTeamCheckInMode,
        onUpdateTeamCheckInOpenMinutesBefore = actions.onUpdateTeamCheckInOpenMinutesBefore,
        onUpdateAllowMatchRosterEdits = actions.onUpdateAllowMatchRosterEdits,
        onUpdateAllowTemporaryMatchPlayers = actions.onUpdateAllowTemporaryMatchPlayers,
        onUpdateOfficialSchedulingMode = actions.onUpdateOfficialSchedulingMode,
        onLoadOfficialPositionDefaults = actions.onLoadOfficialPositionDefaults,
        onAddOfficialPosition = actions.onAddOfficialPosition,
        onUpdateOfficialPositionName = actions.onUpdateOfficialPositionName,
        onUpdateOfficialPositionCount = actions.onUpdateOfficialPositionCount,
        onRemoveOfficialPosition = actions.onRemoveOfficialPosition,
        onUpdateOfficialUserPositions = actions.onUpdateOfficialUserPositions,
        editableFields = state.editableFields,
        leagueTimeSlots = state.leagueTimeSlots,
        leagueScoringConfig = state.leagueScoringConfig,
        onAddLeagueTimeSlot = actions.onAddLeagueTimeSlot,
        onUpdateLeagueTimeSlot = actions.onUpdateLeagueTimeSlot,
        onRemoveLeagueTimeSlot = actions.onRemoveLeagueTimeSlot,
        onSelectFieldCount = actions.onSelectFieldCount,
        onUpdateLocalFieldName = actions.onUpdateLocalFieldName,
        onLeagueScoringConfigChange = actions.onLeagueScoringConfigChange,
        onUploadSelected = actions.onUploadSelected,
        onDeleteImage = actions.onDeleteImage,
        currentUserForHostActions = state.currentUserForHostActions,
        onHostMessageUser = actions.onHostMessageUser,
        onHostSendFriendRequest = actions.onHostSendFriendRequest,
        onHostFollowUser = actions.onHostFollowUser,
        onHostUnfollowUser = actions.onHostUnfollowUser,
        onHostBlockUser = actions.onHostBlockUser,
        onHostUnblockUser = actions.onHostUnblockUser,
        onMapRevealCenterChange = actions.onMapRevealCenterChange,
        onFloatingDockVisibilityChange = actions.onFloatingDockVisibilityChange,
        organizationTemplates = state.organizationTemplates,
        organizationTemplatesLoading = state.organizationTemplatesLoading,
        organizationTemplatesError = state.organizationTemplatesError,
        pendingStaffInvites = state.pendingStaffInvites,
        userSuggestions = state.userSuggestions,
        onSearchUsers = actions.onSearchUsers,
        onAddPendingStaffInvite = actions.onAddPendingStaffInvite,
        onRemovePendingStaffInvite = actions.onRemovePendingStaffInvite,
        onUpdateAssistantHostIds = actions.onUpdateAssistantHostIds,
        onAddOfficialId = actions.onAddOfficialId,
        onRemoveOfficialId = actions.onRemoveOfficialId,
        heroTopControls = {
            EventDetailOverviewHeaderControls(state = state, actions = actions)
        },
        modifier = modifier.guideTarget(EventGuideTargets.OverviewHeader),
    ) { isValid ->
        EventDetailOverviewEditFooter(
            state = state,
            actions = actions,
            isValid = isValid,
        )
    }
}

@Composable
private fun BoxScope.EventDetailOverviewHeaderControls(
    state: EventDetailOverviewEditHostState,
    actions: EventDetailOverviewEditHostActions,
) {
    if (state.showMap) return

    Box(
        Modifier
            .padding(top = 64.dp, start = 16.dp)
            .align(Alignment.TopStart),
    ) {
        IconButton(
            onClick = actions.onBack,
            modifier = Modifier.background(
                Color(state.imageScheme.surface).copy(alpha = 0.7f),
                shape = CircleShape,
            ),
        ) {
            Icon(
                Icons.Default.Close,
                contentDescription = "Close",
                tint = Color(state.imageScheme.onSurface),
            )
        }
    }
    Box(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(top = 64.dp, end = 16.dp),
    ) {
        IconButton(
            onClick = { actions.onOptionsDropdownChanged(true) },
            modifier = Modifier.background(
                Color(state.imageScheme.surface).copy(alpha = 0.7f),
                shape = CircleShape,
            ),
        ) {
            Icon(
                Icons.Default.MoreVert,
                contentDescription = "More options",
                tint = Color(state.imageScheme.onSurface),
            )
        }

        DropdownMenu(
            expanded = state.showOptionsDropdown,
            onDismissRequest = { actions.onOptionsDropdownChanged(false) },
        ) {
            if (state.canEditEventDetails) {
                DropdownMenuItem(
                    text = { Text("Edit") },
                    onClick = {
                        actions.onStartEditing()
                        actions.onOptionsDropdownChanged(false)
                    },
                    leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) },
                )
            }
            if (state.canCreateTemplateFromCurrentEvent) {
                DropdownMenuItem(
                    text = { Text("Create Template") },
                    onClick = {
                        actions.onCreateTemplate()
                        actions.onOptionsDropdownChanged(false)
                    },
                    leadingIcon = { Icon(Icons.Default.Check, contentDescription = null) },
                )
            }
            if (state.showHostJoinAction) {
                DropdownMenuItem(
                    text = { Text(if (state.isAffiliateEvent) "Register on website" else "Join Event") },
                    onClick = {
                        actions.onHostJoinAction()
                        actions.onOptionsDropdownChanged(false)
                    },
                    leadingIcon = { Icon(Icons.Default.Add, contentDescription = null) },
                )
            }
            DropdownMenuItem(
                text = { Text("Share") },
                onClick = {
                    actions.onShare()
                    actions.onOptionsDropdownChanged(false)
                },
                leadingIcon = { Icon(Icons.Default.Share, contentDescription = null) },
            )
            if (state.canShowQrCode) {
                DropdownMenuItem(
                    text = { Text("QR Code") },
                    onClick = {
                        actions.onShowQrCode()
                        actions.onOptionsDropdownChanged(false)
                    },
                    leadingIcon = { Icon(Icons.Default.QrCode, contentDescription = null) },
                )
            }
            if (!state.isHost) {
                DropdownMenuItem(
                    text = { Text("Report Event") },
                    onClick = {
                        actions.onReportEvent()
                        actions.onOptionsDropdownChanged(false)
                    },
                    leadingIcon = { Icon(Icons.Default.Close, contentDescription = null) },
                )
            }
            if (state.canRequestLeaveOrRefund) {
                DropdownMenuItem(
                    text = { Text(state.leaveOrRefundActionLabel) },
                    onClick = {
                        actions.onOptionsDropdownChanged(false)
                        actions.onLeaveOrRefund()
                    },
                    leadingIcon = { Icon(Icons.Default.Close, contentDescription = null) },
                )
            }
            if (state.isHost) {
                DropdownMenuItem(
                    text = { Text("Notify Players") },
                    onClick = {
                        actions.onNotifyPlayers()
                        actions.onOptionsDropdownChanged(false)
                    },
                    leadingIcon = {
                        Icon(Icons.AutoMirrored.Filled.Announcement, contentDescription = null)
                    },
                )
            }
            if (state.canDeleteEvent) {
                DropdownMenuItem(
                    text = { Text("Delete") },
                    onClick = {
                        actions.onDelete()
                        actions.onOptionsDropdownChanged(false)
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                    },
                    colors = MenuDefaults.itemColors(textColor = MaterialTheme.colorScheme.error),
                )
            }
        }
    }
}

@Composable
private fun EventDetailOverviewEditFooter(
    state: EventDetailOverviewEditHostState,
    actions: EventDetailOverviewEditHostActions,
    isValid: Boolean,
) {
    val buttonColors = ButtonColors(
        containerColor = Color(state.imageScheme.primary),
        contentColor = Color(state.imageScheme.onPrimary),
        disabledContainerColor = Color(state.imageScheme.onSurface),
        disabledContentColor = Color(state.imageScheme.onSurfaceVariant),
    )
    AnimatedContent(
        targetState = state.editView,
        transitionSpec = { buttonTransitionSpec() },
        label = "buttonTransition",
    ) { editMode ->
        if (editMode) {
            EventDetailEditActions(
                state = state,
                actions = actions,
                isValid = isValid,
                buttonColors = buttonColors,
            )
        } else {
            EventOverviewSections(
                state = EventDetailOverviewState(
                    eventWithRelations = state.eventWithRelations,
                    teamsAndParticipantsLoading = state.teamsAndParticipantsLoading,
                    matchesLoading = state.matchesLoading,
                    showFullnessSummary = state.showFullnessSummary,
                    selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrenceLabel,
                    selectedWeeklyOccurrenceSummary = state.selectedWeeklyOccurrenceSummary,
                    overviewParticipantSummary = state.overviewParticipantSummary,
                    showOpenDetailsAction = state.showOpenDetailsAction,
                ),
                actions = EventDetailOverviewActions(onOpenDetails = actions.onOpenDetails),
                formatModifier = Modifier.guideTarget(EventGuideTargets.OverviewFormat),
            )
        }
    }
}

@Composable
private fun EventDetailEditActions(
    state: EventDetailOverviewEditHostState,
    actions: EventDetailOverviewEditHostActions,
    isValid: Boolean,
    buttonColors: ButtonColors,
) {
    val availability = eventEditActionAvailability(state.editEvent, state.isHost)
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = actions.onConfirmEdit, enabled = isValid, colors = buttonColors) {
                Text("Confirm")
            }
            Button(onClick = actions.onCancelEdit, colors = buttonColors) {
                Text("Cancel")
            }
        }
        if (state.isHost && availability.eventActionEnabled) {
            val selectedLifecycleState = remember(state.editEvent.state) {
                state.editEvent.toEditableLifecycleState()
            }
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Button(
                    onClick = { actions.onEventStateDropdownChanged(true) },
                    colors = buttonColors,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(selectedLifecycleState.label)
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = null)
                    }
                }
                DropdownMenu(
                    expanded = state.showEventStateDropdown,
                    onDismissRequest = { actions.onEventStateDropdownChanged(false) },
                ) {
                    EditableLifecycleState.values().forEach { option ->
                        DropdownMenuItem(
                            text = { Text(option.label) },
                            onClick = { actions.onLifecycleStateSelected(option) },
                            leadingIcon = if (option == selectedLifecycleState) {
                                { Icon(Icons.Default.Check, contentDescription = null) }
                            } else {
                                null
                            },
                        )
                    }
                }
            }
        }
        if (availability.canReschedule) {
            Button(
                onClick = actions.onRescheduleEvent,
                enabled = availability.eventActionEnabled,
                colors = buttonColors,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Reschedule Event")
            }
            if (availability.canBuildBrackets) {
                Button(
                    onClick = actions.onBuildBrackets,
                    enabled = availability.eventActionEnabled,
                    colors = buttonColors,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Rebuild Bracket(s)")
                }
            }
            Button(
                onClick = actions.onRebuildWithoutPlaceholders,
                enabled = availability.eventActionEnabled,
                colors = buttonColors,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Rebuild Without Placeholders")
            }
        }
        if (availability.canCreateTemplate) {
            Button(onClick = actions.onCreateTemplate, colors = buttonColors) {
                Text("Create Template")
            }
        }
    }
}

@Composable
internal fun BoxScope.EventDetailOverviewStickyActionHost(
    state: EventDetailOverviewStickyActionState,
    actions: EventDetailOverviewStickyActionActions,
) {
    var actionBarHeightPx by remember { mutableStateOf(0) }
    val transition = updateTransition(
        targetState = state.visible,
        label = "StickyActionBarVisibility",
    )
    val motionDurationMillis = 180
    val enterShadowDurationMillis = 120
    val exitShadowDurationMillis = 1
    val exitMotionDelayMillis = 40
    val barAlpha by transition.animateFloat(
        transitionSpec = {
            if (!initialState && targetState) {
                tween(durationMillis = motionDurationMillis)
            } else {
                tween(
                    durationMillis = motionDurationMillis,
                    delayMillis = exitMotionDelayMillis,
                )
            }
        },
        label = "StickyActionBarAlpha",
    ) { visible ->
        if (visible) 1f else 0f
    }
    val offsetFraction by transition.animateFloat(
        transitionSpec = {
            if (!initialState && targetState) {
                tween(durationMillis = motionDurationMillis)
            } else {
                tween(
                    durationMillis = motionDurationMillis,
                    delayMillis = exitMotionDelayMillis,
                )
            }
        },
        label = "StickyActionBarOffsetFraction",
    ) { visible ->
        if (visible) 0f else 0.5f
    }
    val shadowElevation by transition.animateDp(
        transitionSpec = {
            if (!initialState && targetState) {
                tween(
                    durationMillis = enterShadowDurationMillis,
                    delayMillis = motionDurationMillis,
                )
            } else {
                tween(durationMillis = exitShadowDurationMillis)
            }
        },
        label = "StickyActionBarShadowElevation",
    ) { visible ->
        if (visible) 6.dp else 0.dp
    }
    val shouldRender = state.visible ||
        barAlpha > 0.01f ||
        shadowElevation > 0.dp ||
        transition.currentState != transition.targetState
    if (!shouldRender) return

    val primaryAction = resolveEventDetailStickyPrimaryAction(
        isAffiliateEvent = state.isAffiliateEvent,
        isRegistrationPaymentPending = state.isRegistrationPaymentPending,
        isRegistrationPaymentFailed = state.isRegistrationPaymentFailed,
        joinBlockedByStart = state.joinBlockedByStart,
        isWeeklyParentEvent = state.isWeeklyParentEvent,
        shouldShowViewSchedulePrimaryAction = state.shouldShowViewSchedulePrimaryAction,
        isUserInEvent = state.isUserInEvent,
    )
    StickyActionBar(
        primaryLabel = primaryAction.label,
        primaryEnabled = primaryAction.enabled,
        onPrimaryClick = {
            when (primaryAction.intent) {
                EventDetailStickyPrimaryIntent.AFFILIATE_JOIN -> actions.onAffiliateJoin()
                EventDetailStickyPrimaryIntent.OPEN_JOIN_OPTIONS -> actions.onOpenJoinOptions()
                EventDetailStickyPrimaryIntent.VIEW_EVENT -> actions.onViewEvent()
                EventDetailStickyPrimaryIntent.NONE -> Unit
            }
        },
        onMapClick = actions.onMapClick,
        onDirectionsClick = actions.onDirectionsClick,
        directionsEnabled = state.directionsEnabled,
        onMapButtonPositioned = actions.onMapButtonPositioned,
        onShareClick = actions.onShareClick,
        selectedWeeklyOccurrenceLabel = state.selectedWeeklyOccurrenceLabel,
        onClearSelectedWeeklyOccurrence = if (state.isWeeklyParentEvent) {
            actions.onClearSelectedWeeklyOccurrence
        } else {
            null
        },
        barAlpha = barAlpha,
        shadowElevation = shadowElevation,
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .padding(LocalNavBarPadding.current)
            .padding(start = 16.dp, end = 16.dp, bottom = 12.dp)
            .offset {
                IntOffset(
                    x = 0,
                    y = (actionBarHeightPx * offsetFraction).toInt(),
                )
            }
            .onSizeChanged { size -> actionBarHeightPx = size.height }
            .guideTarget(EventGuideTargets.OverviewPrimaryAction),
    )
}
