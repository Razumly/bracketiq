package com.razumly.mvp.eventDetail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.util.toEnumTitleCase
import com.razumly.mvp.eventCreate.mobileCreateEventTypes

internal data class SimpleEventDetailsOptionsState(
    val editEvent: Event,
    val paidRegistrationEnabled: Boolean,
    val hostHasAccount: Boolean,
)

internal data class SimpleEventDetailsOptionsActions(
    val onEventTypeSelected: (EventType) -> Unit,
    val onTeamRegistrationChange: (Boolean) -> Unit,
    val onMultipleDivisionsChange: (Boolean) -> Unit,
    val onNoFixedEndDateChange: (Boolean) -> Unit,
    val onPlayoffsOrPoolPlayChange: (Boolean) -> Unit,
    val onDoubleEliminationChange: (Boolean) -> Unit,
    val onPaidRegistrationChange: (Boolean) -> Unit,
    val onManualPaymentsChange: (Boolean) -> Unit,
    val onAutomaticRefundsChange: (Boolean) -> Unit,
    val onPaymentPlansChange: (Boolean) -> Unit,
    val onTeamsOfficiateChange: (Boolean) -> Unit,
    val onTeamOfficialsMaySwapChange: (Boolean) -> Unit,
    val onAllowRosterEditsChange: (Boolean) -> Unit,
    val onAllowTemporaryPlayersChange: (Boolean) -> Unit,
)

