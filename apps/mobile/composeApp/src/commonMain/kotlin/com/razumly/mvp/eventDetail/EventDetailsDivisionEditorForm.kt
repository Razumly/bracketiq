package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.InclusivePriceInput
import com.razumly.mvp.core.presentation.composables.MoneyInputField
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.moneyFormat
import com.razumly.mvp.eventDetail.composables.LeagueConfigurationFields
import com.razumly.mvp.eventDetail.composables.LeaguePlayoffConfigurationFields
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.composables.TournamentConfigurationFields
import com.razumly.mvp.eventDetail.shared.CollapsibleEditorSubsectionHeader
import com.razumly.mvp.eventDetail.shared.FormSectionDivider
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow
import com.razumly.mvp.eventDetail.shared.localImageScheme

internal data class EventDetailsDivisionEditorFormState(
    val editEvent: Event,
    val divisionDetails: List<DivisionDetail>,
    val selectedDivisions: List<String>,
    val divisionEditor: DivisionEditorState,
    val divisionEditorDefaults: DivisionEditorState,
    val divisionEditorReady: Boolean,
    val divisionScheduleUsesSets: Boolean,
    val skillDivisionTypeOptions: List<DropdownOption>,
    val ageDivisionTypeOptions: List<DropdownOption>,
    val genderOptions: List<DropdownOption>,
    val divisionInputsExpanded: Boolean,
    val hostHasAccount: Boolean,
    val isNewEvent: Boolean,
    val addSelfToEvent: Boolean,
)

internal data class EventDetailsDivisionEditorFormActions(
    val onEditEvent: (Event.() -> Event) -> Unit,
    val onDivisionEditorChange: (DivisionEditorState) -> Unit,
    val onDivisionEditorDefaultsChange: (DivisionEditorState) -> Unit,
    val onUpdateDivisionEditorSelection: (String?, String?, String?) -> Unit,
    val onNormalizeLeagueConfigWithSportMode: (LeagueConfig) -> LeagueConfig,
    val onUpdateDivisionLeagueConfig: (LeagueConfig) -> Unit,
    val onUpdateDivisionPlayoffConfig: (TournamentConfig) -> Unit,
    val onUpdateDivisionTournamentConfig: (TournamentConfig) -> Unit,
    val onSyncLeagueSlotsForSelectedDivisions: (List<String>, Boolean?) -> Unit,
    val onSetDivisionPaymentPlansEnabled: (Boolean) -> Unit,
    val onSyncDivisionInstallmentCount: (Int) -> Unit,
    val onUpdateDivisionInstallmentAmount: (Int, Int) -> Unit,
    val onSetDivisionInstallmentDueDatePickerIndex: (Int) -> Unit,
    val onAddDivisionInstallmentRow: () -> Unit,
    val onRemoveDivisionInstallmentRow: (Int) -> Unit,
    val onAddSelfToEventChange: (Boolean) -> Unit,
    val onAddCurrentUser: (Boolean) -> Unit,
    val onDivisionInputsExpandedChange: (Boolean) -> Unit,
    val onShowPriceBreakdown: (PricePreviewBreakdown) -> Unit,
)

@Composable
internal fun EventDetailsDivisionEditorForm(
    state: EventDetailsDivisionEditorFormState,
    actions: EventDetailsDivisionEditorFormActions,
) {
    DivisionModeToggle(
        state = state,
        actions = actions,
    )

    DivisionSingleDivisionDefaults(
        state = state,
        actions = actions,
    )

    if (state.isNewEvent) {
        AnimatedVisibility(!state.editEvent.teamSignup) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    LabeledCheckboxRow(
                        checked = state.addSelfToEvent,
                        label = "Join as participant",
                        onCheckedChange = {
                            actions.onAddSelfToEventChange(it)
                            actions.onAddCurrentUser(it)
                        },
                    )
                }
                Box(modifier = Modifier.weight(1f))
            }
        }
    }

    val divisionInputsTitle = if (state.divisionEditor.editingId.isNullOrBlank()) {
        "New Division"
    } else {
        "Edit Division"
    }
    FormSectionDivider()
    CollapsibleEditorSubsectionHeader(
        title = divisionInputsTitle,
        expanded = state.divisionInputsExpanded,
        onToggle = { actions.onDivisionInputsExpandedChange(!state.divisionInputsExpanded) },
    )
    AnimatedVisibility(visible = state.divisionInputsExpanded) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!state.editEvent.singleDivision) {
                DivisionScheduleConfigurationFields(
                    state = state,
                    actions = actions,
                )
            }

            DivisionInfoFields(
                state = state,
                actions = actions,
            )

            DivisionTournamentPoolFields(
                state = state,
                actions = actions,
            )

            DivisionPaymentPlanFields(
                state = state,
                actions = actions,
            )
        }
    }
}

