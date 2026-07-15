package com.razumly.mvp.eventCreate

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.util.toEnumTitleCase

@Composable
fun EventCreateSetupHeader(
    mode: EventCreateSetupMode,
    pages: List<EventCreateSetupPage>,
    onModeChange: (EventCreateSetupMode) -> Unit,
    onPageSelected: (EventCreateSetupPage) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier.fillMaxWidth(), tonalElevation = 2.dp) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                EventCreateModeChip(
                    label = "Simple Setup",
                    selected = mode == EventCreateSetupMode.SIMPLE,
                    onClick = { onModeChange(EventCreateSetupMode.SIMPLE) },
                )
                Spacer(Modifier.width(8.dp))
                EventCreateModeChip(
                    label = "Advanced",
                    selected = mode == EventCreateSetupMode.ADVANCED,
                    onClick = { onModeChange(EventCreateSetupMode.ADVANCED) },
                )
            }
            if (mode == EventCreateSetupMode.SIMPLE) {
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    pages.forEachIndexed { index, page ->
                        EventCreateProgressChip(
                            step = index + 1,
                            page = page,
                            onClick = { onPageSelected(page) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EventCreateModeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, maxLines = 1) },
    )
}

@Composable
private fun EventCreateProgressChip(
    step: Int,
    page: EventCreateSetupPage,
    onClick: () -> Unit,
) {
    val muted = page.status == EventCreateSetupPageStatus.LOCKED ||
        page.status == EventCreateSetupPageStatus.NOT_USED
    FilterChip(
        modifier = Modifier.width(164.dp),
        selected = page.status == EventCreateSetupPageStatus.CURRENT ||
            page.status == EventCreateSetupPageStatus.COMPLETE,
        onClick = onClick,
        label = {
            Column {
                Text(
                    text = "$step. ${page.id.label}",
                    maxLines = 1,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (muted) {
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.62f)
                    } else {
                        Color.Unspecified
                    },
                )
                Text(
                    text = when (page.status) {
                        EventCreateSetupPageStatus.CURRENT -> "Current"
                        EventCreateSetupPageStatus.COMPLETE -> "Complete"
                        EventCreateSetupPageStatus.AVAILABLE -> "Available"
                        EventCreateSetupPageStatus.LOCKED -> "Complete earlier step"
                        EventCreateSetupPageStatus.NOT_USED -> "Not used"
                    },
                    maxLines = 1,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
}

@Composable
fun EventCreatePlanningPage(
    pageId: EventCreateSetupPageId,
    event: Event,
    choices: EventCreateSetupChoices,
    useManualTimeSlots: Boolean,
    onEventTypeSelected: (EventType) -> Unit,
    onEditEvent: (Event.() -> Event) -> Unit,
    onChoicesChange: (EventCreateSetupChoices) -> Unit,
    onUseManualTimeSlotsChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = pageId.label,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = planningPageDescription(pageId),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        when (pageId) {
            EventCreateSetupPageId.FORMAT -> {
                Text("Event type", style = MaterialTheme.typography.titleMedium)
                mobileCreateEventTypes().forEach { type ->
                    FilterChip(
                        modifier = Modifier.fillMaxWidth(),
                        selected = event.eventType == type,
                        onClick = { onEventTypeSelected(type) },
                        label = { Text(type.name.toEnumTitleCase()) },
                    )
                }
                Text(
                    "Tryouts are created from an organization's web page and do not appear as a mobile creation option.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            EventCreateSetupPageId.PARTICIPATION_PLAN -> {
                val teamChoiceEnabled = event.eventType == EventType.EVENT ||
                    event.eventType == EventType.WEEKLY_EVENT
                SetupChoiceSwitch(
                    title = "Team registration",
                    description = if (teamChoiceEnabled) {
                        "Enable when teams register instead of individual players."
                    } else {
                        "Leagues and tournaments always register teams."
                    },
                    checked = event.teamSignup,
                    enabled = teamChoiceEnabled,
                    onCheckedChange = { enabled -> onEditEvent { copy(teamSignup = enabled) } },
                )
                SetupChoiceSwitch(
                    title = "Shared division configuration",
                    description = "Turn off when divisions need separate capacity, pricing, schedules, or competition settings.",
                    checked = event.singleDivision,
                    onCheckedChange = { shared -> onEditEvent { copy(singleDivision = shared) } },
                )
                if (event.eventType == EventType.LEAGUE) {
                    SetupChoiceSwitch(
                        title = "Include playoffs",
                        description = "Add playoff configuration after league play.",
                        checked = event.includePlayoffs,
                        onCheckedChange = { include -> onEditEvent { copy(includePlayoffs = include) } },
                    )
                }
                if (event.eventType == EventType.TOURNAMENT) {
                    SetupChoiceSwitch(
                        title = "Include pool play",
                        description = "Configure pools before the tournament bracket.",
                        checked = event.includePlayoffs,
                        onCheckedChange = { include -> onEditEvent { copy(includePlayoffs = include) } },
                    )
                }
            }

            EventCreateSetupPageId.SCHEDULE_PLAN -> {
                val supportsSlots = event.eventType == EventType.WEEKLY_EVENT ||
                    event.eventType == EventType.LEAGUE || event.eventType == EventType.TOURNAMENT
                SetupChoiceSwitch(
                    title = "Configure detailed timeslots",
                    description = if (supportsSlots) {
                        "Assign resources, divisions, dates, weekdays, and start/end times."
                    } else {
                        "A standard event uses its start and end time as one event window."
                    },
                    checked = supportsSlots && useManualTimeSlots,
                    enabled = supportsSlots,
                    onCheckedChange = onUseManualTimeSlotsChange,
                )
                SetupChoiceSwitch(
                    title = "No fixed end date",
                    description = "Use for ongoing league or repeating schedules without a known final date.",
                    checked = event.noFixedEndDateTime,
                    enabled = supportsSlots,
                    onCheckedChange = { enabled -> onEditEvent { copy(noFixedEndDateTime = enabled) } },
                )
            }

            EventCreateSetupPageId.COMPETITION_PLAN -> {
                SetupChoiceSwitch(
                    title = "Customize match rules",
                    description = "Review and override sport defaults on Competition Rules.",
                    checked = choices.customizeMatchRules,
                    onCheckedChange = { onChoicesChange(choices.copy(customizeMatchRules = it)) },
                )
                SetupChoiceSwitch(
                    title = "Customize scoring",
                    description = "Configure league or pool scoring on Competition Rules.",
                    checked = choices.customizeScoring,
                    onCheckedChange = { onChoicesChange(choices.copy(customizeScoring = it)) },
                )
            }

            EventCreateSetupPageId.REGISTRATION_PLAN -> {
                SetupChoiceSwitch(
                    title = "Paid registration",
                    description = "Set one event price or division-specific prices on Pricing & Registration.",
                    checked = choices.paidRegistration,
                    onCheckedChange = { enabled ->
                        onChoicesChange(choices.copy(paidRegistration = enabled))
                        if (!enabled) onEditEvent { copy(priceCents = 0) }
                    },
                )
                SetupChoiceSwitch(
                    title = "Required documents",
                    description = "Select organization document templates on Documents & Questions.",
                    checked = choices.useRequiredDocuments,
                    onCheckedChange = { onChoicesChange(choices.copy(useRequiredDocuments = it)) },
                )
                SetupChoiceSwitch(
                    title = "Registration questions",
                    description = "Question authoring remains available on web; mobile keeps the page visible in this setup path.",
                    checked = choices.useRegistrationQuestions,
                    onCheckedChange = { onChoicesChange(choices.copy(useRegistrationQuestions = it)) },
                )
            }

            EventCreateSetupPageId.OPERATIONS_PLAN -> {
                SetupChoiceSwitch(
                    title = "Assign event staff",
                    description = "Choose hosts and assistants on Staff & Operations.",
                    checked = choices.useStaffAssignments,
                    onCheckedChange = { onChoicesChange(choices.copy(useStaffAssignments = it)) },
                )
                SetupChoiceSwitch(
                    title = "Use dedicated officials",
                    description = "Configure official positions and assignments on Staff & Operations.",
                    checked = choices.useDedicatedOfficials,
                    onCheckedChange = { onChoicesChange(choices.copy(useDedicatedOfficials = it)) },
                )
            }

            else -> Unit
        }
        Spacer(Modifier.height(96.dp))
    }
}

@Composable
fun EventCreateUnavailablePage(
    page: EventCreateSetupPage,
    onOpenController: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(page.id.label, style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Text(
            page.unavailableReason ?: "This page is not used by the selected event path.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        page.controlledByPageId?.let { controller ->
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Change this on ${controller.label}",
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable(onClick = onOpenController).padding(8.dp),
            )
        }
    }
}

@Composable
private fun SetupChoiceSwitch(
    title: String,
    description: String,
    checked: Boolean,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = RoundedCornerShape(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable(enabled = enabled) {
                onCheckedChange(!checked)
            }.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = checked,
                enabled = enabled,
                onCheckedChange = onCheckedChange,
            )
        }
    }
}

private fun planningPageDescription(pageId: EventCreateSetupPageId): String = when (pageId) {
    EventCreateSetupPageId.FORMAT -> "Choose the event format before entering dependent details."
    EventCreateSetupPageId.PARTICIPATION_PLAN -> "Decide who registers and whether divisions share configuration."
    EventCreateSetupPageId.SCHEDULE_PLAN -> "Choose schedule behavior before entering dates, resources, and timeslots."
    EventCreateSetupPageId.COMPETITION_PLAN -> "Choose whether sport defaults need competition overrides."
    EventCreateSetupPageId.REGISTRATION_PLAN -> "Choose payment and registration requirements before entering details."
    EventCreateSetupPageId.OPERATIONS_PLAN -> "Choose which staff and official tools this event will use."
    else -> "Complete this setup step."
}
