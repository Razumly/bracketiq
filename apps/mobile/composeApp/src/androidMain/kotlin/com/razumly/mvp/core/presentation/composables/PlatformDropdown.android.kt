package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
actual fun PlatformDropdown(
    selectedValue: String,
    onSelectionChange: (String) -> Unit,
    options: List<DropdownOption>,
    modifier: Modifier,
    label: String,
    placeholder: String,
    isError: Boolean,
    supportingText: String,
    enabled: Boolean,
    multiSelect: Boolean,
    selectedValues: List<String>,
    onMultiSelectionChange: (List<String>) -> Unit,
    leadingIcon: @Composable (() -> Unit)?,
    height: Dp?,
    contentPadding: PaddingValues?,
) {
    var expanded by remember { mutableStateOf(false) }

    val displayValue = when {
        multiSelect -> {
            if (selectedValues.isEmpty()) {
                placeholder
            } else {
                selectedValues.mapNotNull { value ->
                    options.find { it.value == value }?.label
                }.joinToString(", ")
            }
        }
        selectedValue.isNotEmpty() -> {
            options.find { it.value == selectedValue }?.label ?: selectedValue
        }
        else -> placeholder
    }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it && enabled },
        modifier = modifier
    ) {
        PlatformTextField(
            value = displayValue,
            onValueChange = { },
            readOnly = true,
            label = label,
            placeholder = placeholder,
            isError = isError,
            supportingText = supportingText,
            enabled = enabled,
            leadingIcon = leadingIcon,
            height = height,
            contentPadding = contentPadding,
            trailingIcon = {
                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
            },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, true)
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            if (multiSelect) {
                // Multi-select dropdown items
                options.forEach { option ->
                    val isSelected = selectedValues.contains(option.value)

                    DropdownMenuItem(
                        onClick = {
                            val newSelection = if (isSelected) {
                                selectedValues - option.value
                            } else {
                                selectedValues + option.value
                            }
                            onMultiSelectionChange(newSelection)
                            // Don't close dropdown for multi-select
                        },
                        enabled = option.enabled,
                        text = {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Checkbox(
                                    checked = isSelected,
                                    onCheckedChange = { checked ->
                                        val newSelection = if (checked) {
                                            selectedValues + option.value
                                        } else {
                                            selectedValues - option.value
                                        }
                                        onMultiSelectionChange(newSelection)
                                    },
                                    enabled = option.enabled
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(text = option.label)
                            }
                        },
                        contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                    )
                }
            } else {
                // Single-select dropdown items
                options.forEach { option ->
                    DropdownMenuItem(
                        onClick = {
                            onSelectionChange(option.value)
                            expanded = false
                        },
                        enabled = option.enabled,
                        text = {
                            Text(text = option.label)
                        },
                        contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                    )
                }
            }
        }
    }
}
