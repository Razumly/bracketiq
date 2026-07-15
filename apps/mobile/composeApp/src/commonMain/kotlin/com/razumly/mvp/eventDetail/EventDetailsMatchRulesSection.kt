package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchIncidentTypeDefinitionMVP
import com.razumly.mvp.core.data.dataTypes.MatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.shared.DetailKeyValueList
import com.razumly.mvp.eventDetail.shared.DetailRowSpec
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow
import com.razumly.mvp.eventDetail.shared.animatedCardSection
import com.razumly.mvp.eventDetail.shared.localImageScheme

internal data class EventDetailsMatchRulesState(
    val readOnlySection: ReadOnlySectionModel,
    val sectionExpansionStates: SnapshotStateMap<String, Boolean>,
    val eventDetailsMode: EventDetailsMode,
    val lazyListState: LazyListState,
    val stickyHeaderTopInset: Dp,
    val enabled: Boolean,
    val showSection: Boolean,
    val event: Event,
    val editEvent: Event,
    val baseMatchRules: ResolvedMatchRulesMVP,
    val resolvedMatchRules: ResolvedMatchRulesMVP,
    val selectedMatchIncidentTypes: List<String>,
    val matchIncidentOptions: List<DropdownOption>,
    val autoPointIncidentType: String,
    val customIncidentDraft: String,
    val matchIncidentLabel: (String) -> String,
)

internal data class EventDetailsMatchRulesActions(
    val onDisabledClick: () -> Unit,
    val onEditEvent: (Event.() -> Event) -> Unit,
    val onCustomIncidentDraftChange: (String) -> Unit,
)

