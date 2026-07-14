package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp

@Composable
expect fun PlatformDropdown(
    selectedValue: String,
    onSelectionChange: (String) -> Unit,
    options: List<DropdownOption>,
    modifier: Modifier = Modifier,
    label: String = "",
    placeholder: String = "",
    isError: Boolean = false,
    supportingText: String = "",
    enabled: Boolean = true,
    multiSelect: Boolean = false,
    selectedValues: List<String> = emptyList(),
    onMultiSelectionChange: (List<String>) -> Unit = {},
    leadingIcon: @Composable (() -> Unit)? = null,
    height: Dp? = null,
    contentPadding: PaddingValues? = null,
    containerColor: Color? = null,
)

data class DropdownOption(
    val value: String,
    val label: String,
    val enabled: Boolean = true
)

internal fun dropdownDisplayText(
    selectedValue: String,
    selectedValues: List<String>,
    options: List<DropdownOption>,
    multiSelect: Boolean,
): String {
    val labelsByValue = options.associate { option -> option.value to option.label }
    return if (multiSelect) {
        selectedValues
            .map { value -> labelsByValue[value] ?: value }
            .filter(String::isNotBlank)
            .joinToString(", ")
    } else {
        selectedValue
            .takeIf(String::isNotBlank)
            ?.let { value -> labelsByValue[value] ?: value }
            .orEmpty()
    }
}
