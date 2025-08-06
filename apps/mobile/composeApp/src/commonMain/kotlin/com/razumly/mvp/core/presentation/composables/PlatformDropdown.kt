package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
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
    contentPadding: PaddingValues? = null
)

data class DropdownOption(
    val value: String,
    val label: String,
    val enabled: Boolean = true
)
