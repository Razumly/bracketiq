@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventCreate

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameterOption
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.skillsForSport
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.InclusivePriceInput
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.toEnumTitleCase
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Duration.Companion.hours
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

data class EventCreateSimpleSetupUiState(
    val page: EventCreateSetupPage,
    val event: Event,
    val choices: EventCreateSetupChoices,
    val sports: List<Sport>,
    val divisionTypeParameters: DivisionTypeParameters,
    val organizationTemplates: List<OrganizationTemplateDocument>,
    val organizationTemplatesLoading: Boolean,
    val organizationTemplatesError: String?,
    val localFieldCount: Int,
    val leagueScoringConfig: LeagueScoringConfigDTO,
    val suggestedUsers: List<UserData>,
    val useManualTimeSlots: Boolean,
    val priceQuoteConfirmed: Boolean,
)

data class EventCreateSimpleSetupUiActions(
    val onEventTypeSelected: (EventType) -> Unit,
    val onEditEvent: (Event.() -> Event) -> Unit,
    val onSportSelected: (String) -> Unit,
    val onChoicesChange: (EventCreateSetupChoices) -> Unit,
    val onUseManualTimeSlotsChange: (Boolean) -> Unit,
    val onOpenLocationMap: () -> Unit,
    val onSelectFieldCount: (Int) -> Unit,
    val onLeagueScoringConfigChange: (LeagueScoringConfigDTO) -> Unit,
    val onSearchUsers: (String) -> Unit,
    val onUpdateAssistantHostIds: (List<String>) -> Unit,
    val onUpdateOfficialIds: (List<String>) -> Unit,
    val onUpdateOfficialSchedulingMode: (OfficialSchedulingMode) -> Unit,
    val onUpdateDoTeamsOfficiate: (Boolean) -> Unit,
    val onUpdateAllowMatchRosterEdits: (Boolean) -> Unit,
    val onPriceQuoteConfirmationChange: (Boolean) -> Unit,
    val quoteInclusivePrice: suspend (
        InclusivePriceQuoteDirection,
        Int,
        String?,
    ) -> Result<InclusivePriceQuote>,
    val onOpenAdvanced: () -> Unit,
)

@Composable
fun EventCreateSetupHeader(
    mode: EventCreateSetupMode,
    currentPageLabel: String,
    currentStep: Int,
    totalSteps: Int,
    onModeChange: (EventCreateSetupMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (mode == EventCreateSetupMode.SIMPLE) currentPageLabel else "Advanced setup",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                TextButton(
                    onClick = {
                        onModeChange(
                            if (mode == EventCreateSetupMode.SIMPLE) {
                                EventCreateSetupMode.ADVANCED
                            } else {
                                EventCreateSetupMode.SIMPLE
                            },
                        )
                    },
                ) {
                    Text(if (mode == EventCreateSetupMode.SIMPLE) "Advanced" else "Simple")
                }
            }
            if (mode == EventCreateSetupMode.SIMPLE) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Create event",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = "Step $currentStep of $totalSteps",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                LinearProgressIndicator(
                    progress = { currentStep.toFloat() / totalSteps.coerceAtLeast(1).toFloat() },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
fun EventCreateActionBar(
    backEnabled: Boolean,
    primaryLabel: String,
    onBack: () -> Unit,
    onPrimary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = onBack,
                enabled = backEnabled,
                modifier = Modifier.weight(1f).height(48.dp),
            ) {
                Text("Back")
            }
            Button(
                onClick = onPrimary,
                modifier = Modifier.weight(1f).height(48.dp),
            ) {
                Text(primaryLabel)
            }
        }
    }
}

