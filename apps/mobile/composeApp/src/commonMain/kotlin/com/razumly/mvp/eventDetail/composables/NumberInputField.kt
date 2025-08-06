package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import com.razumly.mvp.core.presentation.composables.PlatformTextField
import com.razumly.mvp.core.util.CurrencyAmountInputVisualTransformation

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
            enabled = enabled,
            label = label,
            keyboardType = "number",
            isError = isError,
            modifier = Modifier.fillMaxWidth(.5f),
            supportingText =
                if (isError && errorMessage != null) {
                        errorMessage
                }
                else supportingText ?: ""
            ,
            placeholder = placeholder ?: ""


        )
    }
}