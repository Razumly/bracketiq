package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifiers
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown

data class DivisionOption(
    val value: String,
    val label: String,
)

@Composable
fun MultiSelectDropdownField(
    selectedItems: List<String>,
    label: String,
    options: List<DivisionOption> = emptyList(),
    modifier: Modifier = Modifier,
    isError: Boolean,
    errorMessage: String?,
    onSelectionChange: (List<String>) -> Unit,
) {
    val normalizedSelection = selectedItems.normalizeDivisionIdentifiers()
    val mergedOptions = linkedMapOf<String, String>()
    (options + DEFAULT_DIVISION_OPTIONS.map { division ->
        DivisionOption(value = division, label = division.toDivisionDisplayLabel())
    } + normalizedSelection.map { division ->
        DivisionOption(value = division, label = division.toDivisionDisplayLabel())
    }).forEach { option ->
        val normalizedValue = option.value.normalizeDivisionIdentifier()
        if (normalizedValue.isNotEmpty()) {
            mergedOptions[normalizedValue] = option.label.ifBlank { normalizedValue.toDivisionDisplayLabel() }
        }
    }

    val divisionOptions = mergedOptions.entries.map { (value, optionLabel) ->
        DropdownOption(
            value = value,
            label = optionLabel,
        )
    }

    PlatformDropdown(
        selectedValue = "", // Not used for multi-select
        onSelectionChange = {}, // Not used for multi-select
        options = divisionOptions,
        label = label,
        multiSelect = true,
        selectedValues = normalizedSelection,
        onMultiSelectionChange = { values ->
            onSelectionChange(values.normalizeDivisionIdentifiers())
        },
        isError = isError,
        supportingText = errorMessage ?: "",
        modifier = modifier.fillMaxWidth()
    )
}
