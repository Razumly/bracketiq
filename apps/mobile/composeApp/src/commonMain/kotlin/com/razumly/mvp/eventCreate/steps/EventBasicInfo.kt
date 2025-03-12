package com.razumly.mvp.eventCreate.steps

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import com.razumly.mvp.core.presentation.util.dateTimeFormat
import com.razumly.mvp.core.util.CurrencyAmountInputVisualTransformation
import com.razumly.mvp.eventCreate.CreateEventComponent
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.entry_fee
import mvp.composeapp.generated.resources.event_description
import mvp.composeapp.generated.resources.event_name
import mvp.composeapp.generated.resources.free_entry_hint
import mvp.composeapp.generated.resources.invalid_price
import mvp.composeapp.generated.resources.max_players
import mvp.composeapp.generated.resources.team_size_limit
import mvp.composeapp.generated.resources.value_too_low
import network.chaintech.kmp_date_time_picker.ui.datetimepicker.WheelDateTimePickerDialog
import network.chaintech.kmp_date_time_picker.utils.now
import org.jetbrains.compose.resources.stringResource

@Composable
fun EventBasicInfo(modifier: Modifier, component: CreateEventComponent, isCompleted: (Boolean) -> Unit) {
    val eventState by component.newEventState.collectAsState()
    var price by remember { mutableStateOf("") }
    var showPriceError by remember { mutableStateOf(false) }
    var teamSizeLimit by remember { mutableStateOf("") }
    var showTeamSizeLimitError by remember { mutableStateOf(false) }
    var maxPlayers by remember { mutableStateOf("") }
    var showMaxPlayersError by remember { mutableStateOf(false) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var startDateSelected by remember { mutableStateOf(false) }
    var endDateSelected by remember { mutableStateOf(false) }
    var selectedDivisions by remember { mutableStateOf(emptyList<Division>()) }

    val formValid by remember(eventState, price, showPriceError) {
        mutableStateOf(
            eventState?.let { event ->
                event.name.isNotBlank()
                        && event.description.isNotBlank()
                        && startDateSelected
                        && endDateSelected
                        && event.teamSizeLimit != 0
                        && event.maxPlayers != 0
                        && (price.toDoubleOrNull() != null
                        && price.toDouble() >= 0
                        && !showPriceError)
            } ?: false
        )
    }

    // Trigger the isCompleted callback whenever the form validity changes.
    LaunchedEffect(formValid) {
        isCompleted(formValid)
    }

    if (showStartPicker) {
        DateTimePickerDialog(
            onDateTimeSelected = { selectedInstant ->
                component.updateEventField { copy(start = selectedInstant) }
                showStartPicker = false
                startDateSelected = true
            },
            onDismissRequest = { showStartPicker = false }
        )
    }

    // Similarly for the end date/time.
    if (showEndPicker) {
        DateTimePickerDialog(
            onDateTimeSelected = { selectedInstant ->
                component.updateEventField { copy(end = selectedInstant) }
                showEndPicker = false
                endDateSelected = true
            },
            onDismissRequest = { showEndPicker = false }
        )
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        eventState?.let { event ->
            OutlinedTextField(
                value = event.name,
                onValueChange = { input ->
                    component.updateEventField { copy(name = input) }
                },
                label = { Text(stringResource(Res.string.event_name)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = event.description,
                onValueChange = { input ->
                    component.updateEventField { copy(description = input) }
                },
                label = { Text(stringResource(Res.string.event_description)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DropdownField(
                    modifier = Modifier.weight(1.2f),
                    value = event.eventType.name,
                    label = "Event Type"
                ) { dismiss ->
                    EventType.entries.forEach { eventType ->
                        DropdownMenuItem(
                            onClick = {
                                dismiss()
                                component.selectEventType(eventType)
                                component.updateEventField { copy(eventType = eventType) }
                            },
                            text = { Text(text = eventType.name) }
                        )
                    }
                }
                DropdownField(
                    modifier = Modifier.weight(1f),
                    value = event.fieldType.name,
                    label = "Field Type",
                ) { dismiss ->
                    FieldType.entries.forEach { fieldType ->
                        DropdownMenuItem(
                            onClick = {
                                dismiss()
                                component.updateEventField { copy(fieldType = fieldType) }
                            },
                            text = { Text(text = fieldType.name) }
                        )
                    }
                }

                MultiSelectDropdownField(
                    selectedItems = selectedDivisions,
                    label = "Skill levels",
                    modifier = Modifier.weight(1f)
                ) { newSelection ->
                    selectedDivisions = newSelection
                    component.updateEventField { copy(divisions = selectedDivisions) }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    NumberInputField(
                        value = price,
                        label = stringResource(Res.string.entry_fee),
                        onValueChange = { newValue ->
                            price = newValue
                            showPriceError = false
                            newValue.toDoubleOrNull()?.let { amount ->
                                if (amount >= 0) {
                                    component.updateEventField { copy(price = amount/100) }
                                } else {
                                    showPriceError = true
                                }
                            } ?: run { showPriceError = true }
                        },
                        isError = showPriceError,
                        errorMessage = stringResource(Res.string.invalid_price),
                        modifier = Modifier.fillMaxWidth(),
                        isMoney = true,
                        supportingText = stringResource(Res.string.free_entry_hint)
                    )
                }
                NumberInputField(
                    value = teamSizeLimit,
                    label = stringResource(Res.string.team_size_limit),
                    onValueChange = { newValue ->
                        teamSizeLimit = newValue
                        showTeamSizeLimitError = false
                        newValue.toIntOrNull()?.let { amount ->
                            if (amount > 0) {
                                component.updateEventField { copy(teamSizeLimit = amount) }
                            } else {
                                showTeamSizeLimitError = true
                            }
                        } ?: run { showTeamSizeLimitError = true }
                    },
                    isError = showTeamSizeLimitError,
                    errorMessage = stringResource(Res.string.value_too_low),
                    modifier = Modifier.weight(1f),
                    isMoney = false,
                    supportingText = "2-6"
                )
                NumberInputField(
                    value = maxPlayers,
                    label = stringResource(Res.string.max_players),
                    onValueChange = { newValue ->
                        maxPlayers = newValue
                        showMaxPlayersError = false
                        newValue.toIntOrNull()?.let { amount ->
                            if (amount > 0) {
                                component.updateEventField { copy(maxPlayers = amount) }
                            } else {
                                showMaxPlayersError = true
                            }
                        } ?: run { showMaxPlayersError = true }
                    },
                    isError = showMaxPlayersError,
                    errorMessage = stringResource(Res.string.value_too_low),
                    modifier = Modifier.weight(1f),
                    isMoney = false,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ){
                OutlinedTextField(
                    value = event.start.toLocalDateTime(TimeZone.currentSystemDefault()).format(
                        dateTimeFormat
                    ),
                    onValueChange = {},
                    label = { Text("Start Date & Time") },
                    readOnly = true,
                    modifier = Modifier.weight(1f),
                    interactionSource = remember { MutableInteractionSource() }
                        .also { interactionSource ->
                            LaunchedEffect(interactionSource) {
                                interactionSource.interactions.collect {
                                    if (it is PressInteraction.Release) {
                                        showStartPicker = true
                                    }
                                }
                            }
                        },
                    singleLine = true
                )

                OutlinedTextField(
                    value = event.end.toLocalDateTime(TimeZone.currentSystemDefault()).format(
                        dateTimeFormat
                    ),
                    onValueChange = { },
                    label = { Text("End Date & Time") },
                    readOnly = true,
                    modifier = Modifier.weight(1f),
                    interactionSource = remember { MutableInteractionSource() }
                        .also { interactionSource ->
                            LaunchedEffect(interactionSource) {
                                interactionSource.interactions.collect {
                                    if (it is PressInteraction.Release) {
                                        showEndPicker = true
                                    }
                                }
                            }
                        },
                    singleLine = true
                )
            }
        }
    }
}

@Composable
fun DateTimePickerDialog(
    onDateTimeSelected: (Instant) -> Unit,
    onDismissRequest: () -> Unit
) {
    WheelDateTimePickerDialog(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 22.dp, bottom = 26.dp),
        title = "DUE DATE",
        doneLabel = "Done",
        rowCount = 5,
        height = 180.dp,
        shape = RoundedCornerShape(18.dp),
        onDoneClick = {
            onDateTimeSelected(it.toInstant(TimeZone.currentSystemDefault()))
        },
        onDismiss = {
            onDismissRequest()
        },
        showDatePicker = true,
        minDate = LocalDateTime.now(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DropdownField(
    modifier: Modifier,
    value: String,
    label: String,
    content: @Composable (onDismiss: () -> Unit) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        modifier = modifier,
        expanded = expanded,
        onExpandedChange = { state -> expanded = state }
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = {
                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
            },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryEditable, true)
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            content { expanded = false }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MultiSelectDropdownField(
    selectedItems: List<Division>,
    label: String,
    modifier: Modifier = Modifier,
    onSelectionChange: (List<Division>) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    // Create a comma-separated string of selected division names.
    val displayText = if (selectedItems.isEmpty()) {
        ""
    } else {
        selectedItems.joinToString(", ") { it.name }
    }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = displayText,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text(label, maxLines = 1) },
            trailingIcon = {
                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
            },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryEditable, true)
                .fillMaxWidth()
                .clickable { expanded = !expanded }
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            Division.entries.forEach { division ->
                DropdownMenuItem(
                    onClick = {
                        // Toggle selection without dismissing the menu.
                        val current = selectedItems.toMutableList()
                        if (current.contains(division)) {
                            current.remove(division)
                        } else {
                            current.add(division)
                        }
                        onSelectionChange(current)
                    },
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Checkbox(
                                checked = selectedItems.contains(division),
                                onCheckedChange = { checked ->
                                    val current = selectedItems.toMutableList()
                                    if (checked) {
                                        current.add(division)
                                    } else {
                                        current.remove(division)
                                    }
                                    onSelectionChange(current)
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(text = division.name)
                        }
                    }
                )
            }
        }
    }
}

@Composable
fun NumberInputField(
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    isError: Boolean,
    isMoney: Boolean,
    errorMessage: String? = null,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Number,
    supportingText: String? = null
) {
    Column(modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label, maxLines = 1) },
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = ImeAction.Done
            ),
            singleLine = true,
            isError = isError,
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = if (isMoney) CurrencyAmountInputVisualTransformation() else VisualTransformation.None,
            supportingText = {
                if (supportingText != null) {
                    Text(supportingText)
                }
            }
        )
        if (isError && errorMessage != null) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(start = 8.dp, top = 4.dp)
            )
        }
    }
}