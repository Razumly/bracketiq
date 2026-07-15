package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.eventTagIdentity
import com.razumly.mvp.core.data.dataTypes.lockedEventTypeTagSlugs
import com.razumly.mvp.core.data.dataTypes.normalizedEventTags
import com.razumly.mvp.core.data.dataTypes.reservedEventTypeTagSlugs
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.syncEventTypeTagsForEventType
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.EventTagSearchDropdown
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

private val SystemTagChipSelectedContainer = Color(0xFF1565C0)
private val CommunityTagChipSelectedContainer = Color(0xFF2E7D32)
private val TagChipSelectedContent = Color.White



internal fun LazyListScope.simpleEventDetailsBasicInfoSection(
    state: EventDetailsBasicInfoState,
    actions: EventDetailsBasicInfoActions,
    showContainer: Boolean = true,
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
        showContainer = showContainer,
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
                    label = "Sport *",
                    placeholder = if (state.sports.isEmpty()) "No sports available" else "Select a sport",
                    isError = state.showValidationErrors && !state.isSportValid,
                    supportingText = if (state.showValidationErrors && !state.isSportValid) {
                        "Select a sport to continue."
                    } else {
                        ""
                    },
                    enabled = state.sports.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                )
                EventTagsEditor(
                    tags = state.editEvent.tags,
                    tagOptions = state.eventTagOptions,
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
                        label = "Start Date & Time *",
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
                        label = "End Date & Time *",
                        isError = state.showValidationErrors && !state.isFixedEndDateRangeValid,
                        supportingText = if (state.showValidationErrors && !state.isFixedEndDateRangeValid) {
                            "End date and time must be after the start."
                        } else {
                            ""
                        },
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
                    label = "Start Date & Time *",
                    readOnly = true,
                    onTap = {
                        if (!state.scheduleTimeLocked) {
                            actions.onShowStartPicker()
                        }
                    },
                )
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
    tagOptions: List<EventTag>,
    eventType: EventType,
    onTagsChange: (List<EventTag>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var draftTag by remember { mutableStateOf("") }
    var selectedTagsExpanded by remember { mutableStateOf(tags.isNotEmpty()) }
    val normalizedTags = remember(tags, eventType) {
        tags.syncEventTypeTagsForEventType(eventType)
    }
    val lockedSlugs = remember(eventType) { lockedEventTypeTagSlugs(eventType) }
    val reservedSlugs = remember { reservedEventTypeTagSlugs() }
    val selectedSlugs = remember(normalizedTags) {
        normalizedTags.map { tag -> tag.eventTagIdentity() }.toSet()
    }
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        EventTagSearchDropdown(
            value = draftTag,
            onValueChange = { draftTag = it },
            tags = tagOptions.normalizedEventTags(),
            selectedTagSlugs = selectedSlugs,
            onTagSelected = { option ->
                onTagsChange((normalizedTags + option).syncEventTypeTagsForEventType(eventType))
            },
            label = "Tags",
            placeholder = "Enter tag",
            hideSelectedOptions = true,
            allowCustomTag = true,
            onCustomTagAdded = { tag ->
                onTagsChange((normalizedTags + tag).syncEventTypeTagsForEventType(eventType))
            },
            collapseOnSelect = true,
            excludedTagSlugs = reservedSlugs,
            modifier = Modifier.fillMaxWidth(),
        )
        if (normalizedTags.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { selectedTagsExpanded = !selectedTagsExpanded },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "${normalizedTags.size} selected",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                IconButton(onClick = { selectedTagsExpanded = !selectedTagsExpanded }) {
                    Icon(
                        imageVector = if (selectedTagsExpanded) {
                            Icons.Default.KeyboardArrowUp
                        } else {
                            Icons.Default.KeyboardArrowDown
                        },
                        contentDescription = if (selectedTagsExpanded) "Collapse selected tags" else "Expand selected tags",
                    )
                }
            }
            AnimatedVisibility(
                visible = selectedTagsExpanded,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    normalizedTags.forEach { tag ->
                        val identity = tag.eventTagIdentity()
                        val locked = identity in lockedSlugs
                        val selectedContainer = if (tag.isSystem) {
                            SystemTagChipSelectedContainer
                        } else {
                            CommunityTagChipSelectedContainer
                        }
                        val selectedTagChipColors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = selectedContainer,
                            selectedLabelColor = TagChipSelectedContent,
                            disabledSelectedContainerColor = selectedContainer.copy(alpha = 0.62f),
                            disabledLabelColor = TagChipSelectedContent.copy(alpha = 0.78f),
                        )
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
                            colors = selectedTagChipColors,
                            label = { Text(tag.name) },
                        )
                    }
                }
            }
        }
    }
}
