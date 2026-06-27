package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.foundation.Image
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_CASH_APP
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_OTHER
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_PAYPAL
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_STRIPE
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_VENMO
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_ZELLE
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_MANUAL
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_ONLINE
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.manualPaymentProviderLabel
import com.razumly.mvp.core.data.dataTypes.normalizeManualPaymentProvider
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments
import com.razumly.mvp.core.data.repositories.TeamJoinQuestion
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.core.presentation.util.toEnumTitleCase
import com.razumly.mvp.eventDetail.composables.CancellationRefundOptions
import com.razumly.mvp.eventDetail.composables.NumberInputField
import com.razumly.mvp.eventDetail.composables.RegistrationOptions
import com.razumly.mvp.eventDetail.edit.RequiredDocumentsSection
import com.razumly.mvp.eventDetail.readonly.ReadOnlyDivisionsList
import com.razumly.mvp.eventDetail.readonly.buildEventDetailsRows
import com.razumly.mvp.eventDetail.shared.DetailKeyValueList
import com.razumly.mvp.eventDetail.shared.FormSectionDivider
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow
import com.razumly.mvp.eventDetail.shared.animatedCardSection
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.payment_provider_cash_app
import mvp.composeapp.generated.resources.payment_provider_paypal
import mvp.composeapp.generated.resources.payment_provider_stripe
import mvp.composeapp.generated.resources.payment_provider_venmo
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

internal data class EventDetailsRegistrationState(
    val readOnlySection: ReadOnlySectionModel,
    val editSection: EditSectionModel,
    val sectionExpansionStates: SnapshotStateMap<String, Boolean>,
    val eventDetailsMode: EventDetailsMode,
    val lazyListState: LazyListState,
    val stickyHeaderTopInset: Dp,
    val enabled: Boolean,
    val isNewEvent: Boolean,
    val rentalTimeLocked: Boolean,
    val event: Event,
    val editEvent: Event,
    val divisionDetails: List<DivisionDetail>,
    val priceSummary: String,
    val registrationSummary: String,
    val refundSummary: String,
    val isTeamSizeValid: Boolean,
    val isOrganizationEvent: Boolean,
    val organizationTemplatesLoading: Boolean,
    val organizationTemplatesError: String?,
    val requiredTemplateOptions: List<DropdownOption>,
    val selectedRequiredTemplateIds: List<String>,
    val selectedRequiredTemplateLabels: List<String>,
    val eventRegistrationQuestions: List<TeamJoinQuestion>,
    val eventRegistrationQuestionAnswers: Map<String, String>,
    val eventRegistrationQuestionsExpanded: Boolean,
)

internal data class EventDetailsRegistrationActions(
    val onDisabledClick: () -> Unit,
    val onEditEvent: (Event.() -> Event) -> Unit,
    val onEventTypeSelected: (EventType) -> Unit,
    val onToggleEventRegistrationQuestions: () -> Unit,
    val onEventRegistrationQuestionAnswerChange: (String, String) -> Unit,
)

