package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.normalizeDivisionLabels
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown

@Composable
fun MultiSelectDropdownField(
    selectedItems: List<String>,
    label: String,
    modifier: Modifier = Modifier,
    isError: Boolean,
    errorMessage: String?,
    onSelectionChange: (List<String>) -> Unit,
) {
    val normalizedSelection = selectedItems.normalizeDivisionLabels()
    val divisionOptions = (DEFAULT_DIVISION_OPTIONS + normalizedSelection).distinct().map { division ->
        DropdownOption(
            value = division,
            label = division
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
            onSelectionChange(values.normalizeDivisionLabels())
        },
        isError = isError,
        supportingText = errorMessage ?: "",
        modifier = modifier.fillMaxWidth()
    )
}