@Composable
fun EventCreateSimpleSetupPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
    modifier: Modifier = Modifier,
) {
    if (!state.page.used) {
        EventCreateUnavailablePage(
            page = state.page,
            onOpenController = actions.onOpenAdvanced,
            modifier = modifier,
        )
        return
    }

    SimpleSetupPageFrame(
        description = simpleSetupPageDescription(state.page.id),
        modifier = modifier,
    ) {
        when (state.page.id) {
            EventCreateSetupPageId.FORMAT -> SimpleFormatPage(state.event, actions)
            EventCreateSetupPageId.BASICS -> SimpleBasicsPage(state, actions)
            EventCreateSetupPageId.PARTICIPATION_PLAN -> SimpleParticipationPage(state, actions)
            EventCreateSetupPageId.DIVISIONS -> SimpleDivisionsPage(state, actions)
            EventCreateSetupPageId.SCHEDULE_PLAN -> SimpleSchedulePlanPage(state, actions)
            EventCreateSetupPageId.SCHEDULE_LOCATION -> SimpleScheduleLocationPage(state, actions)
            EventCreateSetupPageId.COMPETITION_PLAN -> SimpleCompetitionPlanPage(state, actions)
            EventCreateSetupPageId.COMPETITION_RULES -> SimpleCompetitionRulesPage(state, actions)
            EventCreateSetupPageId.REGISTRATION_PLAN -> SimpleRegistrationPlanPage(state, actions)
            EventCreateSetupPageId.PRICING_REGISTRATION -> SimplePricingPage(state, actions)
            EventCreateSetupPageId.DOCUMENTS_QUESTIONS -> SimpleDocumentsPage(state, actions)
            EventCreateSetupPageId.OPERATIONS_PLAN -> SimpleOperationsPlanPage(state, actions)
            EventCreateSetupPageId.STAFF_OPERATIONS -> SimpleStaffOperationsPage(state, actions)
            EventCreateSetupPageId.REVIEW_PUBLISH -> SimpleReviewPage(state)
        }
    }
}

@Composable
private fun SimpleSetupPageFrame(
    description: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
                content()
            }
        }
    }
}