@Composable
private fun DivisionModeToggle(
    state: EventDetailsDivisionEditorFormState,
    actions: EventDetailsDivisionEditorFormActions,
) {
    val editEvent = state.editEvent
    val divisionEditor = state.divisionEditor

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(modifier = Modifier.weight(1f)) {
            LabeledCheckboxRow(
                checked = editEvent.singleDivision,
                label = "Single Division",
                enabled = true,
                onCheckedChange = { checked ->
                    val explicitPlayoffCount =
                        editEvent.playoffTeamCount
                            ?: state.divisionDetails.firstOrNull()?.playoffTeamCount
                    val explicitPoolCount =
                        state.divisionDetails.firstOrNull()?.poolCount
                            ?: divisionEditor.poolCount
                    val defaultInstallmentAmounts = editEvent.installmentAmounts.map { amount ->
                        amount.coerceAtLeast(0)
                    }
                    val defaultInstallmentDueDates = editEvent.installmentDueDates
                        .map { dueDate -> dueDate.trim() }
                        .filter(String::isNotBlank)
                    val defaultInstallmentDueRelativeDays = editEvent.installmentDueRelativeDays
                    val useRelativeDueDates = editEvent.eventType == EventType.WEEKLY_EVENT
                    val defaultInstallmentCount = maxOf(
                        editEvent.installmentCount ?: 0,
                        defaultInstallmentAmounts.size,
                        if (useRelativeDueDates) {
                            defaultInstallmentDueRelativeDays.size
                        } else {
                            defaultInstallmentDueDates.size
                        },
                    ).takeIf { count -> count > 0 }
                    val defaultAllowPaymentPlans = editEvent.allowPaymentPlans == true &&
                        defaultInstallmentCount != null &&
                        editEvent.priceCents.coerceAtLeast(0) > 0
                    actions.onEditEvent {
                        val normalizedDivisions = divisions.normalizeDivisionIdentifiers()
                        val nextDivisionDetails = mergeDivisionDetailsForDivisions(
                            divisions = normalizedDivisions,
                            existingDetails = divisionDetails,
                            eventId = id,
                        ).map { existing ->
                            val nextPlayoffCount = if (!includePlayoffs) {
                                null
                            } else if (checked) {
                                explicitPlayoffCount ?: existing.playoffTeamCount
                            } else {
                                existing.playoffTeamCount ?: playoffTeamCount
                            }
                            if (checked) {
                                existing.copy(
                                    price = editEvent.priceCents.coerceAtLeast(0),
                                    maxParticipants = editEvent.maxParticipants
                                        .takeIf { value -> value >= 2 },
                                    playoffTeamCount = nextPlayoffCount,
                                    poolCount = explicitPoolCount,
                                    poolTeamCount = derivePoolTeamCount(
                                        maxTeams = editEvent.maxParticipants,
                                        poolCount = explicitPoolCount,
                                    ),
                                    allowPaymentPlans = defaultAllowPaymentPlans,
                                    installmentCount = defaultInstallmentCount,
                                    installmentDueDates = if (defaultAllowPaymentPlans) {
                                        if (useRelativeDueDates) emptyList() else defaultInstallmentDueDates
                                    } else {
                                        emptyList()
                                    },
                                    installmentDueRelativeDays = if (defaultAllowPaymentPlans && useRelativeDueDates) {
                                        defaultInstallmentDueRelativeDays
                                    } else {
                                        emptyList()
                                    },
                                    installmentAmounts = if (defaultAllowPaymentPlans) {
                                        defaultInstallmentAmounts
                                    } else {
                                        emptyList()
                                    },
                                )
                            } else {
                                val existingInstallmentAmounts = existing.installmentAmounts
                                    .map { amount -> amount.coerceAtLeast(0) }
                                val existingInstallmentDueDates = existing.installmentDueDates
                                    .map { dueDate -> dueDate.trim() }
                                    .filter(String::isNotBlank)
                                val existingInstallmentDueRelativeDays = existing.installmentDueRelativeDays
                                val existingInstallmentCount = maxOf(
                                    existing.installmentCount ?: 0,
                                    existingInstallmentAmounts.size,
                                    if (useRelativeDueDates) {
                                        existingInstallmentDueRelativeDays.size
                                    } else {
                                        existingInstallmentDueDates.size
                                    },
                                ).takeIf { count -> count > 0 } ?: defaultInstallmentCount
                                val existingAllowPaymentPlans = when (existing.allowPaymentPlans) {
                                    null -> defaultAllowPaymentPlans
                                    else -> existing.allowPaymentPlans == true
                                } && existingInstallmentCount != null
                                existing.copy(
                                    playoffTeamCount = nextPlayoffCount,
                                    allowPaymentPlans = existingAllowPaymentPlans,
                                    installmentCount = if (existingAllowPaymentPlans) {
                                        existingInstallmentCount
                                    } else {
                                        null
                                    },
                                    installmentDueDates = if (existingAllowPaymentPlans) {
                                        if (useRelativeDueDates) {
                                            emptyList()
                                        } else if (existingInstallmentDueDates.isNotEmpty()) {
                                            existingInstallmentDueDates
                                        } else {
                                            defaultInstallmentDueDates
                                        }
                                    } else {
                                        emptyList()
                                    },
                                    installmentDueRelativeDays = if (existingAllowPaymentPlans && useRelativeDueDates) {
                                        if (existingInstallmentDueRelativeDays.isNotEmpty()) {
                                            existingInstallmentDueRelativeDays
                                        } else {
                                            defaultInstallmentDueRelativeDays
                                        }
                                    } else {
                                        emptyList()
                                    },
                                    installmentAmounts = if (existingAllowPaymentPlans) {
                                        if (existingInstallmentAmounts.isNotEmpty()) {
                                            existingInstallmentAmounts
                                        } else {
                                            defaultInstallmentAmounts
                                        }
                                    } else {
                                        emptyList()
                                    },
                                )
                            }
                        }
                        copy(
                            singleDivision = checked,
                            allowTeamSplitDefault = if (checked) false else allowTeamSplitDefault,
                            playoffTeamCount = if (includePlayoffs) {
                                if (checked) {
                                    explicitPlayoffCount
                                } else {
                                    playoffTeamCount
                                }
                            } else {
                                null
                            },
                            divisionDetails = nextDivisionDetails,
                        )
                    }
                    actions.onSyncLeagueSlotsForSelectedDivisions(
                        state.selectedDivisions,
                        !checked,
                    )
                },
            )
        }
        Box(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun DivisionScheduleConfigurationFields(
    state: EventDetailsDivisionEditorFormState,
    actions: EventDetailsDivisionEditorFormActions,
) {
    val editEvent = state.editEvent
    val divisionEditor = state.divisionEditor

    if (editEvent.eventType == EventType.TOURNAMENT && editEvent.includePlayoffs) {
        LeagueConfigurationFields(
            title = "Pool Configuration",
            leagueConfig = actions.onNormalizeLeagueConfigWithSportMode(divisionEditor.leagueConfig).copy(
                includePlayoffs = false,
                playoffTeamCount = null,
            ),
            onLeagueConfigChange = actions.onUpdateDivisionLeagueConfig,
        )
    }

    if (editEvent.eventType == EventType.TOURNAMENT) {
        TournamentConfigurationFields(
            title = "Tournament Configuration",
            usesSets = state.divisionScheduleUsesSets,
            tournamentConfig = divisionEditor.playoffConfig,
            onTournamentConfigChange = actions.onUpdateDivisionTournamentConfig,
        )
    }

    if (editEvent.eventType == EventType.LEAGUE) {
        LeagueConfigurationFields(
            leagueConfig = actions.onNormalizeLeagueConfigWithSportMode(divisionEditor.leagueConfig).copy(
                includePlayoffs = editEvent.includePlayoffs,
                playoffTeamCount = divisionEditor.playoffTeamCount,
            ),
            onLeagueConfigChange = actions.onUpdateDivisionLeagueConfig,
        )
        if (editEvent.includePlayoffs) {
            LeaguePlayoffConfigurationFields(
                leagueConfig = actions.onNormalizeLeagueConfigWithSportMode(divisionEditor.leagueConfig).copy(
                    includePlayoffs = true,
                    playoffTeamCount = divisionEditor.playoffTeamCount,
                ),
                playoffConfig = divisionEditor.playoffConfig,
                onPlayoffConfigChange = actions.onUpdateDivisionPlayoffConfig,
            )
        }
    }
}

@Composable
private fun DivisionSingleDivisionDefaults(
    state: EventDetailsDivisionEditorFormState,
    actions: EventDetailsDivisionEditorFormActions,
) {
    val editEvent = state.editEvent
    val divisionEditor = state.divisionEditor
    val divisionEditorDefaults = state.divisionEditorDefaults

    AnimatedVisibility(editEvent.singleDivision) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val singleDivisionTournamentPoolPlayEnabled = editEvent.isTournamentPoolPlayEnabled()
            val singleDivisionPoolCount =
                divisionEditorDefaults.poolCount
                    ?: state.divisionDetails.firstOrNull()?.poolCount
                    ?: divisionEditor.poolCount
            val singleDivisionPoolTeamCount = derivePoolTeamCount(
                maxTeams = editEvent.maxParticipants,
                poolCount = singleDivisionPoolCount,
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                InclusivePriceInput(
                    totalPriceCents = editEvent.priceCents.coerceAtLeast(0),
                    onTotalPriceChange = { parsedPrice ->
                        if (!state.hostHasAccount) {
                            return@InclusivePriceInput
                        }
                        actions.onDivisionEditorDefaultsChange(
                            divisionEditorDefaults.copy(priceCents = parsedPrice),
                        )
                        if (divisionEditor.editingId.isNullOrBlank()) {
                            actions.onDivisionEditorChange(
                                divisionEditor.copy(
                                    priceCents = parsedPrice,
                                    error = null,
                                ),
                            )
                        }
                        actions.onEditEvent {
                            val nextDetails = applySingleDivisionDefaultsToDetails(
                                details = divisionDetails,
                                defaultPriceCents = parsedPrice,
                                defaultMaxParticipants = maxParticipants,
                                defaultPlayoffTeamCount = if (includePlayoffs) playoffTeamCount else null,
                                defaultPoolCount = if (singleDivisionTournamentPoolPlayEnabled) {
                                    singleDivisionPoolCount
                                } else {
                                    null
                                },
                            )
                            copy(
                                priceCents = parsedPrice,
                                divisionDetails = nextDetails,
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    totalLabel = "Price",
                    enabled = state.hostHasAccount,
                )
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(0.48f),
                    value = editEvent.maxParticipants
                        .takeIf { value -> value > 0 }
                        ?.toString()
                        .orEmpty(),
                    label = if (editEvent.teamSignup) "Max Teams" else "Max Participants",
                    onValueChange = { value ->
                        if (value.isEmpty() || value.all { it.isDigit() }) {
                            val parsedMaxParticipants = value.toIntOrNull() ?: 0
                            val nextDefaultMaxParticipants = parsedMaxParticipants
                                .takeIf { parsed -> parsed >= 2 }
                            actions.onDivisionEditorDefaultsChange(
                                divisionEditorDefaults.copy(
                                    maxParticipants = nextDefaultMaxParticipants,
                                ),
                            )
                            if (divisionEditor.editingId.isNullOrBlank()) {
                                actions.onDivisionEditorChange(
                                    divisionEditor.copy(
                                        maxParticipants = nextDefaultMaxParticipants,
                                        error = null,
                                    ),
                                )
                            }
                            actions.onEditEvent {
                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                    details = divisionDetails,
                                    defaultPriceCents = priceCents,
                                    defaultMaxParticipants = parsedMaxParticipants,
                                    defaultPlayoffTeamCount = if (includePlayoffs) playoffTeamCount else null,
                                    defaultPoolCount = if (singleDivisionTournamentPoolPlayEnabled) {
                                        singleDivisionPoolCount
                                    } else {
                                        null
                                    },
                                )
                                copy(
                                    maxParticipants = parsedMaxParticipants,
                                    divisionDetails = nextDetails,
                                )
                            }
                        }
                    },
                    isError = editEvent.maxParticipants < 2,
                    errorMessage = "Required and must be at least 2.",
                )
                if (
                    editEvent.includePlayoffs &&
                    editEvent.eventType == EventType.LEAGUE
                ) {
                    Spacer(modifier = Modifier.fillMaxWidth(0.48f))
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(0.48f),
                        value = editEvent.playoffTeamCount?.toString().orEmpty(),
                        label = "Playoff Team Count",
                        onValueChange = { value ->
                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                return@NumberInputField
                            }
                            val parsedPlayoffCount = value.toIntOrNull()
                            actions.onDivisionEditorDefaultsChange(
                                divisionEditorDefaults.copy(
                                    playoffTeamCount = parsedPlayoffCount?.takeIf { count -> count >= 2 },
                                ),
                            )
                            if (divisionEditor.editingId.isNullOrBlank()) {
                                actions.onDivisionEditorChange(
                                    divisionEditor.copy(
                                        playoffTeamCount = parsedPlayoffCount,
                                        error = null,
                                    ),
                                )
                            }
                            actions.onEditEvent {
                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                    details = divisionDetails,
                                    defaultPriceCents = priceCents,
                                    defaultMaxParticipants = maxParticipants,
                                    defaultPlayoffTeamCount = parsedPlayoffCount,
                                    defaultPoolCount = null,
                                )
                                copy(
                                    playoffTeamCount = parsedPlayoffCount,
                                    divisionDetails = nextDetails,
                                )
                            }
                        },
                        isError = (editEvent.playoffTeamCount ?: 0) < 2,
                        errorMessage = "Required and must be at least 2.",
                    )
                }
                if (singleDivisionTournamentPoolPlayEnabled) {
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(0.48f),
                        value = editEvent.playoffTeamCount?.toString().orEmpty(),
                        label = "Bracket Teams",
                        onValueChange = { value ->
                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                return@NumberInputField
                            }
                            val parsedBracketTeams = value.toIntOrNull()
                            actions.onDivisionEditorDefaultsChange(
                                divisionEditorDefaults.copy(
                                    playoffTeamCount = parsedBracketTeams?.takeIf { count -> count >= 2 },
                                ),
                            )
                            if (divisionEditor.editingId.isNullOrBlank()) {
                                actions.onDivisionEditorChange(
                                    divisionEditor.copy(
                                        playoffTeamCount = parsedBracketTeams,
                                        error = null,
                                    ),
                                )
                            }
                            actions.onEditEvent {
                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                    details = divisionDetails,
                                    defaultPriceCents = priceCents,
                                    defaultMaxParticipants = maxParticipants,
                                    defaultPlayoffTeamCount = parsedBracketTeams,
                                    defaultPoolCount = singleDivisionPoolCount,
                                )
                                copy(
                                    playoffTeamCount = parsedBracketTeams,
                                    divisionDetails = nextDetails,
                                )
                            }
                        },
                        isError = (editEvent.playoffTeamCount ?: 0) < 2 ||
                            (
                                singleDivisionPoolCount != null &&
                                    editEvent.playoffTeamCount != null &&
                                    editEvent.playoffTeamCount % singleDivisionPoolCount != 0
                                ),
                        errorMessage = "Must be at least 2 and divide evenly by pools.",
                    )
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(0.48f),
                        value = singleDivisionPoolCount?.toString().orEmpty(),
                        label = "Pool Count",
                        onValueChange = { value ->
                            if (value.isNotEmpty() && !value.all { it.isDigit() }) {
                                return@NumberInputField
                            }
                            val parsedPoolCount = value.toIntOrNull()
                            actions.onDivisionEditorDefaultsChange(
                                divisionEditorDefaults.copy(
                                    poolCount = parsedPoolCount?.takeIf { count -> count >= 1 },
                                ),
                            )
                            if (divisionEditor.editingId.isNullOrBlank()) {
                                actions.onDivisionEditorChange(
                                    divisionEditor.copy(
                                        poolCount = parsedPoolCount,
                                        error = null,
                                    ),
                                )
                            }
                            actions.onEditEvent {
                                val nextDetails = applySingleDivisionDefaultsToDetails(
                                    details = divisionDetails,
                                    defaultPriceCents = priceCents,
                                    defaultMaxParticipants = maxParticipants,
                                    defaultPlayoffTeamCount = playoffTeamCount,
                                    defaultPoolCount = parsedPoolCount,
                                )
                                copy(divisionDetails = nextDetails)
                            }
                        },
                        isError = (singleDivisionPoolCount ?: 0) < 1 ||
                            (
                                singleDivisionPoolCount != null &&
                                    editEvent.maxParticipants % singleDivisionPoolCount != 0
                                ),
                        errorMessage = "Max teams must divide evenly by pools.",
                    )
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(0.48f),
                        value = singleDivisionPoolTeamCount?.toString().orEmpty(),
                        label = "Pool Team Count",
                        enabled = false,
                        onValueChange = {},
                        isError = singleDivisionPoolTeamCount == null,
                        errorMessage = "Derived from Pool Count and Max Teams",
                        supportingText = "Derived from Pool Count and Max Teams",
                    )
                }
            }
            DivisionScheduleConfigurationFields(
                state = state,
                actions = actions,
            )
        }
    }
}

