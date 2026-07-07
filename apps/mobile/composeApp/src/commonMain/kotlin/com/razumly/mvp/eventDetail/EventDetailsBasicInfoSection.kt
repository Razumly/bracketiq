package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.defaultEventTagOptions
import com.razumly.mvp.core.data.dataTypes.eventTagIdentity
import com.razumly.mvp.core.data.dataTypes.lockedEventTypeTagSlugs
import com.razumly.mvp.core.data.dataTypes.normalizedEventTag
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.syncEventTypeTagsForEventType
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.eventDetail.composables.TextInputField
import com.razumly.mvp.eventDetail.readonly.HostedByReadOnlyRow
import com.razumly.mvp.eventDetail.shared.DetailKeyValueList
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
import com.razumly.mvp.eventDetail.shared.FormSectionDivider
import com.razumly.mvp.eventDetail.shared.animatedCardSection
import com.razumly.mvp.eventDetail.shared.localImageScheme
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime

internal data class EventDetailsBasicInfoState(
    val readOnlySection: ReadOnlySectionModel,
    val editSection: EditSectionModel,
    val sectionExpansionStates: SnapshotStateMap<String, Boolean>,
    val eventDetailsMode: EventDetailsMode,
    val lazyListState: LazyListState,
    val stickyHeaderTopInset: Dp,
    val host: UserData?,
    val organization: Organization?,
    val isOrganizationEvent: Boolean,
    val fallbackHostDisplayName: String,
    val currentUserForHostActions: UserData?,
    val readOnlyBasicsRows: List<DetailRowSpec>,
    val event: Event,
    val editEvent: Event,
    val editEventTimeZone: TimeZone,
    val sports: List<Sport>,
    val isSportValid: Boolean,
    val scheduleTimeLocked: Boolean,
    val rentalTimeLocked: Boolean,
)

internal data class EventDetailsBasicInfoActions(
    val readOnlyActions: EventDetailsReadOnlyActions,
    val onEditEvent: (Event.() -> Event) -> Unit,
    val onSportSelected: (String) -> Unit,
    val onShowStartPicker: () -> Unit,
    val onShowEndPicker: () -> Unit,
)