internal fun LazyListScope.eventDetailsRegistrationSection(
    state: EventDetailsRegistrationState,
    actions: EventDetailsRegistrationActions,
) {
    animatedCardSection(
        sectionId = state.readOnlySection.sectionId,
        sectionExpansionStates = state.sectionExpansionStates,
        sectionTitle = state.readOnlySection.title,
        collapsibleInEditMode = true,
        collapsibleInViewMode = true,
        viewSummary = state.readOnlySection.summary,
        requiredMissingCount = state.editSection.requiredMissingCount,
        enabled = state.enabled,
        onDisabledClick = actions.onDisabledClick,
        isEditMode = state.eventDetailsMode == EventDetailsMode.EDIT,
        lazyListState = state.lazyListState,
        stickyHeaderTopInset = state.stickyHeaderTopInset,
        animationDelay = 200,
        viewContent = {
            DetailKeyValueList(
                rows = buildEventDetailsRows(
                    event = state.event,
                    priceSummary = state.priceSummary,
                    registrationSummary = state.registrationSummary,
                    refundSummary = state.refundSummary,
                ),
            )
            ReadOnlyDivisionsList(
                event = state.event,
                divisionDetails = state.divisionDetails,
            )
            EventRegistrationQuestionsSection(
                questions = state.eventRegistrationQuestions,
                answers = state.eventRegistrationQuestionAnswers,
                expanded = state.eventRegistrationQuestionsExpanded,
                onToggleExpanded = actions.onToggleEventRegistrationQuestions,
                onAnswerChange = actions.onEventRegistrationQuestionAnswerChange,
            )
        },
        editContent = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                PlatformDropdown(
                    selectedValue = state.editEvent.eventType.name,
                    onSelectionChange = { selectedValue ->
                        EventType.entries
                            .find { eventType -> eventType.name == selectedValue }
                            ?.let(actions.onEventTypeSelected)
                    },
                    options = EventType.entries
                        .filterNot { eventType ->
                            state.isNewEvent && state.rentalTimeLocked && eventType == EventType.WEEKLY_EVENT
                        }
                        .map { eventType ->
                            DropdownOption(
                                value = eventType.name,
                                label = eventType.name.toEnumTitleCase(),
                            )
                        },
                    label = "Event Type",
                    modifier = Modifier.weight(1f),
                )
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = state.editEvent.teamSizeLimit.toString(),
                    label = "Team Size Limit",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            if (newValue.isBlank()) {
                                actions.onEditEvent { copy(teamSizeLimit = 0) }
                            } else {
                                actions.onEditEvent { copy(teamSizeLimit = newValue.toInt()) }
                            }
                        }
                    },
                    isError = !state.isTeamSizeValid,
                    supportingText = if (!state.isTeamSizeValid) {
                        "Team size must be at least 1."
                    } else {
                        ""
                    },
                )
            }

            val playoffsOrPoolsInput: @Composable () -> Unit = {
                if (state.editEvent.eventType == EventType.LEAGUE) {
                    LabeledCheckboxRow(
                        checked = state.editEvent.includePlayoffs,
                        label = "Include Playoffs",
                        onCheckedChange = { checked ->
                            actions.onEditEvent {
                                val nextDivisionDetails = mergeDivisionDetailsForDivisions(
                                    divisions = divisions,
                                    existingDetails = divisionDetails,
                                    eventId = id,
                                ).map { detail ->
                                    when {
                                        !checked -> detail.copy(playoffTeamCount = null)
                                        singleDivision -> detail.copy(
                                            playoffTeamCount = playoffTeamCount ?: detail.playoffTeamCount,
                                        )
                                        else -> detail
                                    }
                                }
                                copy(
                                    includePlayoffs = checked,
                                    playoffTeamCount = when {
                                        !checked -> null
                                        singleDivision -> playoffTeamCount
                                            ?: nextDivisionDetails.firstOrNull()?.playoffTeamCount
                                        else -> playoffTeamCount
                                    },
                                    divisionDetails = nextDivisionDetails,
                                )
                            }
                        },
                    )
                } else if (state.editEvent.eventType == EventType.TOURNAMENT) {
                    LabeledCheckboxRow(
                        checked = state.editEvent.includePlayoffs,
                        label = "Include Pool Play",
                        onCheckedChange = { checked ->
                            actions.onEditEvent {
                                val nextDivisionDetails = mergeDivisionDetailsForDivisions(
                                    divisions = divisions,
                                    existingDetails = divisionDetails,
                                    eventId = id,
                                ).map { detail ->
                                    if (checked) {
                                        detail.withDerivedTournamentPoolTeamCount(enabled = true)
                                    } else {
                                        detail.copy(
                                            playoffTeamCount = null,
                                            poolCount = null,
                                            poolTeamCount = null,
                                        )
                                    }
                                }
                                copy(
                                    includePlayoffs = checked,
                                    playoffTeamCount = if (checked) playoffTeamCount else null,
                                    divisionDetails = nextDivisionDetails,
                                )
                            }
                        },
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    playoffsOrPoolsInput()
                }
                Box(modifier = Modifier.weight(1f)) {
                    LabeledCheckboxRow(
                        checked = if (
                            state.editEvent.eventType == EventType.EVENT ||
                            state.editEvent.eventType == EventType.WEEKLY_EVENT
                        ) {
                            state.editEvent.teamSignup
                        } else {
                            true
                        },
                        label = "Team Event",
                        enabled = state.editEvent.eventType == EventType.EVENT ||
                            state.editEvent.eventType == EventType.WEEKLY_EVENT,
                        onCheckedChange = { checked ->
                            if (
                                state.editEvent.eventType == EventType.EVENT ||
                                state.editEvent.eventType == EventType.WEEKLY_EVENT
                            ) {
                                actions.onEditEvent { copy(teamSignup = checked) }
                            }
                        },
                    )
                }
            }
            FormSectionDivider()

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = state.editEvent.minAge?.toString().orEmpty(),
                    label = "Min Age",
                    onValueChange = { newValue ->
                        if (!newValue.all { it.isDigit() }) return@NumberInputField
                        actions.onEditEvent {
                            copy(minAge = newValue.toIntOrNull())
                        }
                    },
                    isError = false,
                )
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = state.editEvent.maxAge?.toString().orEmpty(),
                    label = "Max Age",
                    onValueChange = { newValue ->
                        if (!newValue.all { it.isDigit() }) return@NumberInputField
                        actions.onEditEvent {
                            copy(maxAge = newValue.toIntOrNull())
                        }
                    },
                    isError = false,
                )
            }
            FormSectionDivider()

            val manualPaymentsEnabled = state.editEvent.usesManualRegistrationPayments()
            ManualPaymentSettingsSection(
                event = state.editEvent,
                onEditEvent = actions.onEditEvent,
            )
            FormSectionDivider()

            val automaticRefundsEnabled = if (manualPaymentsEnabled) {
                false
            } else if (state.editEvent.singleDivision) {
                state.editEvent.priceCents > 0
            } else {
                state.divisionDetails.any { detail -> (detail.price ?: 0) > 0 }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                RegistrationOptions(
                    cutoffHours = state.editEvent.registrationCutoffHours,
                    onCutoffHoursChange = {
                        actions.onEditEvent { copy(registrationCutoffHours = it) }
                    },
                    modifier = Modifier.weight(1f),
                )
                CancellationRefundOptions(
                    refundHours = state.editEvent.cancellationRefundHours,
                    onRefundHoursChange = {
                        actions.onEditEvent { copy(cancellationRefundHours = it) }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = automaticRefundsEnabled,
                    disabledMessage = if (manualPaymentsEnabled) {
                        "Manual payments are refunded directly by the host."
                    } else {
                        "Add a paid division to enable automatic refunds."
                    },
                )
            }
            RequiredDocumentsSection(
                isOrganizationEvent = state.isOrganizationEvent,
                rentalTimeLocked = state.rentalTimeLocked,
                organizationTemplatesLoading = state.organizationTemplatesLoading,
                organizationTemplatesError = state.organizationTemplatesError,
                requiredTemplateOptions = state.requiredTemplateOptions,
                selectedRequiredTemplateIds = state.selectedRequiredTemplateIds,
                selectedRequiredTemplateLabels = state.selectedRequiredTemplateLabels,
                onRequiredTemplateIdsChange = { normalizedTemplateIds ->
                    actions.onEditEvent { copy(requiredTemplateIds = normalizedTemplateIds) }
                },
            )
        },
    )
}

