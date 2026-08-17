package com.razumly.mvp.eventDetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.DivisionCompetitionPhase
import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow

@Composable
internal fun DivisionPhaseRulesFields(
    title: String,
    phase: DivisionCompetitionPhase,
    event: Event,
    sport: Sport?,
    usesSets: Boolean,
    phaseSettings: Map<String, DivisionPhaseSettingsMVP>,
    onPhaseSettingsChange: (Map<String, DivisionPhaseSettingsMVP>) -> Unit,
    onCalculatedDurationChange: (Int?) -> Unit,
) {
    var rulesOpen by remember(phase) { mutableStateOf(false) }
    val hasPhaseSettings = phaseSettings.containsKey(phase.name)
    val settings = phaseSettings.forPhase(phase)
    val resolved = resolveDivisionPhaseMatchRules(event, sport, settings, usesSets)
    val segmentLength = if (hasPhaseSettings) {
        settings?.segmentLengthMinutes
    } else {
        resolved.timekeeping.segmentDurationMinutes
    }
    val segmentBreak = if (hasPhaseSettings) {
        settings?.segmentBreakMinutes
    } else {
        resolved.timekeeping.segmentBreakDurationMinutes
    }

    fun updateSettings(next: DivisionPhaseSettingsMVP?) {
        val normalizedNext = if (next != null && settings == null && !usesSets) {
            next.copy(
                segmentLengthMinutes = next.segmentLengthMinutes ?: segmentLength,
                segmentBreakMinutes = next.segmentBreakMinutes ?: segmentBreak,
            )
        } else {
            next
        }
        onPhaseSettingsChange(phaseSettings.withPhase(phase, normalizedNext))
        val nextResolved = resolveDivisionPhaseMatchRules(event, sport, normalizedNext, usesSets)
        onCalculatedDurationChange(
            if (usesSets) null else calculateDivisionPhaseDurationMinutes(
                segmentCount = nextResolved.segmentCount,
                segmentLengthMinutes = normalizedNext?.segmentLengthMinutes
                    ?: nextResolved.timekeeping.segmentDurationMinutes,
                segmentBreakMinutes = normalizedNext?.segmentBreakMinutes
                    ?: nextResolved.timekeeping.segmentBreakDurationMinutes,
            ),
        )
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(
                text = if (hasPhaseSettings) "Uses custom rules for this phase." else "Uses the event and sport defaults.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TextButton(onClick = { rulesOpen = true }) {
            Text("$title Rules")
        }
    }

    if (!usesSets) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            NumberInputField(
                modifier = Modifier.weight(1f),
                value = segmentLength?.toString().orEmpty(),
                label = "${resolved.segmentLabel} length (min) *",
                onValueChange = { value ->
                    if (value.isNotEmpty() && !value.all(Char::isDigit)) return@NumberInputField
                    updateSettings(
                        (settings ?: DivisionPhaseSettingsMVP()).copy(
                            segmentLengthMinutes = value.toIntOrNull(),
                        ),
                    )
                },
                isError = segmentLength == null || segmentLength < 1,
                errorMessage = "Enter at least 1 minute.",
            )
            NumberInputField(
                modifier = Modifier.weight(1f),
                value = segmentBreak?.toString().orEmpty(),
                label = "Break between ${segmentPlural(resolved.segmentLabel)} (min)",
                onValueChange = { value ->
                    if (value.isNotEmpty() && !value.all(Char::isDigit)) return@NumberInputField
                    updateSettings(
                        (settings ?: DivisionPhaseSettingsMVP()).copy(
                            segmentBreakMinutes = value.toIntOrNull(),
                        ),
                    )
                },
                isError = segmentBreak != null && segmentBreak < 0,
                errorMessage = "Enter 0 minutes or more.",
            )
        }
        val duration = calculateDivisionPhaseDurationMinutes(
            segmentCount = resolved.segmentCount,
            segmentLengthMinutes = segmentLength,
            segmentBreakMinutes = segmentBreak,
        )
        Text(
            text = "Calculated match duration: ${duration?.let { "$it minutes" } ?: "Enter a valid ${resolved.segmentLabel.lowercase()} length"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (rulesOpen) {
        DivisionPhaseRulesDialog(
            title = "$title Rules",
            event = event,
            sport = sport,
            usesSets = usesSets,
            settings = settings,
            onSettingsChange = ::updateSettings,
            onDismiss = { rulesOpen = false },
        )
    }
}