internal fun LazyListScope.eventDetailsBasicInfoSection(
    state: EventDetailsBasicInfoState,
    actions: EventDetailsBasicInfoActions,
) {
    animatedCardSection(
        sectionId = state.readOnlySection.sectionId,
        sectionExpansionStates = state.sectionExpansionStates,
        sectionTitle = state.readOnlySection.title,
        collapsibleInEditMode = true,
        collapsibleInViewMode = true,
        viewSummary = state.readOnlySection.summary,
        requiredMissingCount = state.editSection.requiredMissingCount,
        isEditMode = state.eventDetailsMode == EventDetailsMode.EDIT,
        lazyListState = state.lazyListState,
        stickyHeaderTopInset = state.stickyHeaderTopInset,
        animationDelay = 100,
        viewContent = {
            HostedByReadOnlyRow(
                host = state.host,
                organization = state.organization,
                isOrganizationEvent = state.isOrganizationEvent,
                fallbackHostDisplayName = state.fallbackHostDisplayName,
                currentUser = state.currentUserForHostActions,
                onMessageUser = actions.readOnlyActions.onMessageUser,
                onSendFriendRequest = actions.readOnlyActions.onSendFriendRequest,
                onFollowUser = actions.readOnlyActions.onFollowUser,
                onUnfollowUser = actions.readOnlyActions.onUnfollowUser,
                onBlockUser = actions.readOnlyActions.onBlockUser,
                onUnblockUser = actions.readOnlyActions.onUnblockUser,
                onFollowOrganization = actions.readOnlyActions.onFollowOrganization,
            )
            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant,
                thickness = 1.dp,
            )
            DetailKeyValueList(rows = state.readOnlyBasicsRows)
            if (state.event.description.isNotBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "About",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
                Text(
                    text = state.event.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        },
        editContent = {
            TextInputField(
                value = state.editEvent.description,
                label = "Description",
                onValueChange = { description ->
                    actions.onEditEvent { copy(description = description) }
                },
                isError = false,
                errorMessage = "",
                supportingText = "Add a description of the event",
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PlatformDropdown(
                    selectedValue = state.editEvent.sportId.orEmpty(),
                    onSelectionChange = actions.onSportSelected,
                    options = state.sports.map { sport ->
                        DropdownOption(value = sport.id, label = sport.name)
                    },
                    label = "Sport",
                    placeholder = if (state.sports.isEmpty()) "No sports available" else "Select a sport",
                    isError = !state.isSportValid,
                    supportingText = if (!state.isSportValid) "Select a sport to continue." else "",
                    enabled = state.sports.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                )
                EventTagsEditor(
                    tags = state.editEvent.tags,
                    eventType = state.editEvent.eventType,
                    onTagsChange = { tags ->
                        actions.onEditEvent { copy(tags = tags) }
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            FormSectionDivider()

            val supportsNoFixedEndDateTime =
                state.editEvent.eventType == EventType.LEAGUE ||
                    state.editEvent.eventType == EventType.TOURNAMENT ||
                    state.editEvent.eventType == EventType.WEEKLY_EVENT

            if (state.editEvent.eventType == EventType.EVENT || supportsNoFixedEndDateTime) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StandardTextField(
                        value = state.editEvent.start.toLocalDateTime(state.editEventTimeZone)
                            .format(dateTimeFormat),
                        onValueChange = {},
                        modifier = Modifier.weight(1f),
                        label = "Start Date & Time",
                        readOnly = true,
                        onTap = {
                            if (!state.scheduleTimeLocked) {
                                actions.onShowStartPicker()
                            }
                        },
                    )
                    StandardTextField(
                        value = state.editEvent.end.toLocalDateTime(state.editEventTimeZone)
                            .format(dateTimeFormat),
                        onValueChange = {},
                        modifier = Modifier.weight(1f),
                        label = "End Date & Time",
                        enabled = !state.scheduleTimeLocked &&
                            !(supportsNoFixedEndDateTime && state.editEvent.noFixedEndDateTime),
                        readOnly = true,
                        onTap = {
                            if (
                                !state.scheduleTimeLocked &&
                                !(supportsNoFixedEndDateTime && state.editEvent.noFixedEndDateTime)
                            ) {
                                actions.onShowEndPicker()
                            }
                        },
                    )
                }
            } else {
                StandardTextField(
                    value = state.editEvent.start.toLocalDateTime(state.editEventTimeZone)
                        .format(dateTimeFormat),
                    onValueChange = {},
                    modifier = Modifier.fillMaxWidth(),
                    label = "Start Date & Time",
                    readOnly = true,
                    onTap = {
                        if (!state.scheduleTimeLocked) {
                            actions.onShowStartPicker()
                        }
                    },
                )
            }

            if (supportsNoFixedEndDateTime) {
                val minimumFixedEnd = Instant.fromEpochMilliseconds(
                    state.editEvent.start.toEpochMilliseconds() + 60L * 60L * 1000L,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = state.editEvent.noFixedEndDateTime,
                        enabled = !state.scheduleTimeLocked,
                        onCheckedChange = { checked ->
                            actions.onEditEvent {
                                copy(
                                    noFixedEndDateTime = checked,
                                    end = when {
                                        end <= start -> minimumFixedEnd
                                        else -> end
                                    },
                                )
                            }
                        },
                    )
                    Text(
                        text = "No fixed end datetime scheduling",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(localImageScheme.current.onSurface),
                    )
                }
                if (state.editEvent.noFixedEndDateTime) {
                    Text(
                        text = "Scheduling can extend past the displayed end date/time. Turn this off to enforce the end date/time.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(localImageScheme.current.onSurface),
                    )
                }
            }

            if (state.scheduleTimeLocked) {
                Text(
                    text = if (state.rentalTimeLocked) {
                        "Rental-selected start and end times are fixed and cannot be changed."
                    } else {
                        "Facility-managed timeslots lock the event time range in mobile edit mode."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(localImageScheme.current.onSurface),
                )
            }
        },
    )
}

@Composable
private fun EventTagsEditor(
    tags: List<EventTag>,
    eventType: EventType,
    onTagsChange: (List<EventTag>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var draftTag by remember { mutableStateOf("") }
    val normalizedTags = remember(tags, eventType) {
        tags.syncEventTypeTagsForEventType(eventType)
    }
    val lockedSlugs = remember(eventType) { lockedEventTypeTagSlugs(eventType) }
    val defaultOptions = remember(normalizedTags) {
        val selectedSlugs = normalizedTags.map { tag -> tag.eventTagIdentity() }.toSet()
        defaultEventTagOptions.filter { option -> option.eventTagIdentity() !in selectedSlugs }
    }

    fun addDraftTag() {
        val tag = EventTag(name = draftTag)
            .normalizedEventTag()
            ?: return
        onTagsChange((normalizedTags + tag).syncEventTypeTagsForEventType(eventType))
        draftTag = ""
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StandardTextField(
            value = draftTag,
            onValueChange = { draftTag = it },
            label = "Tags",
            placeholder = "Add a tag",
            trailingIcon = {
                TextButton(
                    onClick = ::addDraftTag,
                    enabled = draftTag.isNotBlank(),
                ) {
                    Text("Add")
                }
            },
            imeAction = ImeAction.Done,
            onImeAction = ::addDraftTag,
            modifier = Modifier.fillMaxWidth(),
        )
        if (normalizedTags.isNotEmpty()) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                normalizedTags.forEach { tag ->
                    val identity = tag.eventTagIdentity()
                    val locked = identity in lockedSlugs
                    FilterChip(
                        selected = true,
                        enabled = !locked,
                        onClick = {
                            if (!locked) {
                                onTagsChange(
                                    normalizedTags
                                        .filterNot { existing -> existing.eventTagIdentity() == identity }
                                        .syncEventTypeTagsForEventType(eventType),
                                )
                            }
                        },
                        label = { Text(tag.name) },
                    )
                }
            }
        }
        if (defaultOptions.isNotEmpty()) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                defaultOptions.forEach { option ->
                    FilterChip(
                        selected = false,
                        onClick = {
                            onTagsChange((normalizedTags + option).syncEventTypeTagsForEventType(eventType))
                        },
                        label = { Text(option.name) },
                    )
                }
            }
        }
    }
}
