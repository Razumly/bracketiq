package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.label
import com.razumly.mvp.core.data.dataTypes.usesTeamOfficialScheduling
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.shared.CollapsibleEditorSubsectionHeader
import com.razumly.mvp.eventDetail.shared.DetailKeyValueList
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
import com.razumly.mvp.eventDetail.shared.FormSectionDivider
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow
import com.razumly.mvp.eventDetail.shared.animatedCardSection
import com.razumly.mvp.eventDetail.shared.localImageScheme
import com.razumly.mvp.eventDetail.staff.EditableStaffCardList
import com.razumly.mvp.eventDetail.staff.StaffAssignmentCard
import com.razumly.mvp.eventDetail.staff.StaffAssignmentCardModel
import com.razumly.mvp.eventDetail.staff.userDisplayName

private fun TeamCheckInMode.label(): String = when (this) {
    TeamCheckInMode.OFF -> "Off"
    TeamCheckInMode.EVENT -> "Event check-in"
    TeamCheckInMode.MATCH -> "Match check-in"
}

internal data class EventDetailsStaffState(
    val readOnlySection: ReadOnlySectionModel,
    val sectionExpansionStates: SnapshotStateMap<String, Boolean>,
    val eventDetailsMode: EventDetailsMode,
    val lazyListState: LazyListState,
    val stickyHeaderTopInset: Dp,
    val enabled: Boolean,
    val showOfficialsPanel: Boolean,
    val event: Event,
    val editEvent: Event,
    val resolvedHostDisplay: String,
    val assistantHostIds: List<String>,
    val officialPositionSummary: String,
    val officialSchedulingModeOptions: List<DropdownOption>,
    val teamCheckInModeOptions: List<DropdownOption>,
    val officialPositionsExpanded: Boolean,
    val canLoadOfficialPositionDefaults: Boolean,
    val staffSearchQuery: String,
    val visibleUserSuggestions: List<UserData>,
    val staffInviteFirstName: String,
    val staffInviteLastName: String,
    val staffInviteEmail: String,
    val draftInviteOfficial: Boolean,
    val draftInviteAssistantHost: Boolean,
    val staffEditorError: String?,
    val assignedStaffExpanded: Boolean,
    val officialStaffCards: List<StaffAssignmentCardModel>,
    val hostStaffCards: List<StaffAssignmentCardModel>,
    val editableOfficialStaffListHeight: Dp,
    val editableHostStaffListHeight: Dp,
    val eventOfficialRecordsByUserId: Map<String, EventOfficial>,
    val officialPositionOptions: List<DropdownOption>,
)

internal data class EventDetailsStaffActions(
    val onDisabledClick: () -> Unit,
    val onUpdateDoTeamsOfficiate: (Boolean) -> Unit,
    val onUpdateTeamOfficialsMaySwap: (Boolean) -> Unit,
    val onUpdateTeamCheckInMode: (TeamCheckInMode) -> Unit,
    val onUpdateTeamCheckInOpenMinutesBefore: (Int) -> Unit,
    val onUpdateAllowMatchRosterEdits: (Boolean) -> Unit,
    val onUpdateAllowTemporaryMatchPlayers: (Boolean) -> Unit,
    val onUpdateOfficialSchedulingMode: (OfficialSchedulingMode) -> Unit,
    val onToggleOfficialPositionsExpanded: () -> Unit,
    val onLoadOfficialPositionDefaults: () -> Unit,
    val onAddOfficialPosition: () -> Unit,
    val onUpdateOfficialPositionName: (String, String) -> Unit,
    val onUpdateOfficialPositionCount: (String, Int) -> Unit,
    val onRemoveOfficialPosition: (String) -> Unit,
    val onStaffSearchQueryChange: (String) -> Unit,
    val onAddOfficialId: (String) -> Unit,
    val onAddAssistantHostId: (String) -> Unit,
    val onStaffInviteFirstNameChange: (String) -> Unit,
    val onStaffInviteLastNameChange: (String) -> Unit,
    val onStaffInviteEmailChange: (String) -> Unit,
    val onDraftInviteOfficialChange: (Boolean) -> Unit,
    val onDraftInviteAssistantHostChange: (Boolean) -> Unit,
    val onAddEmailInvite: () -> Unit,
    val onToggleAssignedStaffExpanded: () -> Unit,
    val onRemoveOfficialId: (String) -> Unit,
    val onRemoveAssistantHostId: (String) -> Unit,
    val onRemovePendingStaffInvite: (String, EventStaffRole?) -> Unit,
    val onUpdateOfficialUserPositions: (String, List<String>) -> Unit,
)

