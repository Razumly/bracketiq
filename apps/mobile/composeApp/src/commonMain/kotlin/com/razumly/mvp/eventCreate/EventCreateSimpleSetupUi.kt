@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventCreate

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameterOption
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.label
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.dataTypes.skillsForSport
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import com.razumly.mvp.core.data.repositories.RegistrationQuestionDraft
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.InclusivePriceInput
import com.razumly.mvp.core.presentation.composables.PlatformDateTimePicker
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.toEnumTitleCase
import com.razumly.mvp.eventDetail.resolveEventMatchRules
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
    val localFields: List<Field>,
    val leagueTimeSlots: List<TimeSlot>,
    val registrationQuestions: List<RegistrationQuestionDraft>,
    val leagueScoringConfig: LeagueScoringConfigDTO,
    val suggestedUsers: List<UserData>,
    val userSearchLoading: Boolean,
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
    val onUpdateLocalFieldName: (Int, String) -> Unit,
    val onAddLeagueTimeSlot: (TimeSlot) -> Unit,
    val onUpdateLeagueTimeSlot: (Int, TimeSlot) -> Unit,
    val onRemoveLeagueTimeSlot: (Int) -> Unit,
    val onLeagueScoringConfigChange: (LeagueScoringConfigDTO) -> Unit,
    val onRegistrationQuestionsChange: (List<RegistrationQuestionDraft>) -> Unit,
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
            EventCreateSetupPageId.SCHEDULE_LOCATION -> SimpleScheduleLocationPage(state, actions)
            EventCreateSetupPageId.RESOURCES -> SimpleResourcesPage(state, actions)
            EventCreateSetupPageId.TIMESLOTS -> SimpleTimeslotsPage(state, actions)
            EventCreateSetupPageId.COMPETITION_RULES -> SimpleCompetitionRulesPage(state, actions)
            EventCreateSetupPageId.REGISTRATION_PLAN -> SimpleRegistrationPlanPage(state, actions)
            EventCreateSetupPageId.PRICING_REGISTRATION -> SimplePricingPage(state, actions)
            EventCreateSetupPageId.QUESTIONS -> SimpleQuestionsPage(state, actions)
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
            if (description.isNotBlank()) {
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
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
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = type.name.toEnumTitleCase(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = formatDescription(type),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
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
                description = if (state.event.eventType == EventType.LEAGUE) {
                    "Add a playoff bracket after regular-season matches."
                } else {
                    "Create pools that advance teams into a playoff bracket."
                },
                checked = state.event.includePlayoffs,
                onCheckedChange = { include ->
                    actions.onEditEvent {
                        if (eventType == EventType.TOURNAMENT) {
                            withSimpleTournamentPoolPlayEnabled(include)
                        } else {
                            copy(
                                includePlayoffs = include,
                                playoffTeamCount = if (include) playoffTeamCount else null,
                            )
                        }
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
    var editingDivisionId by rememberSaveable(state.event.id) { mutableStateOf<String?>(null) }
    var gender by rememberSaveable(state.event.id) {
        mutableStateOf(genderOptions.first().id)
    }
    var skillId by rememberSaveable(state.event.id, state.event.sportId) {
        mutableStateOf(skillOptions.first().id)
    }
    var ageId by rememberSaveable(state.event.id) {
        mutableStateOf(ageOptions.first().id)
    }
    LaunchedEffect(genderOptions, skillOptions, ageOptions) {
        if (genderOptions.none { it.id == gender }) gender = genderOptions.first().id
        if (skillOptions.none { it.id == skillId }) skillId = skillOptions.first().id
        if (ageOptions.none { it.id == ageId }) ageId = ageOptions.first().id
    }
    LaunchedEffect(editingDivisionId) {
        val detail = state.event.divisionDetails.firstOrNull { candidate -> candidate.id == editingDivisionId }
            ?: return@LaunchedEffect
        gender = detail.gender.takeIf { value -> genderOptions.any { it.id == value } }
            ?: genderOptions.first().id
        skillId = detail.skillDivisionTypeId.takeIf { value -> skillOptions.any { it.id == value } }
            ?: skillOptions.first().id
        ageId = detail.ageDivisionTypeId.takeIf { value -> ageOptions.any { it.id == value } }
            ?: ageOptions.first().id
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
                        replacingDivisionId = editingDivisionId,
                    )
                }
                editingDivisionId = null
            },
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) {
            Text(
                when {
                    editingDivisionId != null -> "Save division"
                    state.event.divisions.isEmpty() -> "Add division"
                    else -> "Add another division"
                },
            )
        }
        state.event.divisionDetails.take(3).forEach { detail ->
            EditableSummaryCard(
                title = detail.name,
                body = "Tap to edit this division",
                onClick = { editingDivisionId = detail.id },
                selected = editingDivisionId == detail.id,
            )
        }
        if (state.event.divisionDetails.size > 3) {
            Text(
                text = "+${state.event.divisionDetails.size - 3} more configured divisions",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
    val supportsOpenEnd = state.event.eventType != EventType.EVENT

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
                value = if (state.event.noFixedEndDateTime) {
                    "Set when generated"
                } else {
                    simpleSetupDateLabel(state.event.end, timeZone)
                },
                onValueChange = {},
                label = "Ends",
                readOnly = true,
                onTap = if (state.event.noFixedEndDateTime) null else ({ showEndPicker = true }),
                modifier = Modifier.weight(1f),
            )
        }
        if (supportsOpenEnd) {
            SetupChoiceSwitch(
                title = "Set end during match generation",
                description = "Leave the end open now. Generated matches will set the event end date and time.",
                checked = state.event.noFixedEndDateTime,
                onCheckedChange = { enabled -> actions.onEditEvent { copy(noFixedEndDateTime = enabled) } },
            )
        }
        state.event.address?.takeIf(String::isNotBlank)?.let { address ->
            Text(
                text = address,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
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
private fun SimpleResourcesPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PlatformDropdown(
            selectedValue = state.localFields.size.coerceAtLeast(1).toString(),
            onSelectionChange = { value -> actions.onSelectFieldCount(value.toIntOrNull() ?: 1) },
            options = (1..12).map { count -> DropdownOption(count.toString(), count.toString()) },
            label = "Resource count",
            supportingText = "Add every court, field, rink, or playing area used by this event.",
            modifier = Modifier.fillMaxWidth(),
        )
        state.localFields.forEachIndexed { index, field ->
            StandardTextField(
                value = field.name?.takeIf(String::isNotBlank) ?: "Field ${field.fieldNumber}",
                onValueChange = { label -> actions.onUpdateLocalFieldName(index, label) },
                label = "Resource ${index + 1} label",
                placeholder = "Court ${index + 1}",
                imeAction = if (index == state.localFields.lastIndex) ImeAction.Done else ImeAction.Next,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun SimpleTimeslotsPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    var showSlotStartPicker by rememberSaveable { mutableStateOf(false) }
    var showSlotEndPicker by rememberSaveable { mutableStateOf(false) }
    var editingSlotIndex by remember(state.event.id) { mutableStateOf<Int?>(null) }
    var slotDraft by remember(state.event.id) { mutableStateOf<TimeSlot?>(null) }
    val timeZone = remember(state.event.timeZone) {
        runCatching { TimeZone.of(state.event.timeZone) }.getOrDefault(TimeZone.currentSystemDefault())
    }
    val resourceOptions = state.localFields.map { field ->
        DropdownOption(field.id, field.name?.takeIf(String::isNotBlank) ?: "Field ${field.fieldNumber}")
    }
    val divisionOptions = state.event.divisionDetails.map { detail -> DropdownOption(detail.id, detail.name) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (slotDraft == null && !state.useManualTimeSlots) {
            SimpleInfoCard(
                title = "Default event timeslot",
                body = buildString {
                    append(simpleSetupDateLabel(state.event.start, timeZone))
                    append(" – ")
                    append(
                        if (state.event.noFixedEndDateTime) {
                            "end set during match generation"
                        } else {
                            simpleSetupDateLabel(state.event.end, timeZone)
                        },
                    )
                    append(" • all ${simpleSetupCountLabel(state.localFields.size, "resource")}")
                    append(" and ${simpleSetupCountLabel(state.event.divisions.size, "division")}")
                },
            )
        }
        if (slotDraft == null) {
            OutlinedButton(
                onClick = {
                    val existingDefault = state.leagueTimeSlots.firstOrNull()
                        ?.takeIf { !state.useManualTimeSlots }
                    editingSlotIndex = existingDefault?.let { 0 }
                    slotDraft = existingDefault ?: createSimpleSetupEventRangeSlot(
                        event = state.event,
                        fields = state.localFields,
                    )
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text(if (state.useManualTimeSlots) "Add another timeslot" else "Add custom timeslot")
            }
        }
        slotDraft?.let { draft ->
            val selectedResourceIds = draft.normalizedScheduledFieldIds()
            val selectedDivisionIds = draft.normalizedDivisionIds()
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                shape = RoundedCornerShape(12.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = if (editingSlotIndex == null) "New custom timeslot" else "Edit custom timeslot",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        StandardTextField(
                            value = simpleSetupDateLabel(draft.startDate, timeZone),
                            onValueChange = {},
                            label = "Starts",
                            readOnly = true,
                            onTap = { showSlotStartPicker = true },
                            modifier = Modifier.weight(1f),
                        )
                        StandardTextField(
                            value = draft.endDate?.let { simpleSetupDateLabel(it, timeZone) }.orEmpty(),
                            onValueChange = {},
                            label = "Ends",
                            readOnly = true,
                            onTap = { showSlotEndPicker = true },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    PlatformDropdown(
                        selectedValue = "",
                        onSelectionChange = {},
                        options = resourceOptions,
                        label = "Resources",
                        placeholder = "Select resources",
                        multiSelect = true,
                        selectedValues = selectedResourceIds,
                        onMultiSelectionChange = { selected ->
                            slotDraft = draft.copy(
                                scheduledFieldId = selected.firstOrNull(),
                                scheduledFieldIds = selected,
                            )
                        },
                        isError = selectedResourceIds.isEmpty(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    PlatformDropdown(
                        selectedValue = "",
                        onSelectionChange = {},
                        options = divisionOptions,
                        label = "Divisions",
                        placeholder = "Select divisions",
                        multiSelect = true,
                        selectedValues = selectedDivisionIds,
                        onMultiSelectionChange = { selected -> slotDraft = draft.copy(divisions = selected) },
                        enabled = !state.event.singleDivision,
                        supportingText = if (state.event.singleDivision) "All event divisions are included." else "",
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = {
                                editingSlotIndex?.let { index ->
                                    if (state.leagueTimeSlots.size > 1) {
                                        actions.onRemoveLeagueTimeSlot(index)
                                    } else {
                                        actions.onUseManualTimeSlotsChange(false)
                                    }
                                }
                                editingSlotIndex = null
                                slotDraft = null
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(
                                if (editingSlotIndex == null) {
                                    "Cancel"
                                } else if (state.leagueTimeSlots.size > 1) {
                                    "Delete"
                                } else {
                                    "Use default"
                                },
                            )
                        }
                        val slotIsValid = selectedResourceIds.isNotEmpty() &&
                            draft.endDate?.let { end -> end > draft.startDate } == true
                        Button(
                            onClick = {
                                val index = editingSlotIndex
                                if (index == null) {
                                    actions.onAddLeagueTimeSlot(draft)
                                } else {
                                    actions.onUpdateLeagueTimeSlot(index, draft)
                                }
                                actions.onUseManualTimeSlotsChange(true)
                                editingSlotIndex = null
                                slotDraft = null
                            },
                            enabled = slotIsValid,
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Save timeslot")
                        }
                    }
                }
            }
        }
        if (state.useManualTimeSlots && slotDraft == null) {
            state.leagueTimeSlots.forEachIndexed { index, slot ->
                val resourceCount = slot.normalizedScheduledFieldIds().size
                val divisionCount = slot.normalizedDivisionIds().size
                EditableSummaryCard(
                    title = "Timeslot ${index + 1}",
                    body = buildString {
                        append(simpleSetupDateLabel(slot.startDate, timeZone))
                        append(" – ")
                        append(slot.endDate?.let { simpleSetupDateLabel(it, timeZone) } ?: "No end")
                        append(" • ${simpleSetupCountLabel(resourceCount, "resource")}")
                        append(" • ${simpleSetupCountLabel(divisionCount, "division")}")
                    },
                    onClick = {
                        editingSlotIndex = index
                        slotDraft = slot
                    },
                )
            }
        }
    }

    PlatformDateTimePicker(
        onDateSelected = { selected ->
            selected?.let { start ->
                slotDraft = slotDraft?.copy(
                    startDate = start,
                    endDate = slotDraft?.endDate?.takeIf { end -> end > start } ?: start + 1.hours,
                )
            }
        },
        onDismissRequest = { showSlotStartPicker = false },
        showPicker = showSlotStartPicker,
        getTime = true,
        canSelectPast = false,
        initialDate = slotDraft?.startDate?.takeUnless { it == Instant.DISTANT_PAST },
    )
    PlatformDateTimePicker(
        onDateSelected = { selected -> selected?.let { end -> slotDraft = slotDraft?.copy(endDate = end) } },
        onDismissRequest = { showSlotEndPicker = false },
        showPicker = showSlotEndPicker,
        getTime = true,
        canSelectPast = false,
        initialDate = slotDraft?.endDate,
    )
}

@Composable
private fun SimpleCompetitionRulesPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    val event = state.event
    val sport = state.sports.firstOrNull { candidate -> candidate.id == event.sportId }
    val rules = remember(event, sport) { resolveEventMatchRules(event, sport) }
    val segmentCount = resolveSimpleCompetitionSegmentCount(
        event = event,
        scoringModel = rules.scoringModel,
        sportSegmentCount = rules.segmentCount,
    )
    val segmentPlural = when {
        segmentCount == 1 -> rules.segmentLabel
        rules.segmentLabel.equals("Half", ignoreCase = true) -> "Halves"
        else -> "${rules.segmentLabel}s"
    }
    val defaultMatchMinutes = rules.timekeeping.segmentDurationMinutesBySequence
        .takeIf { durations -> durations.size >= segmentCount }
        ?.take(segmentCount)
        ?.sum()
        ?: rules.timekeeping.segmentDurationMinutes?.times(segmentCount)
        ?: 60
    val setTargets = when (event.eventType) {
        EventType.LEAGUE -> event.pointsToVictory
        EventType.TOURNAMENT -> event.winnerBracketPointsToVictory
        else -> emptyList()
    }.takeIf { values -> values.size >= segmentCount && values.take(segmentCount).all { it > 0 } }
        ?.take(segmentCount)
        ?: rules.setPointTargets
            .takeIf { values -> values.size >= segmentCount && values.take(segmentCount).all { it > 0 } }
            ?.take(segmentCount)
        ?: List(segmentCount) { 21 }
    val showStandings = event.eventType == EventType.LEAGUE &&
        (sport?.usePointsForWin == true || sport?.usePointsForDraw == true || sport?.usePointsForLoss == true)
    val tournamentPoolPlayEnabled = event.eventType == EventType.TOURNAMENT && event.includePlayoffs
    val tournamentPoolCount = event.divisionDetails.firstNotNullOfOrNull(DivisionDetail::poolCount)
    val tournamentCapacity = event.maxParticipants.takeIf { value -> value >= 2 }
    val tournamentTeamsPerPool = tournamentPoolCount?.let { count ->
        tournamentCapacity?.takeIf { capacity -> capacity % count == 0 }?.div(count)
    }
    val tournamentAdvancingPerPool = tournamentPoolCount?.let { count ->
        event.playoffTeamCount?.takeIf { teams -> teams % count == 0 }?.div(count)
    }
    val competitionSummary = when (rules.scoringModel) {
        "SETS" -> "Sets • Best of $segmentCount"
        "PERIODS" -> "Timed • $segmentCount ${segmentPlural.lowercase()}"
        "INNINGS" -> "$segmentCount ${segmentPlural.lowercase()}"
        else -> "Single score"
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "${sport?.name ?: "Selected sport"} • $competitionSummary",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        when (rules.scoringModel) {
            "PERIODS" -> {
                val matchMinutes = event.matchDurationMinutes ?: defaultMatchMinutes
                val playoffMinutes = event.divisionDetails
                    .firstNotNullOfOrNull { detail -> detail.playoffConfig?.matchDurationMinutes }
                    ?: matchMinutes
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SimpleNumberField(
                        label = if (tournamentPoolPlayEnabled) "Pool match (min)" else "Match length (min)",
                        value = matchMinutes,
                        onChange = { minutes ->
                            actions.onEditEvent { withSimpleTimedMatchDuration(minutes, segmentCount) }
                        },
                    )
                    if (event.includePlayoffs) {
                        SimpleNumberField(
                            label = if (event.eventType == EventType.TOURNAMENT) {
                                "Bracket match (min)"
                            } else {
                                "Playoff length (min)"
                            },
                            value = playoffMinutes,
                            onChange = { minutes ->
                                actions.onEditEvent { withSimplePlayoffMatchDuration(minutes) }
                            },
                        )
                    } else {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }

            "SETS" -> {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Sets per match",
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.weight(1f),
                    )
                    listOf(1, 3, 5).forEach { count ->
                        FilterChip(
                            selected = segmentCount == count,
                            onClick = {
                                val resizedTargets = resizeSimpleSetPointTargets(
                                    currentTargets = setTargets,
                                    setCount = count,
                                    sportDefaults = rules.setPointTargets,
                                )
                                actions.onEditEvent { withSimpleSetPointTargets(resizedTargets) }
                            },
                            label = { Text(count.toString()) },
                            modifier = Modifier.heightIn(min = 48.dp),
                        )
                    }
                }
                Text(
                    text = "Scores required to win each set",
                    style = MaterialTheme.typography.labelLarge,
                )
                SimpleSetScoreFields(
                    targets = setTargets,
                    onTargetChange = { index, value ->
                        val updated = setTargets.toMutableList().also { targets -> targets[index] = value }
                        actions.onEditEvent { withSimpleSetPointTargets(updated) }
                    },
                )
            }

            "POINTS_ONLY" -> {
                Row(modifier = Modifier.fillMaxWidth()) {
                    SimpleNumberField(
                        label = "Target score",
                        value = event.pointsToVictory.firstOrNull() ?: setTargets.first(),
                        onChange = { score -> actions.onEditEvent { withSimpleSetPointTargets(listOf(score ?: 1)) } },
                    )
                    Spacer(Modifier.weight(1f))
                }
            }
        }
        if (tournamentPoolPlayEnabled) {
            Text(
                text = "Pool setup",
                style = MaterialTheme.typography.labelLarge,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SimpleNumberField(
                    label = "Pool count",
                    value = tournamentPoolCount,
                    onChange = { count ->
                        actions.onEditEvent {
                            withSimpleTournamentPoolConfiguration(
                                poolCount = count,
                                bracketTeamCount = playoffTeamCount,
                            )
                        }
                    },
                )
                SimpleNumberField(
                    label = "Bracket teams",
                    value = event.playoffTeamCount,
                    onChange = { teams ->
                        actions.onEditEvent {
                            withSimpleTournamentPoolConfiguration(
                                poolCount = tournamentPoolCount,
                                bracketTeamCount = teams,
                            )
                        }
                    },
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SimplePoolValueCard(
                    label = "Teams / pool",
                    value = tournamentTeamsPerPool?.toString() ?: "After capacity",
                    modifier = Modifier.weight(1f),
                )
                SimplePoolValueCard(
                    label = "Advance / pool",
                    value = tournamentAdvancingPerPool?.toString() ?: "After bracket teams",
                    modifier = Modifier.weight(1f),
                )
            }
        } else if (event.eventType == EventType.LEAGUE && event.includePlayoffs) {
            StandardTextField(
                value = event.playoffTeamCount?.toString().orEmpty(),
                onValueChange = { value ->
                    val filtered = value.filter(Char::isDigit)
                    actions.onEditEvent { copy(playoffTeamCount = filtered.toIntOrNull()) }
                },
                label = "Teams advancing to playoffs",
                supportingText = "Number of teams from regular play that enter the playoff bracket.",
                keyboardType = "number",
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (event.eventType == EventType.TOURNAMENT) {
            Text(
                text = if (tournamentPoolPlayEnabled) "Playoff bracket" else "Bracket format",
                style = MaterialTheme.typography.labelLarge,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = !event.doubleElimination,
                    onClick = { actions.onEditEvent { withSimpleTournamentDoubleElimination(false) } },
                    label = { Text("Single elimination") },
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                )
                FilterChip(
                    selected = event.doubleElimination,
                    onClick = { actions.onEditEvent { withSimpleTournamentDoubleElimination(true) } },
                    label = { Text("Double elimination") },
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                )
            }
        }
        if (showStandings) {
            Text(
                text = "Standings points awarded after each completed match",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SimpleScoringField("Win points", state.leagueScoringConfig.pointsForWin) { value ->
                    actions.onLeagueScoringConfigChange(state.leagueScoringConfig.copy(pointsForWin = value))
                }
                if (rules.supportsDraw || sport.usePointsForDraw == true) {
                    SimpleScoringField("Draw points", state.leagueScoringConfig.pointsForDraw) { value ->
                        actions.onLeagueScoringConfigChange(state.leagueScoringConfig.copy(pointsForDraw = value))
                    }
                }
                SimpleScoringField("Loss points", state.leagueScoringConfig.pointsForLoss) { value ->
                    actions.onLeagueScoringConfigChange(state.leagueScoringConfig.copy(pointsForLoss = value))
                }
            }
        }
    }
}

@Composable
private fun SimplePoolValueCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = RoundedCornerShape(10.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 3.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun RowScope.SimpleNumberField(
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
private fun SimpleSetScoreFields(
    targets: List<Int>,
    onTargetChange: (Int, Int) -> Unit,
) {
    targets.chunked(3).forEachIndexed { rowIndex, rowTargets ->
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            rowTargets.forEachIndexed { columnIndex, target ->
                val index = rowIndex * 3 + columnIndex
                StandardTextField(
                    value = target.toString(),
                    onValueChange = { input ->
                        input.filter(Char::isDigit).toIntOrNull()?.takeIf { it > 0 }?.let { value ->
                            onTargetChange(index, value)
                        }
                    },
                    label = "Set ${index + 1}",
                    keyboardType = "number",
                    modifier = Modifier.weight(1f),
                )
            }
            repeat(3 - rowTargets.size) { Spacer(Modifier.weight(1f)) }
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
            title = "Registration questions",
            description = "Ask players for information before they register.",
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
private fun SimpleQuestionsPage(
    state: EventCreateSimpleSetupUiState,
    actions: EventCreateSimpleSetupUiActions,
) {
    var editingQuestionIndex by remember(state.event.id) { mutableStateOf<Int?>(null) }
    var prompt by rememberSaveable(state.event.id) { mutableStateOf("") }
    var answerType by rememberSaveable(state.event.id) { mutableStateOf("TEXT") }
    var required by rememberSaveable(state.event.id) { mutableStateOf(false) }

    fun clearEditor() {
        editingQuestionIndex = null
        prompt = ""
        answerType = "TEXT"
        required = false
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StandardTextField(
            value = prompt,
            onValueChange = { value -> prompt = value.take(500) },
            label = "Question",
            placeholder = "What position do you play?",
            imeAction = ImeAction.Done,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = answerType == "TEXT",
                onClick = { answerType = "TEXT" },
                label = { Text("Short answer") },
                modifier = Modifier.weight(1f),
            )
            FilterChip(
                selected = answerType == "LONG_TEXT",
                onClick = { answerType = "LONG_TEXT" },
                label = { Text("Long answer") },
                modifier = Modifier.weight(1f),
            )
        }
        SetupChoiceSwitch(
            title = "Required question",
            description = "Registration cannot finish until this question is answered.",
            checked = required,
            onCheckedChange = { required = it },
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedButton(
                onClick = {
                    val index = editingQuestionIndex
                    if (index != null) {
                        actions.onRegistrationQuestionsChange(
                            state.registrationQuestions.filterIndexed { candidateIndex, _ -> candidateIndex != index },
                        )
                    }
                    clearEditor()
                },
                modifier = Modifier.weight(1f).height(48.dp),
            ) {
                Text(if (editingQuestionIndex == null) "Clear" else "Delete")
            }
            Button(
                onClick = {
                    val normalizedPrompt = prompt.trim()
                    val existing = editingQuestionIndex?.let(state.registrationQuestions::getOrNull)
                    val question = RegistrationQuestionDraft(
                        id = existing?.id,
                        prompt = normalizedPrompt,
                        answerType = answerType,
                        required = required,
                    )
                    val updated = editingQuestionIndex?.let { index ->
                        state.registrationQuestions.mapIndexed { candidateIndex, current ->
                            if (candidateIndex == index) question else current
                        }
                    } ?: (state.registrationQuestions + question)
                    actions.onRegistrationQuestionsChange(updated)
                    clearEditor()
                },
                enabled = prompt.isNotBlank() &&
                    (editingQuestionIndex != null || state.registrationQuestions.size < 20),
                modifier = Modifier.weight(1f).height(48.dp),
            ) {
                Text(if (editingQuestionIndex == null) "Add question" else "Save question")
            }
        }
        state.registrationQuestions.forEachIndexed { index, question ->
            EditableSummaryCard(
                title = question.prompt,
                body = buildString {
                    append(if (question.answerType == "LONG_TEXT") "Long answer" else "Short answer")
                    append(if (question.required) " • Required" else " • Optional")
                },
                onClick = {
                    editingQuestionIndex = index
                    prompt = question.prompt
                    answerType = question.answerType
                    required = question.required
                },
                selected = editingQuestionIndex == index,
            )
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
    val visibleUserSuggestions = state.suggestedUsers
        .distinctBy(UserData::id)
        .filter { user ->
            state.choices.useDedicatedOfficials ||
                (state.choices.useStaffAssignments && user.id != state.event.hostId)
        }
        .take(6)

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
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
            when {
                state.userSearchLoading -> Text(
                    text = "Searching…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                search.isNotBlank() && visibleUserSuggestions.isEmpty() -> Text(
                    text = "No matching people.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                search.isNotBlank() -> visibleUserSuggestions.forEach { user ->
                        SimpleStaffSuggestionCard(
                            user = user,
                            allowAssistantHost = state.choices.useStaffAssignments && user.id != state.event.hostId,
                            assistantHostSelected = user.id in state.event.assistantHostIds,
                            onAssistantHostChange = { selected ->
                                actions.onUpdateAssistantHostIds(
                                    if (selected) {
                                        state.event.assistantHostIds + user.id
                                    } else {
                                        state.event.assistantHostIds - user.id
                                    },
                                )
                            },
                            allowOfficial = state.choices.useDedicatedOfficials,
                            officialSelected = user.id in currentOfficialIds,
                            onOfficialChange = { selected ->
                                actions.onUpdateOfficialIds(
                                    if (selected) currentOfficialIds + user.id else currentOfficialIds - user.id,
                                )
                            },
                        )
                    }
            }
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
            PlatformDropdown(
                selectedValue = "",
                onSelectionChange = {},
                options = userOptions,
                label = "Officials",
                placeholder = "Select officials",
                multiSelect = true,
                selectedValues = currentOfficialIds,
                onMultiSelectionChange = actions.onUpdateOfficialIds,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = "Scheduling priority",
                style = MaterialTheme.typography.titleSmall,
            )
            OfficialSchedulingMode.entries.chunked(2).forEach { rowModes ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    rowModes.forEach { mode ->
                        SchedulingPriorityCard(
                            mode = mode,
                            selected = state.event.officialSchedulingMode == mode,
                            onClick = { actions.onUpdateOfficialSchedulingMode(mode) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (rowModes.size == 1) Spacer(Modifier.weight(1f))
                }
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
internal fun SimpleStaffSuggestionCard(
    user: UserData,
    allowAssistantHost: Boolean,
    assistantHostSelected: Boolean,
    onAssistantHostChange: (Boolean) -> Unit,
    allowOfficial: Boolean,
    officialSelected: Boolean,
    onOfficialChange: (Boolean) -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = user.fullName,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            user.userName.takeIf(String::isNotBlank)?.let { userName ->
                Text(
                    text = "@$userName",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (allowAssistantHost) {
                    FilterChip(
                        selected = assistantHostSelected,
                        onClick = { onAssistantHostChange(!assistantHostSelected) },
                        label = { Text("Assistant host") },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (allowOfficial) {
                    FilterChip(
                        selected = officialSelected,
                        onClick = { onOfficialChange(!officialSelected) },
                        label = { Text("Official") },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun SchedulingPriorityCard(
    mode: OfficialSchedulingMode,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .heightIn(min = 84.dp)
            .semantics { this.selected = selected }
            .clickable(role = Role.RadioButton, onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerLow
            },
        ),
        border = BorderStroke(
            width = if (selected) 2.dp else 1.dp,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = mode.label(),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = officialSchedulingModeDescription(mode),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
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
        registrationQuestions = state.registrationQuestions,
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

@Composable
private fun EditableSummaryCard(
    title: String,
    body: String,
    onClick: () -> Unit,
    selected: Boolean = false,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .semantics { this.selected = selected }
            .clickable(role = Role.Button, onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        border = BorderStroke(
            width = if (selected) 2.dp else 1.dp,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = "Edit",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
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

private fun simpleSetupCountLabel(count: Int, singular: String): String =
    "$count ${if (count == 1) singular else "${singular}s"}"

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
    EventCreateSetupPageId.SCHEDULE_LOCATION -> "Set the event timing and mapped location."
    EventCreateSetupPageId.RESOURCES -> "Choose how many playing areas are available and give each one a clear label."
    EventCreateSetupPageId.TIMESLOTS -> "Use the default event window or add custom windows for resources and divisions."
    EventCreateSetupPageId.COMPETITION_RULES -> ""
    EventCreateSetupPageId.REGISTRATION_PLAN -> "Choose payments and registration requirements."
    EventCreateSetupPageId.PRICING_REGISTRATION -> "Set capacity, price, and registration cutoffs."
    EventCreateSetupPageId.QUESTIONS -> "Add the questions players answer before registration is complete."
    EventCreateSetupPageId.OPERATIONS_PLAN -> "Choose who helps manage and officiate the event."
    EventCreateSetupPageId.STAFF_OPERATIONS -> "Assign staff and set the essential team controls."
    EventCreateSetupPageId.REVIEW_PUBLISH -> "Confirm the essential setup before creating the event."
}

private fun officialSchedulingModeDescription(mode: OfficialSchedulingMode): String = when (mode) {
    OfficialSchedulingMode.STAFFING -> "Assign available officials first, then build matches around them."
    OfficialSchedulingMode.TEAM_STAFFING -> "Prioritize participant-team officiating assignments."
    OfficialSchedulingMode.SCHEDULE -> "Build the match schedule first, then fill official assignments."
    OfficialSchedulingMode.OFF -> "Build matches without blocking on official availability conflicts."
}