internal fun LazyListScope.eventDetailsMatchRulesSection(
    state: EventDetailsMatchRulesState,
    actions: EventDetailsMatchRulesActions,
    showContainer: Boolean = true,
) {
    if (!state.showSection) {
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
        animationDelay = 250,
        showContainer = showContainer,
        viewContent = {
            DetailKeyValueList(
                rows = buildList {
                    if (state.resolvedMatchRules.canUseOvertime) {
                        add(
                            DetailRowSpec(
                                "Allow overtime",
                                if (state.resolvedMatchRules.supportsOvertime) "Yes" else "No",
                            ),
                        )
                    }
                    if (state.resolvedMatchRules.canUseShootout) {
                        add(
                            DetailRowSpec(
                                "Allow shootout / tiebreak",
                                if (state.resolvedMatchRules.supportsShootout) "Yes" else "No",
                            ),
                        )
                    }
                    if (state.resolvedMatchRules.timekeeping.timerMode != "NONE") {
                        add(
                            DetailRowSpec(
                                "${state.resolvedMatchRules.segmentLabel} length",
                                "${state.resolvedMatchRules.timekeeping.segmentDurationMinutes ?: 0} minutes",
                            ),
                        )
                        if (state.resolvedMatchRules.timekeeping.canUseAddedTime) {
                            add(
                                DetailRowSpec(
                                    "Added time",
                                    if (state.resolvedMatchRules.timekeeping.addedTimeEnabled) "Yes" else "No",
                                ),
                            )
                        }
                    }
                    add(
                        DetailRowSpec(
                            "Create a scoring incident for each point / goal",
                            if (state.event.autoCreatePointMatchIncidents) "Yes" else "No",
                        ),
                    )
                    if (state.selectedMatchIncidentTypes.isNotEmpty()) {
                        add(
                            DetailRowSpec(
                                "Incident types",
                                state.selectedMatchIncidentTypes.joinToString(", ") { incidentType ->
                                    state.matchIncidentLabel(incidentType)
                                },
                            ),
                        )
                    }
                    if (state.resolvedMatchRules.officialRoles.isNotEmpty()) {
                        add(
                            DetailRowSpec(
                                "Suggested officials",
                                state.resolvedMatchRules.officialRoles.joinToString(", "),
                            ),
                        )
                    }
                },
            )
        },
        editContent = {
            Text(
                text = "The sport defines the match format. This event can adjust supported result paths and incident capture without changing the sport default.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(localImageScheme.current.onSurfaceVariant),
            )
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (state.baseMatchRules.canUseOvertime) {
                    LabeledCheckboxRow(
                        checked = state.resolvedMatchRules.supportsOvertime,
                        label = "Allow overtime",
                        onCheckedChange = { checked ->
                            actions.onEditEvent {
                                copy(
                                    matchRulesOverride = copyMatchRulesOverride(
                                        current = matchRulesOverride,
                                        supportsOvertime = checked.takeUnless {
                                            it == state.baseMatchRules.supportsOvertime
                                        },
                                    ),
                                )
                            }
                        },
                    )
                }
                if (state.baseMatchRules.canUseShootout) {
                    LabeledCheckboxRow(
                        checked = state.resolvedMatchRules.supportsShootout,
                        label = "Allow shootout / tiebreak",
                        onCheckedChange = { checked ->
                            actions.onEditEvent {
                                copy(
                                    matchRulesOverride = copyMatchRulesOverride(
                                        current = matchRulesOverride,
                                        supportsShootout = checked.takeUnless {
                                            it == state.baseMatchRules.supportsShootout
                                        },
                                    ),
                                )
                            }
                        },
                    )
                }
                if (state.baseMatchRules.timekeeping.timerMode != "NONE") {
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(),
                        value = state.resolvedMatchRules.timekeeping.segmentDurationMinutes
                            ?.toString()
                            .orEmpty(),
                        label = "${state.resolvedMatchRules.segmentLabel} length",
                        isError = false,
                        onValueChange = { value ->
                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                return@NumberInputField
                            }
                            val parsedDuration = value.toIntOrNull()?.takeIf { it > 0 }
                            val durationOverride = parsedDuration
                                ?.takeUnless {
                                    it == state.baseMatchRules.timekeeping.segmentDurationMinutes
                                }
                            val nextTimekeeping = (state.editEvent.matchRulesOverride?.timekeeping
                                ?: MatchTimekeepingConfigMVP()).copy(
                                segmentDurationMinutes = durationOverride,
                            )
                            val totalDuration = parsedDuration
                                ?.let { duration -> duration * state.resolvedMatchRules.segmentCount.coerceAtLeast(1) }
                            actions.onEditEvent {
                                copy(
                                    usesSets = false,
                                    setDurationMinutes = null,
                                    matchDurationMinutes = totalDuration ?: matchDurationMinutes,
                                    matchRulesOverride = copyMatchRulesOverride(
                                        current = matchRulesOverride,
                                        timekeeping = nextTimekeeping,
                                    ),
                                )
                            }
                        },
                    )
                    if (state.baseMatchRules.timekeeping.canUseAddedTime) {
                        LabeledCheckboxRow(
                            checked = state.resolvedMatchRules.timekeeping.addedTimeEnabled,
                            label = "Allow added time",
                            onCheckedChange = { checked ->
                                val addedTimeOverride = checked.takeUnless {
                                    it == state.baseMatchRules.timekeeping.addedTimeEnabled
                                }
                                val nextTimekeeping = (state.editEvent.matchRulesOverride?.timekeeping
                                    ?: MatchTimekeepingConfigMVP()).copy(
                                    addedTimeEnabled = addedTimeOverride,
                                    stopAtRegulationEnd = addedTimeOverride?.not(),
                                )
                                actions.onEditEvent {
                                    copy(
                                        matchRulesOverride = copyMatchRulesOverride(
                                            current = matchRulesOverride,
                                            timekeeping = nextTimekeeping,
                                        ),
                                    )
                                }
                            },
                        )
                    }
                }
            }
            PlatformDropdown(
                selectedValue = "",
                onSelectionChange = {},
                options = state.matchIncidentOptions,
                label = "Incident types available in matches",
                modifier = Modifier.fillMaxWidth(),
                multiSelect = true,
                selectedValues = state.selectedMatchIncidentTypes,
                onMultiSelectionChange = { selectedValues ->
                    val enforcedIncidentTypes = enforceAutoPointIncidentType(
                        selected = selectedValues,
                        autoPointIncidentType = state.autoPointIncidentType,
                        enabled = state.editEvent.autoCreatePointMatchIncidents,
                    )
                    val incidentOverride = supportedIncidentTypesOverrideOrNull(
                        selected = enforcedIncidentTypes,
                        defaults = state.baseMatchRules.supportedIncidentTypes,
                    )
                    val retainedDefinitions = retainedCustomIncidentDefinitions(
                        selected = enforcedIncidentTypes,
                        definitions = state.editEvent.matchRulesOverride?.incidentTypeDefinitions.orEmpty(),
                        baseDefinitions = state.baseMatchRules.incidentTypeDefinitions,
                    )
                    actions.onEditEvent {
                        copy(
                            matchRulesOverride = copyMatchRulesOverride(
                                current = matchRulesOverride,
                                supportedIncidentTypes = incidentOverride,
                                incidentTypeDefinitions = retainedDefinitions,
                            ),
                        )
                    }
                },
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                StandardTextField(
                    value = state.customIncidentDraft,
                    onValueChange = actions.onCustomIncidentDraftChange,
                    modifier = Modifier.weight(1f),
                    label = "Custom incident type",
                    placeholder = "Blue card",
                    imeAction = ImeAction.Done,
                    onImeAction = {
                        addCustomIncidentType(state, actions)
                    },
                )
                Button(
                    onClick = {
                        addCustomIncidentType(state, actions)
                    },
                    enabled = customIncidentDefinition(state.customIncidentDraft) != null,
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    Text("Add")
                }
            }
            Text(
                text = "Type a custom incident and add it to make it available for match officials.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(localImageScheme.current.onSurfaceVariant),
            )
            LabeledCheckboxRow(
                checked = state.editEvent.autoCreatePointMatchIncidents,
                label = "Create a scoring incident for each point / goal",
                onCheckedChange = { checked ->
                    val nextSelectedIncidentTypes = if (checked) {
                        enforceAutoPointIncidentType(
                            selected = state.selectedMatchIncidentTypes,
                            autoPointIncidentType = state.autoPointIncidentType,
                            enabled = true,
                        )
                    } else {
                        val normalizedAutoPointType = state.autoPointIncidentType.trim().uppercase()
                        state.selectedMatchIncidentTypes.filter { incidentType ->
                            incidentType.trim().uppercase() != normalizedAutoPointType
                        }
                    }
                    val incidentOverride = supportedIncidentTypesOverrideOrNull(
                        selected = nextSelectedIncidentTypes,
                        defaults = state.baseMatchRules.supportedIncidentTypes,
                    )
                    val retainedDefinitions = retainedCustomIncidentDefinitions(
                        selected = nextSelectedIncidentTypes,
                        definitions = state.editEvent.matchRulesOverride?.incidentTypeDefinitions.orEmpty(),
                        baseDefinitions = state.baseMatchRules.incidentTypeDefinitions,
                    )
                    actions.onEditEvent {
                        copy(
                            autoCreatePointMatchIncidents = checked,
                            matchRulesOverride = copyMatchRulesOverride(
                                current = matchRulesOverride,
                                supportedIncidentTypes = incidentOverride,
                                incidentTypeDefinitions = retainedDefinitions,
                            ),
                        )
                    }
                },
            )
            Text(
                text = if (state.editEvent.autoCreatePointMatchIncidents) {
                    "${state.matchIncidentLabel(state.autoPointIncidentType)} incidents will stay available while automatic scoring capture is on."
                } else {
                    "Officials can still add incidents manually when needed."
                },
                style = MaterialTheme.typography.bodySmall,
                color = Color(localImageScheme.current.onSurfaceVariant),
            )
            if (state.resolvedMatchRules.officialRoles.isNotEmpty()) {
                Text(
                    text = "Suggested officials: ${state.resolvedMatchRules.officialRoles.joinToString(", ")}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(localImageScheme.current.onSurfaceVariant),
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(
                    onClick = {
                        actions.onEditEvent {
                            copy(matchRulesOverride = null)
                        }
                    },
                    enabled = state.editEvent.matchRulesOverride != null,
                ) {
                    Text("Reset to sport defaults")
                }
            }
        },
    )
}