@Composable
private fun ManualPaymentSettingsSection(
    event: Event,
    onEditEvent: (Event.() -> Event) -> Unit,
) {
    val manualPaymentsEnabled = event.usesManualRegistrationPayments()
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        LabeledCheckboxRow(
            checked = manualPaymentsEnabled,
            label = "Use manual registration payments",
            onCheckedChange = { checked ->
                onEditEvent {
                    copy(
                        registrationPaymentMode = if (checked) {
                            REGISTRATION_PAYMENT_MODE_MANUAL
                        } else {
                            REGISTRATION_PAYMENT_MODE_ONLINE
                        },
                        manualPaymentLinks = if (checked) manualPaymentLinks else emptyList(),
                        manualPaymentInstructions = if (checked) manualPaymentInstructions else null,
                        cancellationRefundHours = if (checked) null else cancellationRefundHours,
                    )
                }
            },
        )

        Text(
            text = if (manualPaymentsEnabled) {
                "Players pay outside BracketIQ. You are responsible for collecting payments, reviewing proof, and handling refunds directly."
            } else {
                "BracketIQ will use online payment processing for paid registrations."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (!manualPaymentsEnabled) return

        event.manualPaymentLinks.forEachIndexed { index, link ->
            ManualPaymentLinkEditor(
                index = index,
                link = link,
                onChange = { updated ->
                    onEditEvent {
                        copy(
                            manualPaymentLinks = manualPaymentLinks.toMutableList().also { links ->
                                if (index in links.indices) {
                                    links[index] = updated
                                }
                            },
                        )
                    }
                },
                onRemove = {
                    onEditEvent {
                        copy(
                            manualPaymentLinks = manualPaymentLinks.filterIndexed { linkIndex, _ ->
                                linkIndex != index
                            },
                        )
                    }
                },
            )
        }

        OutlinedButton(
            onClick = {
                onEditEvent {
                    val provider = MANUAL_PAYMENT_PROVIDER_VENMO
                    copy(
                        manualPaymentLinks = manualPaymentLinks + ManualPaymentLink(
                            id = "manual_payment_${manualPaymentLinks.size + 1}",
                            provider = provider,
                            label = manualPaymentProviderLabel(provider),
                            url = "",
                        ),
                    )
                }
            },
        ) {
            Text("Add payment link")
        }

        StandardTextField(
            value = event.manualPaymentInstructions.orEmpty(),
            onValueChange = { value ->
                onEditEvent { copy(manualPaymentInstructions = value) }
            },
            modifier = Modifier.fillMaxWidth(),
            label = "Manual payment instructions",
            placeholder = "Tell players what to include with their payment and when proof is reviewed.",
            height = 120.dp,
        )
    }
}

@Composable
private fun ManualPaymentLinkEditor(
    index: Int,
    link: ManualPaymentLink,
    onChange: (ManualPaymentLink) -> Unit,
    onRemove: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            PlatformDropdown(
                selectedValue = normalizeManualPaymentProvider(link.provider),
                onSelectionChange = { provider ->
                    val normalizedProvider = normalizeManualPaymentProvider(provider)
                    onChange(
                        link.copy(
                            provider = normalizedProvider,
                            label = link.label.ifBlank { manualPaymentProviderLabel(normalizedProvider) },
                        )
                    )
                },
                options = listOf(
                    MANUAL_PAYMENT_PROVIDER_CASH_APP,
                    MANUAL_PAYMENT_PROVIDER_VENMO,
                    MANUAL_PAYMENT_PROVIDER_PAYPAL,
                    MANUAL_PAYMENT_PROVIDER_STRIPE,
                    MANUAL_PAYMENT_PROVIDER_ZELLE,
                    MANUAL_PAYMENT_PROVIDER_OTHER,
                ).map { provider ->
                    DropdownOption(
                        value = provider,
                        label = manualPaymentProviderLabel(provider),
                    )
                },
                label = "Provider",
                modifier = Modifier.weight(1f),
            )
            ProviderMark(
                provider = link.provider,
                modifier = Modifier
                    .padding(top = 30.dp)
                    .size(42.dp),
            )
            Button(
                onClick = onRemove,
                modifier = Modifier.padding(top = 22.dp),
            ) {
                Text("Remove")
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            StandardTextField(
                value = link.label,
                onValueChange = { value -> onChange(link.copy(label = value)) },
                modifier = Modifier.weight(1f),
                label = "Label",
                placeholder = "Payment link ${index + 1}",
            )
            StandardTextField(
                value = link.url,
                onValueChange = { value -> onChange(link.copy(url = value)) },
                modifier = Modifier.weight(1f),
                label = "HTTPS link",
                placeholder = "https://...",
            )
        }
    }
}

