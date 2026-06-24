package com.razumly.mvp.eventDetail

import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.unit.Dp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.eventDetail.composables.LeagueScheduleFields
import com.razumly.mvp.eventDetail.composables.LeagueScoringConfigFields
import com.razumly.mvp.eventDetail.readonly.ScheduleTimeslotsReadOnlyList
import com.razumly.mvp.eventDetail.readonly.buildScheduleDetailsRows
import com.razumly.mvp.eventDetail.shared.DetailKeyValueList
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
import com.razumly.mvp.eventDetail.shared.animatedCardSection
import kotlinx.datetime.TimeZone

internal data class EventDetailsLeagueScoringState(
    val readOnlySection: ReadOnlySectionModel,
    val editSection: EditSectionModel,
    val sectionExpansionStates: SnapshotStateMap<String, Boolean>,
    val eventDetailsMode: EventDetailsMode,
    val lazyListState: LazyListState,
    val stickyHeaderTopInset: Dp,
    val enabled: Boolean,
    val editEvent: Event,
    val sports: List<Sport>,
    val leagueScoringConfig: LeagueScoringConfigDTO,
)

internal data class EventDetailsLeagueScoringActions(
    val onDisabledClick: () -> Unit,
    val onConfigChange: (LeagueScoringConfigDTO) -> Unit,
)

internal data class EventDetailsScheduleState(
    val readOnlySection: ReadOnlySectionModel,
    val editSection: EditSectionModel,
    val sectionExpansionStates: SnapshotStateMap<String, Boolean>,
    val eventDetailsMode: EventDetailsMode,
    val lazyListState: LazyListState,
    val stickyHeaderTopInset: Dp,
    val enabled: Boolean,
    val supportsScheduleConfig: Boolean,
    val event: Event,
    val editEvent: Event,
    val readOnlyFieldCount: Int,
    val timeSlots: List<TimeSlot>,
    val fieldsById: Map<String, Field>,
    val divisionDetails: List<DivisionDetail>,
    val fallbackDivisionIds: List<String>,
    val fieldCount: Int,
    val fields: List<Field>,
    val leagueTimeSlots: List<TimeSlot>,
    val availableRentalResources: List<RentalResourceOption>,
    val selectedRentalResourceIds: Set<String>,
    val eventTimeZone: TimeZone,
    val slotErrors: Map<Int, String>,
    val slotEditorEnabled: Boolean,
    val showUseManualTimeSlotsToggle: Boolean,
    val useManualTimeSlots: Boolean,
    val slotDivisionOptions: List<DropdownOption>,
    val showSlotDivisions: Boolean,
    val allowDivisionEditsWhenReadOnly: Boolean,
    val allowLocalResourceCreationWithRentalResources: Boolean,
    val isFieldCountValid: Boolean,
    val isLeagueSlotsValid: Boolean,
    val scheduleTimeLocked: Boolean,
)

internal data class EventDetailsScheduleActions(
    val onDisabledClick: () -> Unit,
    val onRentalResourceSelectionChange: (String, Boolean) -> Unit,
    val onFieldCountChange: (Int) -> Unit,
    val onFieldNameChange: (Int, String) -> Unit,
    val onAddSlot: () -> Unit,
    val onUpdateSlot: (Int, TimeSlot) -> Unit,
    val onRemoveSlot: (Int) -> Unit,
    val onUseManualTimeSlotsChange: (Boolean) -> Unit,
)

internal fun LazyListScope.eventDetailsLeagueScoringSection(
    state: EventDetailsLeagueScoringState,
    actions: EventDetailsLeagueScoringActions,
) {
    if (state.editEvent.eventType != EventType.LEAGUE) {
        return
    }

    animatedCardSection(
        sectionId = state.readOnlySection.sectionId,
        sectionExpansionStates = state.sectionExpansionStates,
        sectionTitle = if (state.eventDetailsMode == EventDetailsMode.EDIT) {
            state.editSection.title
        } else {
            state.readOnlySection.title
        },
        collapsibleInEditMode = true,
        collapsibleInViewMode = true,
        viewSummary = state.readOnlySection.summary,
        enabled = state.enabled,
        onDisabledClick = actions.onDisabledClick,
        isEditMode = state.eventDetailsMode == EventDetailsMode.EDIT,
        lazyListState = state.lazyListState,
        stickyHeaderTopInset = state.stickyHeaderTopInset,
        animationDelay = 440,
        viewContent = {
            DetailKeyValueList(
                rows = listOf(
                    DetailRowSpec(
                        "Scoring profile",
                        state.sports.firstOrNull { it.id == state.editEvent.sportId }?.name ?: "Default",
                    ),
                ),
            )
        },
        editContent = {
            LeagueScoringConfigFields(
                config = state.leagueScoringConfig,
                sport = state.sports.firstOrNull { it.id == state.editEvent.sportId },
                onConfigChange = actions.onConfigChange,
            )
        },
    )
}

