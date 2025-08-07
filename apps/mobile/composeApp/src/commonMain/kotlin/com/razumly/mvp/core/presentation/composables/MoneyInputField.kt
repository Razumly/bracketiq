package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.util.MoneyInputUtils

@Composable
fun MoneyInputField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "Amount",
    placeholder: String = "0.00",
    isError: Boolean = false,
    supportingText: String = "",
    enabled: Boolean = true,
    readOnly: Boolean = false
) {
    PlatformTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        label = label,
        placeholder = placeholder,
        keyboardType = "money",
        isError = isError,
        supportingText = supportingText,
        enabled = enabled,
        readOnly = readOnly,
        inputFilter = MoneyInputUtils::moneyInputFilter
    ) { }
}