@Composable
private fun DivisionInfoFields(
    state: EventDetailsDivisionEditorFormState,
    actions: EventDetailsDivisionEditorFormActions,
) {
    val editEvent = state.editEvent
    val divisionEditor = state.divisionEditor

    Text(
        text = "Division Info",
        style = MaterialTheme.typography.titleSmall,
        color = Color(localImageScheme.current.onSurface),
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        PlatformDropdown(
            selectedValue = divisionEditor.gender,
            onSelectionChange = { value ->
                actions.onUpdateDivisionEditorSelection(value, null, null)
            },
            options = state.genderOptions,
            modifier = Modifier.weight(1f),
            label = "Gender",
            placeholder = "Select gender",
            isError = divisionEditor.gender.isBlank(),
            supportingText = if (divisionEditor.gender.isBlank()) {
                "Select a gender."
            } else {
                ""
            },
        )
        PlatformDropdown(
            selectedValue = divisionEditor.skillDivisionTypeId,
            onSelectionChange = { value ->
                actions.onUpdateDivisionEditorSelection(null, value, null)
            },
            options = state.skillDivisionTypeOptions,
            modifier = Modifier.weight(1f),
            label = "Skill Division",
            placeholder = "Select skill division",
            isError = divisionEditor.skillDivisionTypeId.isBlank(),
            supportingText = if (divisionEditor.skillDivisionTypeId.isBlank()) {
                "Select a skill division."
            } else {
                ""
            },
        )
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        PlatformDropdown(
            selectedValue = divisionEditor.ageDivisionTypeId,
            onSelectionChange = { value ->
                actions.onUpdateDivisionEditorSelection(null, null, value)
            },
            options = state.ageDivisionTypeOptions,
            modifier = Modifier.weight(1f),
            label = "Age Division",
            placeholder = "Select age division",
            isError = divisionEditor.ageDivisionTypeId.isBlank(),
            supportingText = if (divisionEditor.ageDivisionTypeId.isBlank()) {
                "Select an age division."
            } else {
                ""
            },
        )
        StandardTextField(
            value = divisionEditor.name,
            onValueChange = { value ->
                actions.onDivisionEditorChange(
                    divisionEditor.copy(
                        name = value,
                        nameTouched = true,
                        error = null,
                    ),
                )
            },
            modifier = Modifier.weight(1f),
            label = "Division Name",
            enabled = state.divisionEditorReady,
        )
    }

    AnimatedVisibility(!editEvent.singleDivision) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FormSectionDivider()
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                InclusivePriceInput(
                    totalPriceCents = divisionEditor.priceCents.coerceAtLeast(0),
                    onTotalPriceChange = { priceCents ->
                        if (!state.divisionEditorReady || !state.hostHasAccount) {
                            return@InclusivePriceInput
                        }
                        actions.onDivisionEditorChange(
                            divisionEditor.copy(
                                priceCents = priceCents.coerceAtLeast(0),
                                error = null,
                            ),
                        )
                    },
                    modifier = Modifier.weight(1f),
                    totalLabel = "Division price",
                    enabled = state.hostHasAccount && state.divisionEditorReady,
                )
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = divisionEditor.maxParticipants?.toString().orEmpty(),
                    label = if (editEvent.teamSignup) {
                        "Division Max Teams"
                    } else {
                        "Division Max Participants"
                    },
                    enabled = state.divisionEditorReady,
                    onValueChange = { value ->
                        if (!state.divisionEditorReady) {
                            return@NumberInputField
                        }
                        if (value.isEmpty() || value.all { it.isDigit() }) {
                            actions.onDivisionEditorChange(
                                divisionEditor.copy(
                                    maxParticipants = value.toIntOrNull(),
                                    error = null,
                                ),
                            )
                        }
                    },
                    isError = divisionEditor.maxParticipants.let { maxParticipants ->
                        maxParticipants == null || maxParticipants < 2
                    },
                    errorMessage = "Required and must be at least 2.",
                )
            }
        }
    }
}

