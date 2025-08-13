package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.presentation.composables.PlatformTextField

@Composable
fun NumberInputField(
    modifier: Modifier = Modifier,
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    isError: Boolean,
    errorMessage: String? = null,
    supportingText: String? = null,
    placeholder: String? = null,
    enabled: Boolean = true
) {
    Column(modifier = modifier) {
        PlatformTextField(
            value = if (value == "0") "" else value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(.5f),
            label = label,
            placeholder = placeholder ?: "",
            keyboardType = "number",
            isError = isError,
            supportingText =
                if (isError && errorMessage != null) {
                        errorMessage
                }
                else supportingText ?: ""
            ,
            enabled = enabled
        )
    }
}