internal fun LazyListScope.eventDetailsStaffSection(
    state: EventDetailsStaffState,
    actions: EventDetailsStaffActions,
) {
    if (!state.showOfficialsPanel) {
        return
    }

    animatedCardSection(
        sectionId = state.readOnlySection.sectionId,
        sectionExpansionStates = state.sectionExpansionStates,
        sectionTitle = state.readOnlySection.title,
        collapsibleInEditMode = true,
        collapsibleInViewMode = true,
        viewSummary = state.readOnlySection.summary,
        enabled = state.enabled,
        onDisabledClick = actions.onDisabledClick,
        isEditMode = state.eventDetailsMode == EventDetailsMode.EDIT,
        lazyListState = state.lazyListState,
        stickyHeaderTopInset = state.stickyHeaderTopInset,
        animationDelay = 300,
        viewContent = {
            DetailKeyValueList(
                rows = buildList {
                    add(
                        DetailRowSpec(
                            "Teams provide officials",
                            if (state.event.usesTeamOfficialScheduling()) "Yes" else "No",
                        ),
                    )
                    if (state.event.usesTeamOfficialScheduling()) {
                        add(
                            DetailRowSpec(
                                "Team officials may swap",
                                if (state.event.teamOfficialsMaySwap == true) "Yes" else "No",
                            ),
                        )
                    }
                    if (state.event.teamSignup) {
                        add(DetailRowSpec("Team check-in", state.event.teamCheckInMode.label()))
                        if (state.event.teamCheckInMode != TeamCheckInMode.OFF) {
                            add(
                                DetailRowSpec(
                                    "Check-in opens",
                                    "${state.event.teamCheckInOpenMinutesBefore.coerceAtLeast(0)} minutes before start",
                                ),
                            )
                        }
                        add(
                            DetailRowSpec(
                                "Match roster edits",
                                if (state.event.allowMatchRosterEdits) "Enabled" else "Disabled",
                            ),
                        )
                    }
                    add(DetailRowSpec("Primary host", state.resolvedHostDisplay))
                    add(DetailRowSpec("Assistant hosts", state.assistantHostIds.size.toString()))
                    add(DetailRowSpec("Officials", state.event.officialIds.size.toString()))
                    add(
                        DetailRowSpec(
                            "Staffing mode",
                            state.event.officialSchedulingMode.label(),
                        ),
                    )
                    add(DetailRowSpec("Official positions", state.officialPositionSummary))
                },
            )
        },
        editContent = {
            LabeledCheckboxRow(
                checked = state.editEvent.usesTeamOfficialScheduling(),
                label = "Teams provide officials",
                onCheckedChange = actions.onUpdateDoTeamsOfficiate,
            )
            if (state.editEvent.usesTeamOfficialScheduling()) {
                LabeledCheckboxRow(
                    checked = state.editEvent.teamOfficialsMaySwap == true,
                    label = "Team officials may swap",
                    onCheckedChange = actions.onUpdateTeamOfficialsMaySwap,
                )
            }
            if (state.editEvent.teamSignup) {
                FormSectionDivider()
                Text(
                    text = "Team check-in and match rosters",
                    style = MaterialTheme.typography.titleSmall,
                    color = Color(localImageScheme.current.onSurface),
                )
                PlatformDropdown(
                    selectedValue = state.editEvent.teamCheckInMode.name,
                    onSelectionChange = { selectedMode ->
                        TeamCheckInMode.entries
                            .firstOrNull { mode -> mode.name == selectedMode }
                            ?.let(actions.onUpdateTeamCheckInMode)
                    },
                    options = state.teamCheckInModeOptions,
                    label = "Check-in mode",
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.editEvent.teamCheckInMode != TeamCheckInMode.OFF) {
                    NumberInputField(
                        value = state.editEvent.teamCheckInOpenMinutesBefore.coerceAtLeast(0).toString(),
                        label = "Opens before start (minutes)",
                        isError = false,
                        onValueChange = { newValue ->
                            if (newValue.all(Char::isDigit)) {
                                actions.onUpdateTeamCheckInOpenMinutesBefore(
                                    newValue.toIntOrNull()?.coerceAtLeast(0) ?: 0,
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                LabeledCheckboxRow(
                    checked = state.editEvent.allowMatchRosterEdits,
                    label = "Allow match roster edits",
                    onCheckedChange = actions.onUpdateAllowMatchRosterEdits,
                )
                if (state.editEvent.allowMatchRosterEdits) {
                    LabeledCheckboxRow(
                        checked = state.editEvent.allowTemporaryMatchPlayers,
                        label = "Allow temporary match players",
                        onCheckedChange = actions.onUpdateAllowTemporaryMatchPlayers,
                    )
                }
            }
            Text(
                text = "Official scheduling",
                style = MaterialTheme.typography.titleSmall,
                color = Color(localImageScheme.current.onSurface),
            )
            PlatformDropdown(
                selectedValue = state.editEvent.officialSchedulingMode.name,
                onSelectionChange = { selectedMode ->
                    OfficialSchedulingMode.entries
                        .firstOrNull { mode -> mode.name == selectedMode }
                        ?.let(actions.onUpdateOfficialSchedulingMode)
                },
                options = state.officialSchedulingModeOptions,
                label = "Scheduling mode",
                modifier = Modifier.fillMaxWidth(),
            )
            FormSectionDivider()
            CollapsibleEditorSubsectionHeader(
                title = "Event official positions",
                expanded = state.officialPositionsExpanded,
                onToggle = actions.onToggleOfficialPositionsExpanded,
            )
            AnimatedVisibility(visible = state.officialPositionsExpanded) {
                EventOfficialPositionsEditor(state, actions)
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            Text(
                text = "Add / Invite Staff",
                style = MaterialTheme.typography.titleSmall,
                color = Color(localImageScheme.current.onSurface),
            )
            StandardTextField(
                value = state.staffSearchQuery,
                onValueChange = actions.onStaffSearchQueryChange,
                label = "Search existing users",
                placeholder = "Name or username",
                modifier = Modifier.fillMaxWidth(),
            )
            if (state.staffSearchQuery.isNotBlank() && state.visibleUserSuggestions.isEmpty()) {
                Text(
                    text = "No matching users.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(localImageScheme.current.onSurfaceVariant),
                )
            }
            state.visibleUserSuggestions.take(6).forEach { suggestedUser ->
                StaffSuggestionCard(
                    suggestedUser = suggestedUser,
                    state = state,
                    actions = actions,
                )
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            StaffEmailInviteEditor(state, actions)
            state.staffEditorError?.let { errorText ->
                Text(
                    text = errorText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            CollapsibleEditorSubsectionHeader(
                title = "Assigned staff",
                expanded = state.assignedStaffExpanded,
                onToggle = actions.onToggleAssignedStaffExpanded,
            )
            AnimatedVisibility(visible = state.assignedStaffExpanded) {
                AssignedStaffLists(state, actions)
            }
        },
    )
}

@Composable
private fun EventOfficialPositionsEditor(
    state: EventDetailsStaffState,
    actions: EventDetailsStaffActions,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "Sport defaults are copied into this event.",
            style = MaterialTheme.typography.bodySmall,
            color = Color(localImageScheme.current.onSurfaceVariant),
        )
        TextButton(
            onClick = actions.onLoadOfficialPositionDefaults,
            enabled = state.canLoadOfficialPositionDefaults,
            modifier = Modifier.align(Alignment.End),
        ) {
            Text("Load defaults")
        }
        if (state.editEvent.officialPositions.isEmpty()) {
            Text(
                text = "No official positions configured yet.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(localImageScheme.current.onSurfaceVariant),
            )
        } else {
            state.editEvent.officialPositions
                .sortedBy(EventOfficialPosition::order)
                .forEach { position ->
                    OfficialPositionEditorCard(
                        position = position,
                        actions = actions,
                    )
                }
        }
        TextButton(
            onClick = actions.onAddOfficialPosition,
            modifier = Modifier.align(Alignment.End),
        ) {
            Text("Add position")
        }
    }
}

@Composable
private fun OfficialPositionEditorCard(
    position: EventOfficialPosition,
    actions: EventDetailsStaffActions,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StandardTextField(
                value = position.name,
                onValueChange = { newName ->
                    actions.onUpdateOfficialPositionName(position.id, newName)
                },
                label = "Position name",
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = position.count.toString(),
                    label = "Slots",
                    isError = false,
                    onValueChange = { newValue ->
                        val nextCount = newValue.toIntOrNull()
                        if (newValue.isBlank()) {
                            actions.onUpdateOfficialPositionCount(position.id, 1)
                        } else if (nextCount != null) {
                            actions.onUpdateOfficialPositionCount(position.id, nextCount.coerceAtLeast(1))
                        }
                    },
                )
                Button(
                    onClick = { actions.onRemoveOfficialPosition(position.id) },
                ) {
                    Text("Remove")
                }
            }
        }
    }
}

@Composable
private fun StaffSuggestionCard(
    suggestedUser: UserData,
    state: EventDetailsStaffState,
    actions: EventDetailsStaffActions,
) {
    val canAddOfficial = !state.editEvent.officialIds.contains(suggestedUser.id)
    val canAddAssistant = suggestedUser.id != state.editEvent.hostId &&
        !state.assistantHostIds.contains(suggestedUser.id)
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        ),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = userDisplayName(suggestedUser),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = { actions.onAddOfficialId(suggestedUser.id) },
                    enabled = canAddOfficial,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Add as official")
                }
                Button(
                    onClick = { actions.onAddAssistantHostId(suggestedUser.id) },
                    enabled = canAddAssistant,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Add as assistant")
                }
            }
        }
    }
}

