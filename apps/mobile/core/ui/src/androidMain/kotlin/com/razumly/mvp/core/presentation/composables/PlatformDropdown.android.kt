package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
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
    containerColor: Color?,
) {
    var expanded by remember { mutableStateOf(false) }
    var fieldWidthPx by remember { mutableStateOf(0) }
    val density = LocalDensity.current

    val displayValue = dropdownDisplayText(
        selectedValue = selectedValue,
        selectedValues = selectedValues,
        options = options,
        multiSelect = multiSelect,
    ).ifBlank { placeholder }

    Box(modifier = modifier) {
        StandardTextField(
            value = displayValue,
            onValueChange = { },
            modifier = Modifier
                .fillMaxWidth()
                .onSizeChanged { size -> fieldWidthPx = size.width },
            label = label,
            placeholder = placeholder,
            isError = isError,
            supportingText = supportingText,
            enabled = enabled,
            readOnly = true,
            onTap = {
                if (enabled) {
                    expanded = true
                }
            },
            trailingIcon = {
                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
            },
            leadingIcon = leadingIcon,
            height = height,
            contentPadding = contentPadding,
            containerColor = containerColor,
        )

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = if (fieldWidthPx > 0) {
                Modifier.width(with(density) { fieldWidthPx.toDp() })
            } else {
                Modifier.fillMaxWidth()
            },
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
