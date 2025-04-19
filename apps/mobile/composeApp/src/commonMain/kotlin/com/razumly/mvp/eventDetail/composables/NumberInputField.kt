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
import com.razumly.mvp.core.util.CurrencyAmountInputVisualTransformation

@Composable
fun NumberInputField(
    modifier: Modifier = Modifier,
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    isError: Boolean,
    isMoney: Boolean,
    errorMessage: String? = null,
    keyboardType: KeyboardType = KeyboardType.Number,
    supportingText: String? = null,
    placeholder: String? = null,
) {
    Column(modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label, maxLines = 1) },
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = ImeAction.Done
            ),
            singleLine = true,
            isError = isError,
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = if (isMoney) CurrencyAmountInputVisualTransformation() else VisualTransformation.None,
            supportingText = {
                if (isError && errorMessage != null) {
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                else if (supportingText != null) {
                    Text(supportingText)
                }
            },
            placeholder = {
                if (placeholder != null) {
                    Text(placeholder)
                }
            }
        )
    }
}