internal fun LazyListScope.simpleEventDetailsOptionsSection(
    state: SimpleEventDetailsOptionsState,
    actions: SimpleEventDetailsOptionsActions,
) {
    item(key = "simple-event-options") {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Choose an event type",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            EventTypeGrid(
                selectedType = state.editEvent.eventType,
                onSelected = actions.onEventTypeSelected,
            )

            OptionsCategory(title = "Participation") {
                val teamEventCanChange = state.editEvent.eventType == EventType.EVENT ||
                    state.editEvent.eventType == EventType.WEEKLY_EVENT
                OptionCheckboxRow(
                    checked = state.editEvent.teamSignup,
                    label = "Team event",
                    description = if (teamEventCanChange) {
                        "Register teams instead of individual participants."
                    } else {
                        "Leagues and tournaments require team registration."
                    },
                    enabled = teamEventCanChange,
                    onCheckedChange = actions.onTeamRegistrationChange,
                )
                OptionCheckboxRow(
                    checked = !state.editEvent.singleDivision,
                    label = "Multiple divisions",
                    description = "Set capacity, price, and competition rules per division.",
                    onCheckedChange = actions.onMultipleDivisionsChange,
                )
            }

            OptionsCategory(title = "Schedule & competition") {
                val canGenerateEndDate = state.editEvent.eventType == EventType.LEAGUE ||
                    state.editEvent.eventType == EventType.TOURNAMENT ||
                    state.editEvent.eventType == EventType.WEEKLY_EVENT
                if (canGenerateEndDate) {
                    OptionCheckboxRow(
                        checked = state.editEvent.noFixedEndDateTime,
                        label = "Set end date during match generation",
                        description = "The generated match schedule will determine the event end date.",
                        onCheckedChange = actions.onNoFixedEndDateChange,
                    )
                }
                if (state.editEvent.eventType == EventType.LEAGUE ||
                    state.editEvent.eventType == EventType.TOURNAMENT
                ) {
                    OptionCheckboxRow(
                        checked = state.editEvent.includePlayoffs,
                        label = if (state.editEvent.eventType == EventType.TOURNAMENT) {
                            "Pool play before bracket"
                        } else {
                            "Include playoffs"
                        },
                        description = if (state.editEvent.eventType == EventType.TOURNAMENT) {
                            "Schedule pools, then advance teams into the bracket."
                        } else {
                            "Advance an explicit number of teams into playoffs."
                        },
                        onCheckedChange = actions.onPlayoffsOrPoolPlayChange,
                    )
                }
                if (state.editEvent.eventType == EventType.TOURNAMENT) {
                    OptionCheckboxRow(
                        checked = state.editEvent.doubleElimination,
                        label = "Winner and loser brackets",
                        description = "Give teams a second path through a loser bracket.",
                        onCheckedChange = actions.onDoubleEliminationChange,
                    )
                }
            }

            OptionsCategory(title = "Registration & payments") {
                OptionCheckboxRow(
                    checked = state.paidRegistrationEnabled,
                    label = "Paid registration",
                    description = "Show price inputs for the event or each division.",
                    onCheckedChange = actions.onPaidRegistrationChange,
                )
                val manualPaymentsEnabled = state.editEvent.registrationPaymentMode == "MANUAL"
                OptionCheckboxRow(
                    checked = manualPaymentsEnabled,
                    label = "Collect payments manually",
                    description = "Provide Venmo, PayPal, cash, or other host payment instructions.",
                    enabled = state.paidRegistrationEnabled,
                    onCheckedChange = actions.onManualPaymentsChange,
                )
                OptionCheckboxRow(
                    checked = state.editEvent.cancellationRefundHours != null,
                    label = "Automatic refunds",
                    description = if (manualPaymentsEnabled) {
                        "Manual payments must be refunded directly by the host."
                    } else {
                        "Refund eligible online payments automatically."
                    },
                    enabled = state.paidRegistrationEnabled && !manualPaymentsEnabled,
                    onCheckedChange = actions.onAutomaticRefundsChange,
                )
                OptionCheckboxRow(
                    checked = state.editEvent.allowPaymentPlans == true,
                    label = "Payment plans",
                    description = if (!state.hostHasAccount) {
                        "Finish payment account setup before enabling installments."
                    } else {
                        "Split online registration into scheduled installments."
                    },
                    enabled = state.paidRegistrationEnabled && !manualPaymentsEnabled && state.hostHasAccount,
                    onCheckedChange = actions.onPaymentPlansChange,
                )
            }

            if (state.editEvent.teamSignup) {
                OptionsCategory(title = "Team operations") {
                    val teamsOfficiate = state.editEvent.doTeamsOfficiate == true
                    OptionCheckboxRow(
                        checked = teamsOfficiate,
                        label = "Teams provide officials",
                        description = "Assign teams to cover officiating responsibilities.",
                        onCheckedChange = actions.onTeamsOfficiateChange,
                    )
                    OptionCheckboxRow(
                        checked = state.editEvent.teamOfficialsMaySwap == true,
                        label = "Allow officiating swaps",
                        description = "Teams may exchange assigned officiating duties.",
                        enabled = teamsOfficiate,
                        onCheckedChange = actions.onTeamOfficialsMaySwapChange,
                    )
                    OptionCheckboxRow(
                        checked = state.editEvent.allowMatchRosterEdits,
                        label = "Allow match roster edits",
                        description = "Teams can choose a match-specific roster.",
                        onCheckedChange = actions.onAllowRosterEditsChange,
                    )
                    OptionCheckboxRow(
                        checked = state.editEvent.allowTemporaryMatchPlayers,
                        label = "Allow temporary players",
                        description = "Temporary players can be added to a match roster.",
                        enabled = state.editEvent.allowMatchRosterEdits,
                        onCheckedChange = actions.onAllowTemporaryPlayersChange,
                    )
                }
            }
        }
    }
}

@Composable
private fun EventTypeGrid(
    selectedType: EventType,
    onSelected: (EventType) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        mobileCreateEventTypes().chunked(2).forEach { eventTypes ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                eventTypes.forEach { eventType ->
                    val selected = eventType == selectedType
                    Surface(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clickable { onSelected(eventType) },
                        shape = RoundedCornerShape(14.dp),
                        color = if (selected) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                        border = BorderStroke(
                            width = if (selected) 2.dp else 1.dp,
                            color = if (selected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.outlineVariant
                            },
                        ),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = eventType.name.toEnumTitleCase(),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(12.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OptionsCategory(
    title: String,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
            )
            content()
        }
    }
}

@Composable
private fun OptionCheckboxRow(
    checked: Boolean,
    label: String,
    description: String,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else 0.55f)
            .clickable(enabled = enabled) { onCheckedChange(!checked) }
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Checkbox(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(top = 5.dp, end = 4.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(text = label, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
