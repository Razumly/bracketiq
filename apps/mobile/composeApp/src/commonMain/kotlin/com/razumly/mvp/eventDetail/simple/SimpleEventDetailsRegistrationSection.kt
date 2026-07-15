package com.razumly.mvp.eventDetail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.BorderStroke
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.graphics.Color
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
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.manualPaymentProviderInputLabel
import com.razumly.mvp.core.data.dataTypes.manualPaymentProviderInputPlaceholder
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
import com.razumly.mvp.eventDetail.shared.animatedCardSection
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.PaymentProviderCashApp
import com.razumly.mvp.icons.PaymentProviderStripe
import com.razumly.mvp.icons.PaymentProviderZelle
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.payment_provider_paypal
import mvp.composeapp.generated.resources.payment_provider_venmo
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource



private val manualPaymentProviderOptions = listOf(
    MANUAL_PAYMENT_PROVIDER_CASH_APP,
    MANUAL_PAYMENT_PROVIDER_VENMO,
    MANUAL_PAYMENT_PROVIDER_PAYPAL,
    MANUAL_PAYMENT_PROVIDER_STRIPE,
    MANUAL_PAYMENT_PROVIDER_ZELLE,
    MANUAL_PAYMENT_PROVIDER_OTHER,
)

internal fun LazyListScope.simpleEventDetailsRegistrationSection(
    state: EventDetailsRegistrationState,
    actions: EventDetailsRegistrationActions,
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
        enabled = state.enabled,
        onDisabledClick = actions.onDisabledClick,
        isEditMode = state.eventDetailsMode == EventDetailsMode.EDIT,
        lazyListState = state.lazyListState,
        stickyHeaderTopInset = state.stickyHeaderTopInset,
        animationDelay = 200,
        showContainer = showContainer,
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
            if (state.editEvent.teamSignup) {
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(),
                    value = state.editEvent.teamSizeLimit.toString(),
                    label = "Team Size Limit *",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            actions.onEditEvent {
                                copy(teamSizeLimit = newValue.toIntOrNull() ?: 0)
                            }
                        }
                    },
                    isError = state.showValidationErrors && !state.isTeamSizeValid,
                    supportingText = if (state.showValidationErrors && !state.isTeamSizeValid) {
                        "Team size must be at least 1."
                    } else {
                        ""
                    },
                )
                FormSectionDivider()
            }

            val ageRangeErrors = eventAgeRangeErrors(state.editEvent)
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
                        actions.onEditEvent { copy(minAge = newValue.toIntOrNull()) }
                    },
                    isError = state.showValidationErrors && ageRangeErrors.first != null,
                    supportingText = if (state.showValidationErrors) ageRangeErrors.first.orEmpty() else "",
                )
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = state.editEvent.maxAge?.toString().orEmpty(),
                    label = "Max Age",
                    onValueChange = { newValue ->
                        if (!newValue.all { it.isDigit() }) return@NumberInputField
                        actions.onEditEvent { copy(maxAge = newValue.toIntOrNull()) }
                    },
                    isError = state.showValidationErrors && ageRangeErrors.second != null,
                    supportingText = if (state.showValidationErrors) ageRangeErrors.second.orEmpty() else "",
                )
            }
            FormSectionDivider()

            RegistrationOptions(
                cutoffHours = state.editEvent.registrationCutoffHours,
                onCutoffHoursChange = { hours ->
                    actions.onEditEvent { copy(registrationCutoffHours = hours) }
                },
                modifier = Modifier.fillMaxWidth(),
                showValidationErrors = state.showValidationErrors,
            )

            if (state.editEvent.usesManualRegistrationPayments()) {
                FormSectionDivider()
                ManualPaymentSettingsSection(
                    event = state.editEvent,
                    onEditEvent = actions.onEditEvent,
                    showValidationErrors = state.showValidationErrors,
                )
            }

            if (state.editEvent.cancellationRefundHours != null) {
                FormSectionDivider()
                StandardTextField(
                    value = state.editEvent.cancellationRefundHours?.toString().orEmpty(),
                    onValueChange = { newValue ->
                        if (!newValue.all(Char::isDigit)) return@StandardTextField
                        actions.onEditEvent {
                            copy(cancellationRefundHours = newValue.toIntOrNull() ?: 0)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = "Automatic refund cutoff (hours) *",
                    keyboardType = "number",
                    isError = state.showValidationErrors &&
                        (state.editEvent.cancellationRefundHours ?: 0) < 0,
                    supportingText = if (
                        state.showValidationErrors &&
                        (state.editEvent.cancellationRefundHours ?: 0) < 0
                    ) {
                        "Enter 0 or more hours."
                    } else {
                        "Use 0 to allow refunds until the event starts."
                    },
                )
            }
        },
    )
}