@Composable
private fun ProviderMark(
    provider: String,
    modifier: Modifier = Modifier,
) {
    val drawable = manualPaymentProviderDrawable(provider)
    if (drawable != null) {
        Image(
            painter = painterResource(drawable),
            contentDescription = manualPaymentProviderLabel(provider),
            modifier = modifier,
        )
    } else {
        Text(
            text = manualPaymentProviderLabel(provider),
            modifier = modifier,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun manualPaymentProviderDrawable(provider: String): DrawableResource? {
    return when (normalizeManualPaymentProvider(provider)) {
        MANUAL_PAYMENT_PROVIDER_CASH_APP -> Res.drawable.payment_provider_cash_app
        MANUAL_PAYMENT_PROVIDER_VENMO -> Res.drawable.payment_provider_venmo
        MANUAL_PAYMENT_PROVIDER_PAYPAL -> Res.drawable.payment_provider_paypal
        MANUAL_PAYMENT_PROVIDER_STRIPE -> Res.drawable.payment_provider_stripe
        else -> null
    }
}

@Composable
private fun EventRegistrationQuestionsSection(
    questions: List<TeamJoinQuestion>,
    answers: Map<String, String>,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    onAnswerChange: (String, String) -> Unit,
) {
    if (questions.isEmpty()) return

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpanded),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Registration questions",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "${questions.size} ${if (questions.size == 1) "question" else "questions"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (expanded) {
                        "Collapse registration questions"
                    } else {
                        "Expand registration questions"
                    },
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    questions.forEach { question ->
                        StandardTextField(
                            value = answers[question.id].orEmpty(),
                            onValueChange = { value -> onAnswerChange(question.id, value) },
                            modifier = Modifier.fillMaxWidth(),
                            label = if (question.required) "${question.prompt} *" else question.prompt,
                            placeholder = "Answer",
                            supportingText = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) {
                                "A short paragraph is fine."
                            } else {
                                ""
                            },
                            height = if (question.answerType.equals("LONG_TEXT", ignoreCase = true)) {
                                128.dp
                            } else {
                                null
                            },
                        )
                    }
                }
            }
        }
    }
}