private fun addCustomIncidentType(
    state: EventDetailsMatchRulesState,
    actions: EventDetailsMatchRulesActions,
) {
    val definition = customIncidentDefinition(state.customIncidentDraft) ?: return
    val nextSelectedIncidentTypes = enforceAutoPointIncidentType(
        selected = state.selectedMatchIncidentTypes + definition.code,
        autoPointIncidentType = state.autoPointIncidentType,
        enabled = state.editEvent.autoCreatePointMatchIncidents,
    )
    val incidentOverride = supportedIncidentTypesOverrideOrNull(
        selected = nextSelectedIncidentTypes,
        defaults = state.baseMatchRules.supportedIncidentTypes,
    )
    val nextDefinitions = retainedCustomIncidentDefinitions(
        selected = nextSelectedIncidentTypes,
        definitions = state.editEvent.matchRulesOverride?.incidentTypeDefinitions.orEmpty()
            .filterNot { existing -> existing.code.trim().uppercase() == definition.code }
            + definition,
        baseDefinitions = state.baseMatchRules.incidentTypeDefinitions,
    )
    actions.onEditEvent {
        copy(
            matchRulesOverride = copyMatchRulesOverride(
                current = matchRulesOverride,
                supportedIncidentTypes = incidentOverride,
                incidentTypeDefinitions = nextDefinitions,
            ),
        )
    }
    actions.onCustomIncidentDraftChange("")
}

private fun customIncidentCodeFromLabel(label: String): String =
    label.trim()
        .uppercase()
        .replace(Regex("[^A-Z0-9]+"), "_")
        .trim('_')

private fun customIncidentDefinition(label: String): MatchIncidentTypeDefinitionMVP? {
    val trimmed = label.trim()
    val code = customIncidentCodeFromLabel(trimmed)
    if (trimmed.isBlank() || code.isBlank()) return null
    return MatchIncidentTypeDefinitionMVP(
        code = code,
        label = trimmed,
        kind = "DISCIPLINE",
        requiresTeam = true,
        requiresParticipant = false,
        defaultEnabled = true,
    )
}

private fun retainedCustomIncidentDefinitions(
    selected: List<String>,
    definitions: List<MatchIncidentTypeDefinitionMVP>,
    baseDefinitions: List<MatchIncidentTypeDefinitionMVP>,
): List<MatchIncidentTypeDefinitionMVP>? {
    val selectedCodes = selected.map { it.trim().uppercase() }.filter(String::isNotBlank).toSet()
    val baseCodes = baseDefinitions.map { it.code.trim().uppercase() }.filter(String::isNotBlank).toSet()
    val retained = definitions
        .mapNotNull { definition ->
            val code = definition.code.trim().uppercase()
            if (code.isBlank() || code !in selectedCodes || code in baseCodes) {
                null
            } else {
                definition.copy(code = code)
            }
        }
        .distinctBy { it.code }
    return retained.takeIf { it.isNotEmpty() }
}