@Composable
private fun SimpleFormatPage(event: Event, actions: EventCreateSimpleSetupUiActions) {
    val types = mobileCreateEventTypes()
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        types.chunked(2).forEach { rowTypes ->
            Row(
                modifier = Modifier.fillMaxWidth().weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                rowTypes.forEach { type ->
                    SetupFormatCard(
                        type = type,
                        selected = event.eventType == type,
                        onClick = { actions.onEventTypeSelected(type) },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
                if (rowTypes.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SetupFormatCard(
    type: EventType,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .semantics { this.selected = selected }
            .clickable(role = Role.RadioButton, onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(
            width = if (selected) 2.dp else 1.dp,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerLow
            },
        ),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(12.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = type.name.toEnumTitleCase(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = formatDescription(type),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun SimpleBasicsPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StandardTextField(
            value = state.event.name,
            onValueChange = { name -> actions.onEditEvent { copy(name = name) } },
            label = "Event name",
            placeholder = "Summer tournament",
            modifier = Modifier.fillMaxWidth(),
        )
        PlatformDropdown(
            selectedValue = state.event.sportId.orEmpty(),
            onSelectionChange = actions.onSportSelected,
            options = state.sports.map { sport -> DropdownOption(sport.id, sport.name) },
            label = "Sport",
            placeholder = if (state.sports.isEmpty()) "No sports available" else "Select a sport",
            enabled = state.sports.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        )
        StandardTextField(
            value = state.event.description,
            onValueChange = { description -> actions.onEditEvent { copy(description = description) } },
            label = "Short description",
            placeholder = "What should players know?",
            imeAction = ImeAction.Done,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SimpleParticipationPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    val canChooseTeamSignup = state.event.eventType == EventType.EVENT ||
        state.event.eventType == EventType.WEEKLY_EVENT
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SetupChoiceSwitch(
            title = "Teams register",
            description = if (canChooseTeamSignup) "Turn off for individual registration." else "Required for this format.",
            checked = state.event.teamSignup,
            enabled = canChooseTeamSignup,
            onCheckedChange = { enabled -> actions.onEditEvent { copy(teamSignup = enabled) } },
        )
        SetupChoiceSwitch(
            title = "Shared division settings",
            description = "Use one capacity, price, and schedule configuration.",
            checked = state.event.singleDivision,
            onCheckedChange = { shared -> actions.onEditEvent { copy(singleDivision = shared) } },
        )
        if (state.event.eventType == EventType.LEAGUE || state.event.eventType == EventType.TOURNAMENT) {
            SetupChoiceSwitch(
                title = if (state.event.eventType == EventType.LEAGUE) "Include playoffs" else "Include pool play",
                description = "Add a final competition stage after regular play.",
                checked = state.event.includePlayoffs,
                onCheckedChange = { include ->
                    actions.onEditEvent {
                        copy(
                            includePlayoffs = include,
                            playoffTeamCount = if (include) playoffTeamCount else null,
                        )
                    }
                },
            )
        }
    }
}

@Composable
private fun SimpleDivisionsPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    val existing = state.event.divisionDetails.lastOrNull()
    val genderOptions = state.divisionTypeParameters.genders.ifEmpty {
        listOf(
            DivisionTypeParameterOption("C", "Coed"),
            DivisionTypeParameterOption("F", "Women's"),
            DivisionTypeParameterOption("M", "Men's"),
        )
    }
    val skillOptions = state.divisionTypeParameters.skillsForSport(state.event.sportId).ifEmpty {
        listOf(DivisionTypeParameterOption("OPEN", "Open"))
    }
    val ageOptions = state.divisionTypeParameters.ages.ifEmpty {
        listOf(DivisionTypeParameterOption("OPEN", "Open"))
    }
    var gender by rememberSaveable(state.event.id) {
        mutableStateOf(existing?.gender.orEmpty().ifBlank { genderOptions.first().id })
    }
    var skillId by rememberSaveable(state.event.id, state.event.sportId) {
        mutableStateOf(existing?.skillDivisionTypeId.orEmpty().ifBlank { skillOptions.first().id })
    }
    var ageId by rememberSaveable(state.event.id) {
        mutableStateOf(existing?.ageDivisionTypeId.orEmpty().ifBlank { ageOptions.first().id })
    }
    LaunchedEffect(genderOptions, skillOptions, ageOptions) {
        if (genderOptions.none { it.id == gender }) gender = genderOptions.first().id
        if (skillOptions.none { it.id == skillId }) skillId = skillOptions.first().id
        if (ageOptions.none { it.id == ageId }) ageId = ageOptions.first().id
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PlatformDropdown(
                selectedValue = gender,
                onSelectionChange = { gender = it },
                options = genderOptions.map { option -> DropdownOption(option.id, option.name) },
                label = "Division",
                modifier = Modifier.weight(1f),
            )
            PlatformDropdown(
                selectedValue = ageId,
                onSelectionChange = { ageId = it },
                options = ageOptions.map { option -> DropdownOption(option.id, option.name) },
                label = "Age",
                modifier = Modifier.weight(1f),
            )
        }
        PlatformDropdown(
            selectedValue = skillId,
            onSelectionChange = { skillId = it },
            options = skillOptions.map { option -> DropdownOption(option.id, option.name) },
            label = "Skill level",
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                val skill = skillOptions.first { option -> option.id == skillId }
                val age = ageOptions.first { option -> option.id == ageId }
                actions.onEditEvent {
                    upsertSimpleSetupDivision(
                        SimpleSetupDivisionSelection(
                            gender = gender,
                            skillDivisionTypeId = skill.id,
                            skillDivisionTypeName = skill.name,
                            ageDivisionTypeId = age.id,
                            ageDivisionTypeName = age.name,
                        ),
                    )
                }
            },
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) {
            Text(if (state.event.divisions.isEmpty()) "Add division" else "Add another division")
        }
        SimpleInfoCard(
            title = "${state.event.divisions.size} configured",
            body = state.event.divisionDetails.takeLast(2).joinToString(" • ") { detail -> detail.name }
                .ifBlank { "Add the first division to continue." },
        )
    }
}

@Composable
private fun SimpleSchedulePlanPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    val supportsSchedule = state.event.eventType != EventType.EVENT
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SetupChoiceSwitch(
            title = "Detailed timeslots",
            description = if (supportsSchedule) "Use a custom resource and timeslot plan." else "Standard events use one start and end window.",
            checked = supportsSchedule && state.useManualTimeSlots,
            enabled = supportsSchedule,
            onCheckedChange = actions.onUseManualTimeSlotsChange,
        )
        SetupChoiceSwitch(
            title = "No fixed end date",
            description = "Use for ongoing or repeating competition.",
            checked = state.event.noFixedEndDateTime,
            enabled = supportsSchedule,
            onCheckedChange = { enabled -> actions.onEditEvent { copy(noFixedEndDateTime = enabled) } },
        )
        if (state.useManualTimeSlots && supportsSchedule) {
            SimpleInfoCard(
                title = "One starter timeslot is created",
                body = "Open Advanced Setup only if you need additional timeslots or per-field assignments.",
                actionLabel = "Open Advanced",
                onAction = actions.onOpenAdvanced,
            )
        }
    }
}

@Composable
private fun SimpleScheduleLocationPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    var showStartPicker by rememberSaveable { mutableStateOf(false) }
    var showEndPicker by rememberSaveable { mutableStateOf(false) }
    val timeZone = remember(state.event.timeZone) {
        runCatching { TimeZone.of(state.event.timeZone) }.getOrDefault(TimeZone.currentSystemDefault())
    }
    val supportsFields = state.event.eventType == EventType.LEAGUE ||
        state.event.eventType == EventType.TOURNAMENT

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(
            onClick = actions.onOpenLocationMap,
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) {
            Text(
                text = state.event.location.ifBlank { "Choose location on map" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StandardTextField(
                value = simpleSetupDateLabel(state.event.start, timeZone),
                onValueChange = {},
                label = "Starts",
                readOnly = true,
                onTap = { showStartPicker = true },
                modifier = Modifier.weight(1f),
            )
            StandardTextField(
                value = if (state.event.noFixedEndDateTime) "Ongoing" else simpleSetupDateLabel(state.event.end, timeZone),
                onValueChange = {},
                label = "Ends",
                readOnly = true,
                enabled = !state.event.noFixedEndDateTime,
                onTap = { showEndPicker = true },
                modifier = Modifier.weight(1f),
            )
        }
        if (supportsFields) {
            PlatformDropdown(
                selectedValue = state.localFieldCount.coerceAtLeast(1).toString(),
                onSelectionChange = { value -> actions.onSelectFieldCount(value.toIntOrNull() ?: 1) },
                options = (1..12).map { count -> DropdownOption(count.toString(), count.toString()) },
                label = "Courts or fields",
                modifier = Modifier.fillMaxWidth(),
            )
        }
        state.event.address?.takeIf(String::isNotBlank)?.let { address ->
            Text(
                text = address,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }

    PlatformDateTimePicker(
        onDateSelected = { selected ->
            selected?.let { start ->
                actions.onEditEvent {
                    copy(
                        start = start,
                        end = end.takeIf { existingEnd -> existingEnd > start } ?: start + 2.hours,
                    )
                }
            }
        },
        onDismissRequest = { showStartPicker = false },
        showPicker = showStartPicker,
        getTime = true,
        canSelectPast = false,
        initialDate = state.event.start.takeUnless { it == Instant.DISTANT_PAST },
    )
    PlatformDateTimePicker(
        onDateSelected = { selected -> selected?.let { end -> actions.onEditEvent { copy(end = end) } } },
        onDismissRequest = { showEndPicker = false },
        showPicker = showEndPicker,
        getTime = true,
        canSelectPast = false,
        initialDate = state.event.end.takeUnless { it == Instant.DISTANT_PAST },
    )
}

@Composable
private fun SimpleCompetitionPlanPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SetupChoiceSwitch(
            title = "Customize match format",
            description = "Override the sport's default sets, duration, or target score.",
            checked = state.choices.customizeMatchRules,
            onCheckedChange = { actions.onChoicesChange(state.choices.copy(customizeMatchRules = it)) },
        )
        SetupChoiceSwitch(
            title = "Customize standings points",
            description = "Set points for wins, draws, and losses.",
            checked = state.choices.customizeScoring,
            onCheckedChange = { actions.onChoicesChange(state.choices.copy(customizeScoring = it)) },
        )
        if (!state.choices.customizeMatchRules && !state.choices.customizeScoring) {
            SimpleInfoCard(
                title = "Sport defaults will be used",
                body = "You can change advanced competition rules later without rebuilding the event.",
            )
        }
    }
}

@Composable
private fun SimpleCompetitionRulesPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    val event = state.event
    val formatValue = if (event.usesSets) (event.setsPerMatch ?: 1).toString() else "timed"
    val targetScore = event.pointsToVictory.firstOrNull() ?: 21
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (state.choices.customizeMatchRules) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PlatformDropdown(
                    selectedValue = formatValue,
                    onSelectionChange = { selected ->
                        actions.onEditEvent {
                            if (selected == "timed") {
                                copy(usesSets = false, setsPerMatch = null, pointsToVictory = emptyList())
                            } else {
                                val sets = selected.toInt()
                                copy(
                                    usesSets = true,
                                    setsPerMatch = sets,
                                    pointsToVictory = List(sets) { targetScore },
                                )
                            }
                        }
                    },
                    options = listOf(
                        DropdownOption("timed", "Timed match"),
                        DropdownOption("1", "Best of 1"),
                        DropdownOption("3", "Best of 3"),
                        DropdownOption("5", "Best of 5"),
                    ),
                    label = "Match format",
                    modifier = Modifier.weight(1f),
                )
                PlatformDropdown(
                    selectedValue = targetScore.toString(),
                    onSelectionChange = { value ->
                        val score = value.toIntOrNull() ?: 21
                        actions.onEditEvent {
                            copy(pointsToVictory = List((setsPerMatch ?: 1).coerceAtLeast(1)) { score })
                        }
                    },
                    options = listOf(11, 15, 21, 25).map { score ->
                        DropdownOption(score.toString(), score.toString())
                    },
                    label = "Target score",
                    enabled = event.usesSets,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (event.includePlayoffs) {
            StandardTextField(
                value = event.playoffTeamCount?.toString().orEmpty(),
                onValueChange = { value ->
                    val filtered = value.filter(Char::isDigit)
                    actions.onEditEvent { copy(playoffTeamCount = filtered.toIntOrNull()) }
                },
                label = "Playoff teams",
                keyboardType = "number",
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (state.choices.customizeScoring) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SimpleScoringField("Win", state.leagueScoringConfig.pointsForWin) { value ->
                    actions.onLeagueScoringConfigChange(state.leagueScoringConfig.copy(pointsForWin = value))
                }
                SimpleScoringField("Draw", state.leagueScoringConfig.pointsForDraw) { value ->
                    actions.onLeagueScoringConfigChange(state.leagueScoringConfig.copy(pointsForDraw = value))
                }
                SimpleScoringField("Loss", state.leagueScoringConfig.pointsForLoss) { value ->
                    actions.onLeagueScoringConfigChange(state.leagueScoringConfig.copy(pointsForLoss = value))
                }
            }
        }
        if (!state.choices.customizeMatchRules && !state.choices.customizeScoring && !event.includePlayoffs) {
            SimpleInfoCard("Defaults ready", "No custom competition controls are needed for this event.")
        }
    }
}

@Composable
private fun RowScope.SimpleScoringField(
    label: String,
    value: Int?,
    onChange: (Int?) -> Unit,
) {
    StandardTextField(
        value = value?.toString().orEmpty(),
        onValueChange = { input -> onChange(input.filter(Char::isDigit).toIntOrNull()) },
        label = label,
        keyboardType = "number",
        modifier = Modifier.weight(1f),
    )
}

@Composable
private fun SimpleRegistrationPlanPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SetupChoiceSwitch(
            title = "Paid registration",
            description = "Collect an online registration price.",
            checked = state.choices.paidRegistration,
            onCheckedChange = { enabled ->
                actions.onChoicesChange(state.choices.copy(paidRegistration = enabled))
                if (!enabled) {
                    actions.onEditEvent { withSimpleSetupRegistrationValues(priceCents = 0) }
                    actions.onPriceQuoteConfirmationChange(true)
                } else {
                    actions.onPriceQuoteConfirmationChange(false)
                }
            },
        )
        SetupChoiceSwitch(
            title = "Required documents",
            description = "Require organization templates during registration.",
            checked = state.choices.useRequiredDocuments,
            onCheckedChange = { enabled ->
                actions.onChoicesChange(state.choices.copy(useRequiredDocuments = enabled))
                if (!enabled) actions.onEditEvent { copy(requiredTemplateIds = emptyList()) }
            },
        )
        SetupChoiceSwitch(
            title = "Registration questions",
            description = "Mark the event for question setup on the web.",
            checked = state.choices.useRegistrationQuestions,
            onCheckedChange = { enabled ->
                actions.onChoicesChange(state.choices.copy(useRegistrationQuestions = enabled))
            },
        )
    }
}