@Composable
private fun DivisionPhaseRulesDialog(
    title: String,
    event: Event,
    sport: Sport?,
    usesSets: Boolean,
    settings: DivisionPhaseSettingsMVP?,
    onSettingsChange: (DivisionPhaseSettingsMVP?) -> Unit,
    onDismiss: () -> Unit,
) {
    val resolved = resolveDivisionPhaseMatchRules(event, sport, settings, usesSets)
    val override = settings?.matchRulesOverride
    val incidentOptions = resolved.incidentTypeDefinitions.map { definition ->
        DropdownOption(definition.code, definition.label)
    }.ifEmpty {
        resolved.supportedIncidentTypes.map { code ->
            DropdownOption(code, code.lowercase().replaceFirstChar { char -> char.uppercaseChar() })
        }
    }

    fun updateOverride(next: MatchRulesConfigMVP) {
        onSettingsChange((settings ?: DivisionPhaseSettingsMVP()).copy(matchRulesOverride = next))
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "These rules apply only to this division phase. They override the event default.",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (!usesSets) {
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(),
                        value = resolved.segmentCount.toString(),
                        label = "${resolved.segmentLabel} count *",
                        onValueChange = { value ->
                            if (value.isNotEmpty() && !value.all(Char::isDigit)) return@NumberInputField
                            updateOverride((override ?: MatchRulesConfigMVP()).copy(segmentCount = value.toIntOrNull()))
                        },
                        isError = resolved.segmentCount < 1,
                        errorMessage = "Enter at least 1.",
                    )
                }
                if (resolved.canUseOvertime) {
                    LabeledCheckboxRow(
                        checked = resolved.supportsOvertime,
                        label = "Allow overtime",
                        onCheckedChange = { checked ->
                            updateOverride((override ?: MatchRulesConfigMVP()).copy(supportsOvertime = checked))
                        },
                    )
                }
                if (resolved.canUseShootout) {
                    LabeledCheckboxRow(
                        checked = resolved.supportsShootout,
                        label = "Allow shootout / tiebreak",
                        onCheckedChange = { checked ->
                            updateOverride((override ?: MatchRulesConfigMVP()).copy(supportsShootout = checked))
                        },
                    )
                }
                PlatformDropdown(
                    selectedValue = "",
                    onSelectionChange = {},
                    options = incidentOptions,
                    label = "Incident types available in matches",
                    modifier = Modifier.fillMaxWidth(),
                    multiSelect = true,
                    selectedValues = resolved.supportedIncidentTypes,
                    onMultiSelectionChange = { values ->
                        updateOverride((override ?: MatchRulesConfigMVP()).copy(supportedIncidentTypes = values))
                    },
                )
                LabeledCheckboxRow(
                    checked = settings?.autoCreatePointMatchIncidents
                        ?: event.autoCreatePointMatchIncidents,
                    label = "Create a scoring incident for each point / goal",
                    onCheckedChange = { checked ->
                        onSettingsChange(
                            (settings ?: DivisionPhaseSettingsMVP()).copy(
                                autoCreatePointMatchIncidents = checked,
                            ),
                        )
                    },
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
        dismissButton = {
            TextButton(onClick = { onSettingsChange(null) }) { Text("Use defaults") }
        },
    )
}

private fun segmentPlural(label: String): String = when (label.trim().lowercase()) {
    "half" -> "halves"
    "inning" -> "innings"
    "period" -> "periods"
    "quarter" -> "quarters"
    else -> "${label.trim().lowercase()}s"
}