@Composable
private fun StaffEmailInviteEditor(
    state: EventDetailsStaffState,
    actions: EventDetailsStaffActions,
) {
    Text(
        text = "Email invite",
        style = MaterialTheme.typography.titleSmall,
        color = Color(localImageScheme.current.onSurface),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StandardTextField(
            value = state.staffInviteFirstName,
            onValueChange = actions.onStaffInviteFirstNameChange,
            label = "First Name",
            modifier = Modifier.weight(1f),
        )
        StandardTextField(
            value = state.staffInviteLastName,
            onValueChange = actions.onStaffInviteLastNameChange,
            label = "Last Name",
            modifier = Modifier.weight(1f),
        )
    }
    StandardTextField(
        value = state.staffInviteEmail,
        onValueChange = actions.onStaffInviteEmailChange,
        label = "Email",
        modifier = Modifier.fillMaxWidth(),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(modifier = Modifier.weight(1f)) {
            LabeledCheckboxRow(
                checked = state.draftInviteOfficial,
                label = "Official",
                onCheckedChange = actions.onDraftInviteOfficialChange,
            )
        }
        Box(modifier = Modifier.weight(1f)) {
            LabeledCheckboxRow(
                checked = state.draftInviteAssistantHost,
                label = "Assistant Host",
                onCheckedChange = actions.onDraftInviteAssistantHostChange,
            )
        }
    }
    Button(
        onClick = actions.onAddEmailInvite,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Add email invite")
    }
}