@Composable
private fun SimplePricingPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    var capacityInput by rememberSaveable(state.event.id) {
        mutableStateOf(state.event.maxParticipants.takeIf { it > 0 }?.toString().orEmpty())
    }
    LaunchedEffect(state.event.maxParticipants) {
        capacityInput = state.event.maxParticipants.takeIf { it > 0 }?.toString().orEmpty()
    }
    val hourOptions = listOf(0, 1, 2, 12, 24, 48, 72).map { hours ->
        DropdownOption(hours.toString(), if (hours == 0) "At start" else "$hours hours")
    }
    val noRefundCutoffValue = "none"
    val refundOptions = listOf(DropdownOption(noRefundCutoffValue, "No cutoff")) + hourOptions
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (state.choices.paidRegistration) {
            InclusivePriceInput(
                totalPriceCents = state.event.priceCents,
                onConfirmedTotalPriceChange = { cents ->
                    actions.onEditEvent { withSimpleSetupRegistrationValues(priceCents = cents) }
                },
                quoteInclusivePrice = actions.quoteInclusivePrice,
                onQuoteConfirmationChange = actions.onPriceQuoteConfirmationChange,
                editorKey = "simple-create:${state.event.id}",
                eventType = state.event.eventType.name,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            SimpleInfoCard("Free registration", "Players will not be charged when they join.")
        }
        StandardTextField(
            value = capacityInput,
            onValueChange = { value ->
                capacityInput = value.filter(Char::isDigit)
                capacityInput.toIntOrNull()?.let { capacity ->
                    actions.onEditEvent { withSimpleSetupRegistrationValues(maxParticipants = capacity) }
                }
            },
            label = if (state.event.teamSignup) "Maximum teams" else "Maximum players",
            keyboardType = "number",
            modifier = Modifier.fillMaxWidth(),
        )
        if (state.choices.paidRegistration) {
            PlatformDropdown(
                selectedValue = state.event.registrationCutoffHours.toString(),
                onSelectionChange = { value ->
                    actions.onEditEvent { copy(registrationCutoffHours = value.toIntOrNull() ?: 0) }
                },
                options = hourOptions,
                label = "Registration closes",
                modifier = Modifier.fillMaxWidth(),
            )
            PlatformDropdown(
                selectedValue = state.event.cancellationRefundHours?.toString() ?: noRefundCutoffValue,
                onSelectionChange = { value ->
                    actions.onEditEvent {
                        copy(cancellationRefundHours = value.takeUnless { it == noRefundCutoffValue }?.toIntOrNull())
                    }
                },
                options = refundOptions,
                label = "Refund cutoff",
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            PlatformDropdown(
                selectedValue = state.event.registrationCutoffHours.toString(),
                onSelectionChange = { value ->
                    actions.onEditEvent { copy(registrationCutoffHours = value.toIntOrNull() ?: 0) }
                },
                options = hourOptions,
                label = "Registration closes",
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun SimpleDocumentsPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (state.organizationTemplatesLoading) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = Modifier.width(18.dp), strokeWidth = 2.dp)
                Text("Loading document templates…")
            }
        } else if (state.choices.useRequiredDocuments) {
            PlatformDropdown(
                selectedValue = "",
                onSelectionChange = {},
                options = state.organizationTemplates.map { template ->
                    DropdownOption(template.id, template.title)
                },
                label = "Required documents",
                placeholder = if (state.organizationTemplates.isEmpty()) "No templates available" else "Select documents",
                enabled = state.organizationTemplates.isNotEmpty(),
                multiSelect = true,
                selectedValues = state.event.requiredTemplateIds,
                onMultiSelectionChange = { ids -> actions.onEditEvent { copy(requiredTemplateIds = ids) } },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        state.organizationTemplatesError?.let { error ->
            Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (state.choices.useRegistrationQuestions) {
            SimpleInfoCard(
                title = "Questions are added after creation",
                body = "Open this event on the web to author registration questions.",
            )
        }
        if (!state.choices.useRequiredDocuments && !state.choices.useRegistrationQuestions) {
            SimpleInfoCard("Nothing required", "Registration will not ask for documents or custom questions.")
        }
    }
}

@Composable
private fun SimpleOperationsPlanPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SetupChoiceSwitch(
            title = "Assign event staff",
            description = "Add assistant hosts who can help manage the event.",
            checked = state.choices.useStaffAssignments,
            onCheckedChange = { actions.onChoicesChange(state.choices.copy(useStaffAssignments = it)) },
        )
        SetupChoiceSwitch(
            title = "Use dedicated officials",
            description = "Assign people instead of participant teams to officiate.",
            checked = state.choices.useDedicatedOfficials,
            onCheckedChange = { actions.onChoicesChange(state.choices.copy(useDedicatedOfficials = it)) },
        )
        if (state.event.teamSignup) {
            SimpleInfoCard(
                title = "Team operations included",
                body = "Check-in and roster controls are available on the next page.",
            )
        }
    }
}