@Composable
private fun ManualPaymentSettingsSection(
    event: Event,
    onEditEvent: (Event.() -> Event) -> Unit,
    showValidationErrors: Boolean,
) {
    val manualPaymentsEnabled = event.usesManualRegistrationPayments()
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
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
                showValidationErrors = showValidationErrors,
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
        )
    }
}

@Composable
private fun ManualPaymentLinkEditor(
    index: Int,
    link: ManualPaymentLink,
    onChange: (ManualPaymentLink) -> Unit,
    onRemove: () -> Unit,
    showValidationErrors: Boolean,
) {
    val linkError = manualPaymentLinkError(link)
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            ManualPaymentProviderSelector(
                selectedValue = normalizeManualPaymentProvider(link.provider),
                onSelectionChange = { provider ->
                    val currentProvider = normalizeManualPaymentProvider(link.provider)
                    val normalizedProvider = normalizeManualPaymentProvider(provider)
                    val providerChanged = normalizedProvider != currentProvider
                    val nextLabel = if (
                        link.label.isBlank() ||
                        link.label == manualPaymentProviderLabel(currentProvider)
                    ) {
                        manualPaymentProviderLabel(normalizedProvider)
                    } else {
                        link.label
                    }
                    onChange(
                        link.copy(
                            provider = normalizedProvider,
                            label = nextLabel,
                            url = if (providerChanged) "" else link.url,
                        )
                    )
                },
                modifier = Modifier.weight(1f),
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
                label = "${manualPaymentProviderInputLabel(link.provider)} *",
                placeholder = manualPaymentProviderInputPlaceholder(link.provider),
                isError = showValidationErrors && linkError != null,
                supportingText = if (showValidationErrors) linkError.orEmpty() else "",
            )
        }
    }
}

@Composable
private fun ManualPaymentProviderSelector(
    selectedValue: String,
    onSelectionChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "Provider",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            manualPaymentProviderOptions.forEach { provider ->
                val normalizedProvider = normalizeManualPaymentProvider(provider)
                val selected = normalizeManualPaymentProvider(selectedValue) == normalizedProvider
                OutlinedButton(
                    onClick = { onSelectionChange(normalizedProvider) },
                    modifier = Modifier
                        .width(76.dp)
                        .height(44.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                    border = BorderStroke(
                        width = if (selected) 2.dp else 1.dp,
                        color = if (selected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.outline
                        },
                    ),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (selected) {
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
                        } else {
                            MaterialTheme.colorScheme.surface
                        },
                    ),
                ) {
                    ProviderMark(
                        provider = normalizedProvider,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(24.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ProviderMark(
    provider: String,
    modifier: Modifier = Modifier,
) {
    when (normalizeManualPaymentProvider(provider)) {
        MANUAL_PAYMENT_PROVIDER_CASH_APP -> {
            Icon(
                imageVector = MVPIcons.PaymentProviderCashApp,
                contentDescription = manualPaymentProviderLabel(provider),
                modifier = modifier,
                tint = Color.Unspecified,
            )
            return
        }
        MANUAL_PAYMENT_PROVIDER_STRIPE -> {
            Icon(
                imageVector = MVPIcons.PaymentProviderStripe,
                contentDescription = manualPaymentProviderLabel(provider),
                modifier = modifier,
                tint = Color.Unspecified,
            )
            return
        }
        MANUAL_PAYMENT_PROVIDER_ZELLE -> {
            Icon(
                imageVector = MVPIcons.PaymentProviderZelle,
                contentDescription = manualPaymentProviderLabel(provider),
                modifier = modifier,
                tint = Color.Unspecified,
            )
            return
        }
    }

    val drawable = manualPaymentProviderDrawable(provider)
    if (drawable != null) {
        Image(
            painter = painterResource(drawable),
            contentDescription = manualPaymentProviderLabel(provider),
            modifier = modifier,
        )
    } else {
        Icon(
            imageVector = Icons.Default.Link,
            contentDescription = manualPaymentProviderLabel(provider),
            modifier = modifier,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun manualPaymentProviderDrawable(provider: String): DrawableResource? {
    return when (normalizeManualPaymentProvider(provider)) {
        MANUAL_PAYMENT_PROVIDER_VENMO -> Res.drawable.payment_provider_venmo
        MANUAL_PAYMENT_PROVIDER_PAYPAL -> Res.drawable.payment_provider_paypal
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
