package com.razumly.mvp.eventCreate.steps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.enums.EventTypes
import com.razumly.mvp.core.data.dataTypes.enums.FieldTypes
import com.razumly.mvp.eventCreate.CreateEventComponent
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.entry_fee
import mvp.composeapp.generated.resources.free_entry_hint
import mvp.composeapp.generated.resources.invalid_price
import mvp.composeapp.generated.resources.tournament_description
import mvp.composeapp.generated.resources.tournament_name
import org.jetbrains.compose.resources.stringResource


@Composable
fun Step1(component: CreateEventComponent) {
    val eventState by component.newEventState.collectAsState()
    var price by remember { mutableStateOf("") }
    var showPriceError by remember { mutableStateOf(false) }
    var fieldTypeExpanded by remember { mutableStateOf(false) }
    var eventTypeExpanded by remember { mutableStateOf(false) }

    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        eventState?.let {
            DropdownMenu(
                expanded = eventTypeExpanded,
                onDismissRequest = { eventTypeExpanded = false },
                modifier = Modifier.fillMaxWidth()
            ) {
                EventTypes.entries.forEach { eventType ->
                    DropdownMenuItem(
                        onClick = {
                            eventTypeExpanded = false
                            component.selectEventType(eventType)
                        },
                        text = { Text(text = eventType.name) }
                    )
                }
            }
            OutlinedTextField(
                value = it.name,
                onValueChange = { input ->
                    component.updateEventField { copy(name = input) }
                },
                label = { Text(stringResource(Res.string.tournament_name)) },
                modifier = Modifier.fillMaxWidth()
            )

            it.description?.let { it1 ->
                OutlinedTextField(
                    value = it1,
                    onValueChange = { input ->
                        component.updateEventField { copy(description = input) }
                    },
                    label = { Text(stringResource(Res.string.tournament_description)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
            }
            DropdownMenu(
                expanded = fieldTypeExpanded,
                onDismissRequest = { fieldTypeExpanded = false },
                modifier = Modifier.fillMaxWidth()
            ) {
                FieldTypes.entries.forEach { fieldType ->
                    DropdownMenuItem(
                        onClick = {
                            fieldTypeExpanded = false
                            component.updateEventField { copy(fieldType = fieldType) }
                        },
                        text = { Text(text = fieldType.name) }
                    )
                }
            }

            OutlinedTextField(
                value = price,
                onValueChange = {
                    price = it
                    showPriceError = false
                    it.toDoubleOrNull()?.let { amount ->
                        if (amount >= 0) {
                            component.updateEventField { copy(price = amount) }
                        } else {
                            showPriceError = true
                        }
                    } ?: run {
                        showPriceError = true
                    }
                },
                label = { Text(stringResource(Res.string.entry_fee)) },
                leadingIcon = { Text("$") },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Decimal,
                    imeAction = ImeAction.Done
                ),
                isError = showPriceError,
                modifier = Modifier.fillMaxWidth(),
            )

            if (showPriceError) {
                Text(
                    text = stringResource(Res.string.invalid_price),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 16.dp, top = 4.dp)
                )
            }

            Text(
                text = stringResource(Res.string.free_entry_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