@Composable
private fun SimpleStaffOperationsPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    var search by rememberSaveable { mutableStateOf("") }
    val currentOfficialIds = (state.event.officialIds + state.event.eventOfficials.map { official -> official.userId })
        .distinct()
    val selectedIds = (state.event.assistantHostIds + currentOfficialIds).toSet()
    val userOptions = buildList {
        state.suggestedUsers.forEach { user ->
            val name = listOf(user.firstName, user.lastName).filter(String::isNotBlank).joinToString(" ")
                .ifBlank { user.userName.ifBlank { user.id } }
            add(DropdownOption(user.id, name))
        }
        selectedIds.filter { id -> none { option -> option.value == id } }.forEach { id ->
            add(DropdownOption(id, "Selected staff"))
        }
    }.distinctBy(DropdownOption::value)

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (state.choices.useStaffAssignments || state.choices.useDedicatedOfficials) {
            StandardTextField(
                value = search,
                onValueChange = { value ->
                    search = value
                    actions.onSearchUsers(value)
                },
                label = "Search people",
                placeholder = "Name or email",
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (state.choices.useStaffAssignments) {
            PlatformDropdown(
                selectedValue = "",
                onSelectionChange = {},
                options = userOptions,
                label = "Assistant hosts",
                placeholder = "Select staff",
                multiSelect = true,
                selectedValues = state.event.assistantHostIds,
                onMultiSelectionChange = actions.onUpdateAssistantHostIds,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (state.choices.useDedicatedOfficials) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PlatformDropdown(
                    selectedValue = "",
                    onSelectionChange = {},
                    options = userOptions,
                    label = "Officials",
                    placeholder = "Select",
                    multiSelect = true,
                    selectedValues = currentOfficialIds,
                    onMultiSelectionChange = actions.onUpdateOfficialIds,
                    modifier = Modifier.weight(1f),
                )
                PlatformDropdown(
                    selectedValue = state.event.officialSchedulingMode.name,
                    onSelectionChange = { value ->
                        OfficialSchedulingMode.entries.firstOrNull { mode -> mode.name == value }
                            ?.let(actions.onUpdateOfficialSchedulingMode)
                    },
                    options = OfficialSchedulingMode.entries.map { mode ->
                        DropdownOption(mode.name, mode.name.toEnumTitleCase())
                    },
                    label = "Scheduling",
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (state.event.teamSignup) {
            SetupChoiceSwitch(
                title = "Teams officiate",
                description = "Schedule participant teams for officiating duties.",
                checked = state.event.doTeamsOfficiate == true,
                onCheckedChange = actions.onUpdateDoTeamsOfficiate,
            )
            SetupChoiceSwitch(
                title = "Allow roster edits",
                description = "Captains can adjust match rosters before play.",
                checked = state.event.allowMatchRosterEdits,
                onCheckedChange = actions.onUpdateAllowMatchRosterEdits,
            )
        }
    }
}

@Composable
private fun SimpleReviewPage(state: EventCreateSimpleSetupUiState) {
    val sportName = state.sports.firstOrNull { sport -> sport.id == state.event.sportId }?.name ?: "Not selected"
    val timeZone = remember(state.event.timeZone) {
        runCatching { TimeZone.of(state.event.timeZone) }.getOrDefault(TimeZone.currentSystemDefault())
    }
    val errors = simpleSetupValidationErrors(
        event = state.event,
        choices = state.choices,
        priceQuoteConfirmed = state.priceQuoteConfirmed,
    )
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        ) {
            Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
                SimpleSummaryRow("Name", state.event.name.ifBlank { "Not set" })
                SimpleSummaryRow("Format", state.event.eventType.name.toEnumTitleCase())
                SimpleSummaryRow("Sport", sportName)
                SimpleSummaryRow("Divisions", state.event.divisions.size.toString())
                SimpleSummaryRow("Starts", simpleSetupDateLabel(state.event.start, timeZone))
                SimpleSummaryRow("Location", state.event.location.ifBlank { "Not set" })
                SimpleSummaryRow(
                    "Registration",
                    if (state.choices.paidRegistration) "$${state.event.priceCents / 100.0}" else "Free",
                )
            }
        }
        if (errors.isEmpty()) {
            SimpleInfoCard("Ready to create", "Review complete. The event will remain unpublished until creation finishes.")
        } else {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = errors.take(3).joinToString("\n") { error -> "• $error" },
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }
}

@Composable
private fun SimpleSummaryRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(92.dp),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
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
        Text("This step is not used", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(
            page.unavailableReason ?: "The selected event path does not need this step.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onOpenController) {
            Text("Open Advanced Setup")
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
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled, role = Role.Switch) { onCheckedChange(!checked) }
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
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

@Composable
private fun SimpleInfoCard(
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(
                    body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (actionLabel != null && onAction != null) {
                TextButton(
                    onClick = onAction,
                    modifier = Modifier.align(Alignment.End),
                ) {
                    Text(actionLabel)
                }
            }
        }
    }
}

private fun simpleSetupDateLabel(instant: Instant, timeZone: TimeZone): String {
    if (instant == Instant.DISTANT_PAST) return "Not set"
    val local = instant.toLocalDateTime(timeZone)
    val month = local.month.name
        .take(3)
        .lowercase()
        .replaceFirstChar { character -> character.uppercase() }
    val hour = when {
        local.hour == 0 -> 12
        local.hour > 12 -> local.hour - 12
        else -> local.hour
    }
    val minute = local.minute.takeIf { it != 0 }?.toString()?.padStart(2, '0')
    val time = buildString {
        append(hour)
        if (minute != null) append(":$minute")
        append(if (local.hour < 12) " AM" else " PM")
    }
    return "$month ${local.day} · $time"
}

private fun formatDescription(type: EventType): String = when (type) {
    EventType.EVENT -> "One-time activity or gathering"
    EventType.WEEKLY_EVENT -> "Repeating weekly sessions"
    EventType.LEAGUE -> "Season play and standings"
    EventType.TOURNAMENT -> "Bracket or pool competition"
    EventType.TRYOUT -> "Organization team evaluations"
}

private fun simpleSetupPageDescription(pageId: EventCreateSetupPageId): String = when (pageId) {
    EventCreateSetupPageId.FORMAT -> "Choose the structure that best matches what you are organizing."
    EventCreateSetupPageId.BASICS -> "Give players the essential identity of the event."
    EventCreateSetupPageId.PARTICIPATION_PLAN -> "Decide who registers and how divisions share settings."
    EventCreateSetupPageId.DIVISIONS -> "Add the gender, age, and skill groups that can register."
    EventCreateSetupPageId.SCHEDULE_PLAN -> "Choose automatic scheduling or a detailed timeslot plan."
    EventCreateSetupPageId.SCHEDULE_LOCATION -> "Set the event window, mapped location, and resource count."
    EventCreateSetupPageId.COMPETITION_PLAN -> "Use sport defaults or choose the competition rules to customize."
    EventCreateSetupPageId.COMPETITION_RULES -> "Set only the core rules needed for this competition."
    EventCreateSetupPageId.REGISTRATION_PLAN -> "Choose payments and registration requirements."
    EventCreateSetupPageId.PRICING_REGISTRATION -> "Set capacity, price, and registration cutoffs."
    EventCreateSetupPageId.DOCUMENTS_QUESTIONS -> "Select any documents and note question requirements."
    EventCreateSetupPageId.OPERATIONS_PLAN -> "Choose who helps manage and officiate the event."
    EventCreateSetupPageId.STAFF_OPERATIONS -> "Assign staff and set the essential team controls."
    EventCreateSetupPageId.REVIEW_PUBLISH -> "Confirm the essential setup before creating the event."
}