@Composable
private fun DivisionTournamentPoolFields(
    state: EventDetailsDivisionEditorFormState,
    actions: EventDetailsDivisionEditorFormActions,
) {
    val editEvent = state.editEvent
    val divisionEditor = state.divisionEditor

    if (editEvent.eventType != EventType.TOURNAMENT || editEvent.singleDivision) {
        return
    }

    val tournamentPoolPlayEnabled = editEvent.isTournamentPoolPlayEnabled()
    val divisionMaxTeams = if (editEvent.singleDivision) {
        editEvent.maxParticipants.takeIf { value -> value >= 2 } ?: 0
    } else {
        divisionEditor.maxParticipants ?: 0
    }
    val divisionPoolCount = divisionEditor.poolCount
    val divisionBracketTeamCount = divisionEditor.playoffTeamCount
    val divisionPoolTeamCount = derivePoolTeamCount(
        maxTeams = divisionMaxTeams,
        poolCount = divisionPoolCount,
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (editEvent.singleDivision) {
            Box(modifier = Modifier.weight(1f))
        } else {
            NumberInputField(
                modifier = Modifier.weight(1f),
                value = divisionBracketTeamCount?.toString().orEmpty(),
                label = "Bracket Teams",
                enabled = tournamentPoolPlayEnabled && state.divisionEditorReady,
                onValueChange = { value ->
                    if (!state.divisionEditorReady || !tournamentPoolPlayEnabled) {
                        return@NumberInputField
                    }
                    if (value.isEmpty() || value.all { it.isDigit() }) {
                        actions.onDivisionEditorChange(
                            divisionEditor.copy(
                                playoffTeamCount = if (value.isBlank()) null else value.toIntOrNull(),
                                error = null,
                            ),
                        )
                    }
                },
                isError = tournamentPoolPlayEnabled &&
                    ((divisionBracketTeamCount ?: 0) < 2 ||
                        (
                            divisionPoolCount != null &&
                                divisionBracketTeamCount != null &&
                                divisionBracketTeamCount % divisionPoolCount != 0
                            )),
                errorMessage = "Must be at least 2 and divide evenly by pools.",
            )
        }
        NumberInputField(
            modifier = Modifier.weight(1f),
            value = divisionPoolCount?.toString().orEmpty(),
            label = "Pool Count",
            enabled = tournamentPoolPlayEnabled && state.divisionEditorReady,
            onValueChange = { value ->
                if (!state.divisionEditorReady || !tournamentPoolPlayEnabled) {
                    return@NumberInputField
                }
                if (value.isEmpty() || value.all { it.isDigit() }) {
                    actions.onDivisionEditorChange(
                        divisionEditor.copy(
                            poolCount = if (value.isBlank()) null else value.toIntOrNull(),
                            error = null,
                        ),
                    )
                }
            },
            isError = tournamentPoolPlayEnabled &&
                ((divisionPoolCount ?: 0) < 1 ||
                    (
                        divisionPoolCount != null &&
                            divisionMaxTeams % divisionPoolCount != 0
                        )),
            errorMessage = "Max teams must divide evenly by pools.",
        )
    }
    NumberInputField(
        modifier = Modifier.fillMaxWidth(0.48f),
        value = divisionPoolTeamCount?.toString().orEmpty(),
        label = "Pool Team Count",
        enabled = false,
        onValueChange = {},
        isError = divisionPoolTeamCount == null,
        errorMessage = "Derived from Pool Count and Max Teams",
        supportingText = "Derived from Pool Count and Max Teams",
    )
}