internal fun LazyListScope.eventDetailsScheduleSection(
    state: EventDetailsScheduleState,
    actions: EventDetailsScheduleActions,
) {
    if (!state.supportsScheduleConfig) {
        return
    }

    animatedCardSection(
        sectionId = state.readOnlySection.sectionId,
        sectionExpansionStates = state.sectionExpansionStates,
        sectionTitle = if (state.eventDetailsMode == EventDetailsMode.EDIT) {
            state.editSection.title
        } else {
            state.readOnlySection.title
        },
        collapsibleInEditMode = true,
        collapsibleInViewMode = true,
        viewSummary = state.readOnlySection.summary,
        enabled = state.enabled,
        onDisabledClick = actions.onDisabledClick,
        requiredMissingCount = state.editSection.requiredMissingCount,
        isEditMode = state.eventDetailsMode == EventDetailsMode.EDIT,
        lazyListState = state.lazyListState,
        stickyHeaderTopInset = state.stickyHeaderTopInset,
        animationDelay = 450,
        viewContent = {
            DetailKeyValueList(
                rows = buildScheduleDetailsRows(
                    event = state.event,
                    fieldCount = state.readOnlyFieldCount,
                    slotCount = state.timeSlots.size,
                ),
            )
            ScheduleTimeslotsReadOnlyList(
                slots = state.timeSlots,
                fieldsById = state.fieldsById,
                divisionDetails = state.divisionDetails,
                fallbackDivisionIds = state.fallbackDivisionIds,
            )
        },
        editContent = {
            LeagueScheduleFields(
                fieldCount = state.fieldCount,
                fields = state.fields,
                slots = state.leagueTimeSlots,
                availableRentalResources = state.availableRentalResources,
                selectedRentalResourceIds = state.selectedRentalResourceIds,
                onRentalResourceSelectionChange = actions.onRentalResourceSelectionChange,
                eventStart = state.editEvent.start,
                eventEnd = if (state.editEvent.noFixedEndDateTime) {
                    null
                } else {
                    state.editEvent.end.takeIf { it > state.editEvent.start }
                },
                eventTimeZone = state.eventTimeZone,
                onFieldCountChange = actions.onFieldCountChange,
                onFieldNameChange = actions.onFieldNameChange,
                onAddSlot = actions.onAddSlot,
                onUpdateSlot = actions.onUpdateSlot,
                onRemoveSlot = actions.onRemoveSlot,
                slotErrors = state.slotErrors,
                showSlotEditor = state.slotEditorEnabled,
                showUseManualTimeSlotsToggle = state.showUseManualTimeSlotsToggle,
                useManualTimeSlots = state.useManualTimeSlots,
                onUseManualTimeSlotsChange = actions.onUseManualTimeSlotsChange,
                slotDivisionOptions = state.slotDivisionOptions,
                showSlotDivisions = state.showSlotDivisions,
                lockSlotDivisions = false,
                lockedDivisionIds = state.editEvent.divisions.normalizeDivisionIdentifiers(),
                allowDivisionEditsWhenReadOnly = state.allowDivisionEditsWhenReadOnly,
                allowLocalResourceCreationWithRentalResources = state.allowLocalResourceCreationWithRentalResources,
                fieldCountError = if (!state.isFieldCountValid) {
                    "Resource count must be at least 1."
                } else {
                    null
                },
                readOnly = state.scheduleTimeLocked,
            )
            if (
                !state.isLeagueSlotsValid &&
                (
                    state.editEvent.eventType == EventType.LEAGUE ||
                        state.editEvent.eventType == EventType.TOURNAMENT ||
                        state.editEvent.eventType == EventType.WEEKLY_EVENT
                    )
            ) {
                Text(
                    text = "Fix timeslot issues before continuing.",
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
    )
}