@Composable
private fun AssignedStaffLists(
    state: EventDetailsStaffState,
    actions: EventDetailsStaffActions,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Officials",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            EditableStaffCardList(
                cards = state.officialStaffCards,
                emptyText = "No officials selected yet.",
                lazyListHeight = state.editableOfficialStaffListHeight,
            ) { card ->
                val assignedUserId = card.userId
                val selectedPositionIds = assignedUserId
                    ?.let(state.eventOfficialRecordsByUserId::get)
                    ?.positionIds
                    .orEmpty()
                StaffAssignmentCard(
                    card = card,
                    onRemoveAssigned = { userId, role ->
                        if (role == EventStaffRole.OFFICIAL) {
                            actions.onRemoveOfficialId(userId)
                        }
                    },
                    onRemoveDraft = actions.onRemovePendingStaffInvite,
                    extraContent = if (assignedUserId != null && state.officialPositionOptions.isNotEmpty()) {
                        {
                            PlatformDropdown(
                                selectedValue = "",
                                onSelectionChange = {},
                                options = state.officialPositionOptions,
                                label = "Eligible positions",
                                modifier = Modifier.fillMaxWidth(),
                                multiSelect = true,
                                selectedValues = selectedPositionIds,
                                onMultiSelectionChange = { selectedIds ->
                                    actions.onUpdateOfficialUserPositions(
                                        assignedUserId,
                                        selectedIds,
                                    )
                                },
                            )
                        }
                    } else {
                        null
                    },
                )
            }
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Hosts",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            EditableStaffCardList(
                cards = state.hostStaffCards,
                emptyText = "No host staff assigned yet.",
                lazyListHeight = state.editableHostStaffListHeight,
            ) { card ->
                StaffAssignmentCard(
                    card = card,
                    onRemoveAssigned = { userId, role ->
                        if (role == EventStaffRole.ASSISTANT_HOST) {
                            actions.onRemoveAssistantHostId(userId)
                        }
                    },
                    onRemoveDraft = actions.onRemovePendingStaffInvite,
                )
            }
        }
    }
}