@Composable
private fun DivisionPaymentPlanFields(
    state: EventDetailsDivisionEditorFormState,
    actions: EventDetailsDivisionEditorFormActions,
) {
    val editEvent = state.editEvent
    val divisionEditor = state.divisionEditor

    if (state.isNewEvent || editEvent.singleDivision) {
        return
    }

    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
    Text(
        text = "Division Payment Plan",
        style = MaterialTheme.typography.titleSmall,
        color = Color(localImageScheme.current.onSurface),
    )
    LabeledCheckboxRow(
        checked = divisionEditor.allowPaymentPlans,
        label = "Allow payment plan for this division",
        enabled = state.hostHasAccount && divisionEditor.priceCents > 0 && state.divisionEditorReady,
        onCheckedChange = { checked ->
            if (!state.divisionEditorReady || !state.hostHasAccount) {
                return@LabeledCheckboxRow
            }
            actions.onSetDivisionPaymentPlansEnabled(checked)
        },
    )
    if (divisionEditor.allowPaymentPlans) {
        val useRelativeDueDates = editEvent.eventType == EventType.WEEKLY_EVENT
        val installmentCount = maxOf(
            divisionEditor.installmentCount,
            divisionEditor.installmentAmounts.size,
            if (useRelativeDueDates) {
                divisionEditor.installmentDueRelativeDays.size
            } else {
                divisionEditor.installmentDueDates.size
            },
            1,
        )
        NumberInputField(
            value = installmentCount.toString(),
            label = "Installment Count",
            onValueChange = { newValue ->
                if (!newValue.all { it.isDigit() }) return@NumberInputField
                val parsed = newValue.toIntOrNull() ?: 1
                actions.onSyncDivisionInstallmentCount(parsed.coerceAtLeast(1))
            },
            isError = installmentCount <= 0,
            errorMessage = "Installment count must be at least 1.",
        )
        repeat(installmentCount) { index ->
            val amountCents = divisionEditor.installmentAmounts.getOrNull(index) ?: 0
            val dueDate = divisionEditor.installmentDueDates.getOrNull(index).orEmpty()
            val dueOffset = divisionEditor.installmentDueRelativeDays.getOrNull(index) ?: 0
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                MoneyInputField(
                    value = amountCents.toString(),
                    label = "Installment ${index + 1} Amount",
                    onValueChange = { newValue ->
                        val parsed = newValue.filter(Char::isDigit).toIntOrNull() ?: 0
                        actions.onUpdateDivisionInstallmentAmount(index, parsed)
                    },
                    modifier = Modifier.weight(1f),
                )
                if (useRelativeDueDates) {
                    StandardTextField(
                        value = dueOffset.toString(),
                        onValueChange = { newValue ->
                            val parsed = newValue.toIntOrNull() ?: 0
                            val targetCount = maxOf(
                                installmentCount,
                                divisionEditor.installmentAmounts.size,
                                divisionEditor.installmentDueRelativeDays.size,
                            )
                            val nextRelativeDueDays = MutableList(targetCount) { dueIndex ->
                                divisionEditor.installmentDueRelativeDays.getOrNull(dueIndex) ?: 0
                            }
                            if (index in nextRelativeDueDays.indices) {
                                nextRelativeDueDays[index] = parsed
                            }
                            actions.onDivisionEditorChange(
                                divisionEditor.copy(
                                    installmentDueDates = emptyList(),
                                    installmentDueRelativeDays = nextRelativeDueDays,
                                    error = null,
                                ),
                            )
                        },
                        label = "Due Offset",
                        placeholder = "0",
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    StandardTextField(
                        value = dueDate,
                        onValueChange = {},
                        label = "Due Date",
                        placeholder = "YYYY-MM-DD",
                        modifier = Modifier.weight(1f),
                        readOnly = true,
                        onTap = { actions.onSetDivisionInstallmentDueDatePickerIndex(index) },
                    )
                }
            }
            if (installmentCount > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(
                        onClick = { actions.onRemoveDivisionInstallmentRow(index) },
                    ) {
                        Text(
                            text = "Remove installment",
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = actions.onAddDivisionInstallmentRow) {
                Text("Add installment")
            }
            val installmentTotal = divisionEditor.installmentAmounts.sum()
            val totalsMatch = installmentTotal == divisionEditor.priceCents
            Text(
                text = "Total ${installmentTotal.toDouble().div(100).moneyFormat()} / ${divisionEditor.priceCents.toDouble().div(100).moneyFormat()}",
                color = if (totalsMatch) {
                    Color(localImageScheme.current.onSurfaceVariant)
                } else {
                    MaterialTheme.colorScheme.error
                },
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

private fun applySingleDivisionDefaultsToDetails(
    details: List<DivisionDetail>,
    defaultPriceCents: Int,
    defaultMaxParticipants: Int,
    defaultPlayoffTeamCount: Int?,
    defaultPoolCount: Int? = null,
): List<DivisionDetail> {
    val normalizedPriceCents = defaultPriceCents.coerceAtLeast(0)
    val normalizedMaxParticipants = defaultMaxParticipants.takeIf { value -> value >= 2 }
    val normalizedPoolCount = defaultPoolCount?.takeIf { value -> value >= 1 }
    return details.map { detail ->
        detail.copy(
            price = normalizedPriceCents,
            maxParticipants = normalizedMaxParticipants,
            playoffTeamCount = defaultPlayoffTeamCount,
            poolCount = normalizedPoolCount ?: detail.poolCount,
            poolTeamCount = if (normalizedPoolCount != null && normalizedMaxParticipants != null) {
                derivePoolTeamCount(
                    maxTeams = normalizedMaxParticipants,
                    poolCount = normalizedPoolCount,
                )
            } else {
                detail.poolTeamCount
            },
        )
    }
}
